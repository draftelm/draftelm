import type { ManufacturerCode, MaterialSpecification, EdgeTreatment, SurfaceFinish, StockOrientation, ProcessMetadata, ManufacturingProperty } from "./types";
import { manufacturingFingerprint } from "./canonical";

export type CatalogueKind = "material" | "edge-treatment" | "finish";
interface Codes { manufacturerCodes: ManufacturerCode[]; supplierCodes: { supplierId: string; code: string }[] }
export type CatalogueDefinition = Codes & (
  | { kind: "material"; stockMaterialId: string; grade?: string | null; nominalThicknessMm?: number; appearance?: string; orientation?: StockOrientation }
  | { kind: "edge-treatment"; treatmentKind: "edge-band" | "lipping" | "other"; specificationId?: string; materialId?: string; nominalThicknessMm?: number; appearance?: string; process?: ProcessMetadata }
  | { kind: "finish"; specificationId: string; appearance?: string; process?: ProcessMetadata }
);
export interface CatalogueEntry {
  id: string; version: number; name: string; kind: CatalogueKind;
  owner: { kind: "project" | "company"; id: string };
  syntheticExample: boolean;
  specification:
    | { status: "unassigned"; reason: string }
    | { status: "provisional"; value: CatalogueDefinition; reason: string }
    | { status: "verified"; value: CatalogueDefinition; verification: { subjectFingerprint: string; evidenceRefs: string[]; reviewedBy: string } };
}
export interface ManufacturingCatalogue { schemaVersion: 1; id: string; entries: CatalogueEntry[] }
/** A pinned snapshot makes saved properties independent of later local library edits. */
export interface CatalogueReference { catalogueId: string; fingerprint: string; entry: CatalogueEntry }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shape = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => object(v) && required.every(k => k in v) && Object.keys(v).every(k => [...required, ...optional].includes(k));
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 1000 && !/[\x00-\x1f\x7f]/.test(v);
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
const codes = (v: unknown, owner: string) => Array.isArray(v) && v.every(c => shape(c, [owner, "code"]) && text(c[owner]) && text(c.code)) && unique(v.map(c => c[owner]));
const process = (v: unknown) => shape(v, ["specificationId", "notes"]) && text(v.specificationId) && Array.isArray(v.notes) && v.notes.every(text);
const orientation = (v: unknown) => shape(v, ["kind"]) && v.kind === "non-directional" || shape(v, ["kind", "along", "reversalAllowed"]) && v.kind === "directional" && ["u", "v"].includes(String(v.along)) && typeof v.reversalAllowed === "boolean";
export function catalogueEntrySubject(entry: Pick<CatalogueEntry, "id" | "version" | "name" | "kind" | "owner" | "syntheticExample">, definition: CatalogueDefinition): string {
  return manufacturingFingerprint({ policy: "manufacturing-catalogue-entry-1", id: entry.id, version: entry.version, name: entry.name, kind: entry.kind, owner: entry.owner, syntheticExample: entry.syntheticExample, definition });
}
export function validateCatalogueEntry(input: unknown): string[] {
  try { manufacturingFingerprint(input); } catch { return ["Catalogue entries require finite plain JSON."]; }
  if (!shape(input, ["id", "version", "name", "kind", "owner", "syntheticExample", "specification"]) || !text(input.id) || !text(input.name) || !Number.isSafeInteger(input.version) || Number(input.version) < 1 || !["material", "edge-treatment", "finish"].includes(String(input.kind)) || !shape(input.owner, ["kind", "id"]) || !["project", "company"].includes(String(input.owner.kind)) || !text(input.owner.id) || typeof input.syntheticExample !== "boolean") return ["Invalid catalogue identity, owner, version or example state."];
  const p = input.specification;
  if (shape(p, ["status", "reason"]) && p.status === "unassigned" && text(p.reason)) return [];
  if (!object(p) || !["provisional", "verified"].includes(String(p.status)) || !shape(p, ["status", "value", p.status === "verified" ? "verification" : "reason"])) return ["Catalogue definition requires an explicit unknown, provisional or verified state."];
  const d = p.value;
  const common = ["kind", "manufacturerCodes", "supplierCodes"], optional = ["nominalThicknessMm", "appearance"];
  const ok = object(d) && d.kind === input.kind && codes(d.manufacturerCodes, "manufacturerId") && codes(d.supplierCodes, "supplierId") && (d.nominalThicknessMm === undefined || positive(d.nominalThicknessMm)) && (d.appearance === undefined || text(d.appearance)) && (
    d.kind === "material" && shape(d, [...common, "stockMaterialId"], [...optional, "grade", "orientation"]) && text(d.stockMaterialId) && (d.grade === undefined || d.grade === null || text(d.grade)) && (d.orientation === undefined || orientation(d.orientation)) ||
    d.kind === "edge-treatment" && shape(d, [...common, "treatmentKind"], [...optional, "specificationId", "materialId", "process"]) && ["edge-band", "lipping", "other"].includes(String(d.treatmentKind)) && (d.specificationId === undefined || text(d.specificationId)) && (d.materialId === undefined || text(d.materialId)) && (d.process === undefined || process(d.process)) ||
    d.kind === "finish" && shape(d, [...common, "specificationId"], ["appearance", "process"]) && text(d.specificationId) && (d.process === undefined || process(d.process)));
  if (!ok) return ["Invalid catalogue definition or unsupported fields; unknown attributes must be omitted."];
  if (p.status === "provisional" && !text(p.reason)) return ["Provisional catalogue definitions require a reason."];
  if (p.status === "verified") {
    const v = p.verification;
    if (!shape(v, ["subjectFingerprint", "evidenceRefs", "reviewedBy"]) || v.subjectFingerprint !== catalogueEntrySubject(input as unknown as CatalogueEntry, d as unknown as CatalogueDefinition) || !Array.isArray(v.evidenceRefs) || !v.evidenceRefs.length || !v.evidenceRefs.every(text) || !unique(v.evidenceRefs) || !text(v.reviewedBy)) return ["Catalogue verification belongs to another definition/version or lacks supplied evidence."];
  }
  return [];
}
export function parseManufacturingCatalogue(value: string): ManufacturingCatalogue {
  const parsed: unknown = JSON.parse(value);
  if (!shape(parsed, ["schemaVersion", "id", "entries"]) || parsed.schemaVersion !== 1 || !text(parsed.id) || !Array.isArray(parsed.entries) || parsed.entries.length > 200) throw new Error("Unsupported manufacturing catalogue.");
  const entries = parsed.entries as CatalogueEntry[], identities = entries.map(e => object(e) ? manufacturingFingerprint([e.owner, e.id, e.version]) : "invalid");
  if (!unique(identities) || entries.some(e => validateCatalogueEntry(e).length)) throw new Error("Invalid catalogue entries, duplicate versions or unsupported approval fields.");
  return structuredClone(parsed as unknown as ManufacturingCatalogue);
}
export function appendCatalogueVersion(catalogue: ManufacturingCatalogue, entry: CatalogueEntry): ManufacturingCatalogue {
  const current = parseManufacturingCatalogue(JSON.stringify(catalogue));
  if (validateCatalogueEntry(entry).length) throw new Error(validateCatalogueEntry(entry).join(" "));
  const versions = current.entries.filter(e => e.id === entry.id && manufacturingFingerprint(e.owner) === manufacturingFingerprint(entry.owner));
  if (versions.some(e => e.version >= entry.version || e.kind !== entry.kind)) throw new Error("Create a higher version of this entry; existing versions cannot be overwritten or change kind.");
  return parseManufacturingCatalogue(JSON.stringify({ ...current, entries: [...current.entries, entry] }));
}
export const catalogueSnapshotFingerprint = (entry: CatalogueEntry) => manufacturingFingerprint({ policy: "catalogue-snapshot-1", entry });
export function catalogueReference(catalogueId: string, entry: CatalogueEntry): CatalogueReference {
  if (!text(catalogueId) || validateCatalogueEntry(entry).length || entry.specification.status === "unassigned") throw new Error("Select a valid assigned catalogue definition.");
  return { catalogueId, fingerprint: catalogueSnapshotFingerprint(entry), entry: structuredClone(entry) };
}
export function catalogueReferenceIssues(ref: unknown, kind: CatalogueKind): string[] {
  if (!shape(ref, ["catalogueId", "fingerprint", "entry"]) || !text(ref.catalogueId) || !object(ref.entry) || validateCatalogueEntry(ref.entry).length) return ["Invalid pinned catalogue reference."];
  const entry = ref.entry as unknown as CatalogueEntry;
  if (entry.kind !== kind || entry.specification.status === "unassigned" || ref.fingerprint !== catalogueSnapshotFingerprint(entry)) return ["Catalogue reference kind, version or definition fingerprint is stale."];
  return [];
}
export const catalogueReferenceLabel = (r: CatalogueReference) => `${encodeURIComponent(r.catalogueId)}/${r.entry.owner.kind}:${encodeURIComponent(r.entry.owner.id)}/${encodeURIComponent(r.entry.id)}@${r.entry.version}`;
/** Compare known catalogue requirements to the applied proposal. Evidence does
 * not authenticate a reviewer and never upgrades an occurrence to verified. */
