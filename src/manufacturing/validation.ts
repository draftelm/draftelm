import type { FurnitureResult, PanelComponent } from "../furniture";
import type { ManufacturingDiagnostic, ManufacturingValidation, PanelManufacturingDocument, PanelManufacturingProperties } from "./types";
import { manufacturingFingerprint } from "./canonical";
import { EDGE_KEYS, FACE_KEYS, createPanelTopology, panelEdgeId, panelFaceId } from "./topology";
import { assertManufacturingSource, manufacturingSourceSnapshot, panelSourceSnapshot } from "./source";
import { propertySubjectFingerprint } from "./properties";
import { catalogueValueIssues } from "./catalogue";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const keys = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => object(v) && required.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k));
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 4096 && !/[\x00-\x1f\x7f]/.test(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const list = (v: unknown, check: (item: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.every(check);
const unique = (values: unknown[]) => new Set(values).size === values.length;
const codes = (v: unknown) => list(v, x => keys(x, ["manufacturerId", "code"]) && text(x.manufacturerId) && text(x.code)) && unique((v as { manufacturerId: string }[]).map(x => x.manufacturerId));
const materialShape = (v: unknown): v is Record<string, unknown> => keys(v, ["stockMaterialId", "manufacturerCodes", "grade"], ["description", "catalogue"]) && text(v.stockMaterialId) && codes(v.manufacturerCodes) && (v.description === undefined || text(v.description));
const process = (v: unknown) => keys(v, ["specificationId", "notes"]) && text(v.specificationId) && list(v.notes, text);
const grain = (v: unknown) => keys(v, ["direction"]) && v.direction === "non-directional" || keys(v, ["direction", "sense"]) && ["longitudinal", "transverse"].includes(String(v.direction)) && ["either", "positive", "negative"].includes(String(v.sense));
const stock = (v: unknown) => keys(v, ["kind"]) && v.kind === "non-directional" || keys(v, ["kind", "along", "reversalAllowed"]) && v.kind === "directional" && ["u", "v"].includes(String(v.along)) && typeof v.reversalAllowed === "boolean";
const matching = (v: unknown) => keys(v, ["kind"]) && v.kind === "independent" || keys(v, ["kind", "groupId", "faceId", "sequence", "originUvMm", "rotationDeg"]) && v.kind === "specified" && text(v.groupId) && text(v.faceId) && Number.isSafeInteger(v.sequence) && Number(v.sequence) >= 0 && keys(v.originUvMm, ["u", "v"]) && finite(v.originUvMm.u) && finite(v.originUvMm.v) && [0, 90, 180, 270].includes(Number(v.rotationDeg)) && typeof v.rotationDeg === "number";
const requirements = (v: unknown) => keys(v, ["decorative", "reverse", "visibleInService", "goodFaceRequirements"]) && [v.decorative, v.reverse, v.visibleInService].every(x => typeof x === "boolean") && list(v.goodFaceRequirements, x => keys(x, ["requirementId", "description"], ["manufacturerId"]) && text(x.requirementId) && text(x.description) && (x.manufacturerId === undefined || text(x.manufacturerId))) && unique((v.goodFaceRequirements as { requirementId: string }[]).map(x => x.requirementId));
const other = (v: unknown) => list(v, x => keys(x, ["requirementId", "specification"]) && text(x.requirementId) && text(x.specification)) && unique((v as { requirementId: string }[]).map(x => x.requirementId));

/** Accept unknown at the boundary. Structural validity, verification evidence
 * consistency and completeness are separate; none grants release approval. */
export function validatePanelManufacturingDocument(input: unknown, source: FurnitureResult): ManufacturingValidation {
  const diagnostics: ManufacturingDiagnostic[] = [];
  const add = (code: ManufacturingDiagnostic["code"], severity: "error" | "warning", message: string, componentId?: string, path?: string) => diagnostics.push({ code, severity, message, ...(componentId ? { componentId } : {}), ...(path ? { path } : {}) });
  const result = (): ManufacturingValidation => ({ valid: !diagnostics.some(d => d.severity === "error"), allPropertiesVerified: diagnostics.length === 0, diagnostics, manufacturingReady: false, approvedManufacturingData: false });
  try { assertManufacturingSource(source); } catch (e) { add("invalid-source", "error", e instanceof Error ? e.message : "Invalid manufacturing source."); return result(); }
  try { manufacturingFingerprint(input); } catch { add("invalid-schema", "error", "Manufacturing input must contain finite, plain JSON data only."); return result(); }
  if (!keys(input, ["schemaVersion", "binding", "panels", "manufacturingReady"]) || input.schemaVersion !== 1 || input.manufacturingReady !== false || !keys(input.binding, ["engineeringRevision", "sourceSnapshot", "resolverVersion"]) || input.binding.resolverVersion !== "panel-manufacturing-1" || !Array.isArray(input.panels)) {
    add("invalid-schema", "error", "Unsupported panel manufacturing document schema, binding or release flags."); return result();
  }
  if (input.binding.engineeringRevision !== source.specificationRevision || input.binding.sourceSnapshot !== manufacturingSourceSnapshot(source)) add("stale-source", "error", "Manufacturing document belongs to a different engineering revision or geometry/BOM snapshot.");
  const panels = source.components.filter((c): c is PanelComponent => c.kind === "panel");
  const ids = input.panels.map(p => object(p) ? p.componentId : undefined);
  if (ids.length !== panels.length || !unique(ids) || panels.some(p => !ids.includes(p.id))) add("invalid-reference", "error", "Every physical panel must have exactly one manufacturing property record; hardware and unknown IDs are not panel occurrences.");
  const catalogueVersions = new Map<string, string>();
  const matchingGroups = new Map<string, { componentId: string; sequence: number }[]>();
  for (const raw of input.panels) {
    const p = panels.find(p => object(raw) && p.id === raw.componentId);
    if (!p || !keys(raw, ["componentId", "assemblyId", "binding", "orientation", "material", "stockOrientation", "grain", "grainMatching", "faces", "edges", "otherRequirements"]) || !keys(raw.binding, ["engineeringRevision", "panelSnapshot", "orientationSnapshot"]) || !Array.isArray(raw.faces) || !Array.isArray(raw.edges)) { add("invalid-schema", "error", "Invalid panel property record or unsupported fields.", p?.id); continue; }
    const record = raw as unknown as PanelManufacturingProperties, id = p.id;
    if (record.assemblyId !== p.assemblyId || record.binding.engineeringRevision !== source.specificationRevision || record.binding.panelSnapshot !== panelSourceSnapshot(p) || record.binding.orientationSnapshot !== manufacturingFingerprint(record.orientation)) add("stale-panel", "error", "Panel dimensions, position, orientation, material, quantity or assembly binding changed; explicit review/rebinding is required.", id);
    try {
      if (!keys(raw.orientation, ["u", "v", "normal"]) || !Object.values(raw.orientation).every(a => keys(a, ["axis", "sign"]))) throw new Error("Invalid orientation shape.");
      createPanelTopology(p, record.orientation);
    } catch { add("invalid-reference", "error", "Physical local orientation does not resolve to this panel's rectangular geometry.", id, "orientation"); continue; }
    const field = (value: unknown, path: string, check: (v: unknown, path: string) => boolean): boolean => {
      if (!object(value) || !["unassigned", "provisional", "verified"].includes(String(value.status))) { add("invalid-schema", "error", "Property needs an explicit unassigned, provisional or verified state.", id, path); return false; }
      if (value.status === "unassigned") {
        if (!keys(value, ["status", "reason"]) || !text(value.reason)) { add("invalid-schema", "error", "Unassigned property needs a reason and cannot contain a value.", id, path); return false; }
        add("unresolved-property", "warning", value.reason as string, id, path); return true;
      }
      const provisional = value.status === "provisional";
      if (!keys(value, ["status", "value", provisional ? "reason" : "verification"]) || !check(value.value, path)) { add("invalid-schema", "error", "Invalid property value or unsupported specification fields.", id, path); return false; }
      if (provisional) {
        if (!text(value.reason)) { add("invalid-schema", "error", "Provisional values require a reason.", id, path); return false; }
        add("provisional-property", "warning", value.reason as string, id, path);
      } else {
        const v = value.verification;
        if (!keys(v, ["engineeringRevision", "subjectFingerprint", "evidenceRefs", "verifiedBy"]) || v.engineeringRevision !== source.specificationRevision || v.subjectFingerprint !== propertySubjectFingerprint(record, path, value.value) || !list(v.evidenceRefs, text) || !v.evidenceRefs.length || !unique(v.evidenceRefs) || !text(v.verifiedBy)) add("invalid-verification", "error", "Verification evidence is absent or belongs to another value, field, panel, orientation or revision.", id, path);
      }
      return true;
    };
    const catalogue = (v: unknown, kind: "material" | "edge-treatment" | "finish", path: string) => {
      const issues = catalogueValueIssues(v as Parameters<typeof catalogueValueIssues>[0], kind, path === "material" ? p.thickness : undefined, path === "material" ? record.stockOrientation : undefined);
      const ref = (v as { catalogue?: import("./catalogue").CatalogueReference }).catalogue;
      if (!issues.length && ref) { const key = manufacturingFingerprint([ref.catalogueId, ref.entry.owner, ref.entry.id, ref.entry.version]); if (catalogueVersions.has(key) && catalogueVersions.get(key) !== ref.fingerprint) issues.push("Conflicting definitions share the same catalogue identity/version."); catalogueVersions.set(key, ref.fingerprint); if (ref.entry.specification.status === "provisional") add("provisional-property", "warning", "Pinned library definition is provisional; supplied catalogue data is not panel approval.", id, `${path}/catalogue`); }
      issues.forEach(message => add("invalid-reference", "error", message, id, `${path}/catalogue`)); return !issues.length;
    };
    const material = (v: unknown, path: string): boolean => materialShape(v) && field(v.grade, `${path}/grade`, x => x === null || text(x)) && catalogue(v, "material", path);
    const finish = (v: unknown, path: string): boolean => {
      if (keys(v, ["kind"]) && v.kind === "none") return true;
      return keys(v, ["kind", "specificationId", "manufacturerCodes", "appearance", "process"], ["catalogue"]) && v.kind === "specified" && text(v.specificationId) && codes(v.manufacturerCodes) && field(v.appearance, `${path}/appearance`, x => x === null || text(x)) && field(v.process, `${path}/process`, x => x === null || process(x)) && catalogue(v, "finish", path);
    };
    const treatment = (v: unknown, path: string): boolean => {
      if (keys(v, ["kind"]) && v.kind === "none") return true;
      if (object(v) && v.specificationId === undefined) add("unresolved-property", "warning", "Treatment specification/code: Not specified. Generic treatment is incomplete.", id, `${path}/specificationId`);
      return keys(v, ["kind", "material", "nominalThicknessMm", "appearance", "process"], ["specificationId", "catalogue"]) && ["edge-band", "lipping", "other"].includes(String(v.kind)) && (v.specificationId === undefined || text(v.specificationId)) &&
        field(v.material, `${path}/material`, (x, childPath) => x === null || material(x, childPath)) && field(v.nominalThicknessMm, `${path}/nominalThicknessMm`, x => x === null ? v.kind === "other" : finite(x) && x > 0) &&
        field(v.appearance, `${path}/appearance`, x => x === null || text(x)) && field(v.process, `${path}/process`, x => x === null || process(x)) && catalogue(v, "edge-treatment", path);
    };
    const matOk = field(record.material, "material", material);
    field(record.stockOrientation, "stockOrientation", stock); field(record.grain, "grain", grain); field(record.grainMatching, "grainMatching", matching); field(record.otherRequirements, "otherRequirements", other);
    if (matOk && record.material.status !== "unassigned" && record.material.value.stockMaterialId !== p.materialId) add("incompatible-properties", "error", "A stock material replacement requires an engineering source change; metadata may refine the existing stock identity only.", id, "material");
    if (matOk && record.material.status === "verified" && p.materialId.startsWith("demo-")) add("incompatible-properties", "error", "Demonstration stock identities must remain provisional; select a real engineering stock specification before verification.", id, "material");
    const faceIds = FACE_KEYS.map(key => panelFaceId(id, key)), edgeIds = EDGE_KEYS.map(key => panelEdgeId(id, key));
    if (record.faces.length !== 2 || !unique(record.faces.map(f => f?.faceId)) || record.faces.some(f => !f || !faceIds.includes(f.faceId))) add("invalid-reference", "error", "Broad face references must cover A/B of this physical occurrence exactly once.", id, "faces");
    if (record.edges.length !== 4 || !unique(record.edges.map(e => e?.edgeId)) || record.edges.some(e => !e || !edgeIds.includes(e.edgeId))) add("invalid-reference", "error", "Treatment references must cover the four physical perimeter edges exactly once.", id, "edges");
    for (const f of record.faces) {
      if (!keys(f, ["faceId", "requirements", "finish"])) { add("invalid-schema", "error", "Invalid broad face property record.", id, "faces"); continue; }
      const path = `faces/${f.faceId}`;
      const ok = field(f.requirements, `${path}/requirements`, requirements); field(f.finish, `${path}/finish`, finish);
      if (ok && f.requirements.status !== "unassigned" && f.requirements.value.decorative && f.requirements.value.reverse) add("incompatible-properties", "error", "One broad face cannot simultaneously be the decorative and reverse face.", id, path);
    }
    for (const e of record.edges) {
      if (!keys(e, ["edgeId", "treatment"])) { add("invalid-schema", "error", "Invalid perimeter edge property record.", id, "edges"); continue; }
      field(e.treatment, `edges/${e.edgeId}/treatment`, treatment);
    }
    const reverse = record.faces.filter(f => f && object(f.requirements) && f.requirements.status !== "unassigned" && object(f.requirements.value) && f.requirements.value.reverse === true);
    if (reverse.length > 1) add("incompatible-properties", "error", "Both broad faces cannot be designated as the reverse face.", id, "faces");
    const match = object(record.grainMatching) && record.grainMatching.status !== "unassigned" ? record.grainMatching.value : undefined;
    if (match && matching(match) && match.kind === "specified") {
      if (!faceIds.includes(match.faceId)) add("invalid-reference", "error", "Pattern matching must reference a broad face of this occurrence.", id, "grainMatching");
      if (object(record.grain) && record.grain.status !== "unassigned" && object(record.grain.value) && record.grain.value.direction === "non-directional") add("incompatible-properties", "error", "A continuous directional matching requirement conflicts with a non-directional pattern.", id, "grainMatching");
      const members = matchingGroups.get(match.groupId) ?? [];
      members.push({ componentId: id, sequence: match.sequence }); matchingGroups.set(match.groupId, members);
    }
  }
  for (const [groupId, members] of matchingGroups) {
    if (members.length < 2) add("incomplete-matching", "warning", `Matching group ${groupId} has fewer than two specified occurrences; continuity remains unverified.`, members[0].componentId, "grainMatching");
    if (!unique(members.map(m => m.sequence))) add("incompatible-properties", "error", `Matching group ${groupId} repeats a sequence position.`, members[0].componentId, "grainMatching");
  }
  return result();
}

export function assertPanelManufacturingDocument(input: unknown, source: FurnitureResult): asserts input is PanelManufacturingDocument {
  const validation = validatePanelManufacturingDocument(input, source);
  if (!validation.valid) throw new Error(validation.diagnostics.filter(d => d.severity === "error").map(d => `${d.componentId ?? "source"}${d.path ? `/${d.path}` : ""}: ${d.message}`).join("\n"));
}