export function catalogueValueIssues(value: MaterialSpecification | EdgeTreatment | SurfaceFinish, kind: CatalogueKind, thicknessMm?: number, stock?: ManufacturingProperty<StockOrientation>): string[] {
  if (!("catalogue" in value) || !value.catalogue) return [];
  const r = value.catalogue, issues = catalogueReferenceIssues(r, kind); if (issues.length) return issues;
  const d = r.entry.specification; if (d.status === "unassigned") return ["Unassigned catalogue reference."];
  const definition = d.value, get = <T>(p: ManufacturingProperty<T>): T | undefined => p.status === "unassigned" ? undefined : p.value;
  if (definition.kind === "material" && "stockMaterialId" in value) {
    if (value.stockMaterialId !== definition.stockMaterialId || value.description !== r.entry.name || manufacturingFingerprint(value.manufacturerCodes) !== manufacturingFingerprint(definition.manufacturerCodes) || definition.grade !== undefined && get(value.grade) !== definition.grade || definition.nominalThicknessMm !== undefined && thicknessMm !== undefined && thicknessMm !== definition.nominalThicknessMm || definition.orientation !== undefined && stock !== undefined && (!stock || stock.status === "unassigned" || manufacturingFingerprint(stock.value ?? null) !== manufacturingFingerprint(definition.orientation))) issues.push("Applied material contradicts its pinned catalogue definition or actual panel thickness/orientation constraint.");
  } else if (definition.kind === "edge-treatment" && "kind" in value && value.kind !== "specified") {
    if (value.kind !== definition.treatmentKind || value.specificationId !== definition.specificationId || get(value.nominalThicknessMm) !== definition.nominalThicknessMm || get(value.material)?.stockMaterialId !== definition.materialId || get(value.appearance) !== definition.appearance || manufacturingFingerprint(get(value.process) ?? null) !== manufacturingFingerprint(definition.process ?? null)) issues.push("Applied edge treatment contradicts its pinned catalogue definition.");
  } else if (definition.kind === "finish" && "kind" in value && value.kind === "specified") {
    if (value.specificationId !== definition.specificationId || manufacturingFingerprint(value.manufacturerCodes) !== manufacturingFingerprint(definition.manufacturerCodes) || get(value.appearance) !== definition.appearance || manufacturingFingerprint(get(value.process) ?? null) !== manufacturingFingerprint(definition.process ?? null)) issues.push("Applied finish contradicts its pinned catalogue definition.");
  } else issues.push("Catalogue reference cannot describe this property kind.");
  return issues;
}

export function collectCatalogueReferences(document: import("./types").PanelManufacturingDocument): CatalogueReference[] {
  const refs: CatalogueReference[] = [];
  for (const p of document.panels) {
    if (p.material.status !== "unassigned" && p.material.value.catalogue) refs.push(p.material.value.catalogue);
    for (const f of p.faces) if (f.finish.status !== "unassigned" && f.finish.value.kind === "specified" && f.finish.value.catalogue) refs.push(f.finish.value.catalogue);
    for (const e of p.edges) if (e.treatment.status !== "unassigned" && e.treatment.value.kind !== "none" && e.treatment.value.catalogue) refs.push(e.treatment.value.catalogue);
  }
  return [...new Map(refs.map(r => [manufacturingFingerprint([r.catalogueId, r.entry.owner, r.entry.id, r.entry.version]), r])).values()].sort((a, b) => catalogueReferenceLabel(a) < catalogueReferenceLabel(b) ? -1 : catalogueReferenceLabel(a) > catalogueReferenceLabel(b) ? 1 : 0);
}
export const hasSyntheticCatalogue = (document: import("./types").PanelManufacturingDocument) => collectCatalogueReferences(document).some(r => r.entry.syntheticExample);

/** Explicit local loads merge known versions, including pins from saved properties. */
export function mergeManufacturingCatalogue(current: ManufacturingCatalogue, incoming: ManufacturingCatalogue, pins: CatalogueReference[] = []): ManufacturingCatalogue {
  const a = parseManufacturingCatalogue(JSON.stringify(current)), b = parseManufacturingCatalogue(JSON.stringify(incoming));
  const entries = new Map<string, CatalogueEntry>();
  for (const e of [...(a.id === b.id ? a.entries : []), ...pins.filter(p => p.catalogueId === b.id).map(p => p.entry), ...b.entries]) {
    const key = manufacturingFingerprint([e.owner, e.id, e.version]), old = entries.get(key);
    if (old && catalogueSnapshotFingerprint(old) !== catalogueSnapshotFingerprint(e)) throw new Error("A known catalogue version has different content or evidence. Create a higher version instead of overwriting it.");
    entries.set(key, e);
  }
  return parseManufacturingCatalogue(JSON.stringify({ ...b, entries: [...entries.values()] }));
}
