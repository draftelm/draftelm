import type { PanelPropertyDraft } from "./editing";
import type { CatalogueReference, CatalogueKind, CatalogueDefinition } from "./catalogue";
import { catalogueReferenceIssues } from "./catalogue";
import type { FaceKey, EdgeKey, PanelManufacturingProperties, MaterialSpecification, SurfaceFinish, EdgeTreatment } from "./types";
import { provisionalProperty, unassignedProperty } from "./properties";
import { manufacturingFingerprint } from "./canonical";
import { panelEdgeId, panelFaceId } from "./topology";

export interface DraftCatalogueSelections { material?: CatalogueReference | null; faces: Partial<Record<FaceKey, CatalogueReference | null>>; edges: Partial<Record<EdgeKey, CatalogueReference | null>> }
export type CatalogueTarget = { kind: "material" } | { kind: "edge-treatment"; edge: EdgeKey } | { kind: "finish"; face: FaceKey };
export function draftCatalogueSelections(p: PanelManufacturingProperties): DraftCatalogueSelections {
  return { ...(p.material.status !== "unassigned" && p.material.value.catalogue ? { material: p.material.value.catalogue } : {}), faces: Object.fromEntries(p.faces.filter(f => f.finish.status !== "unassigned" && f.finish.value.kind === "specified" && f.finish.value.catalogue).map(f => [f.faceId.endsWith(":a") ? "a" : "b", f.finish.status !== "unassigned" && f.finish.value.kind === "specified" ? f.finish.value.catalogue : null])), edges: Object.fromEntries(p.edges.filter(e => e.treatment.status !== "unassigned" && e.treatment.value.kind !== "none" && e.treatment.value.catalogue).map(e => [e.edgeId.split(":").pop(), e.treatment.status !== "unassigned" && e.treatment.value.kind !== "none" ? e.treatment.value.catalogue : null])) };
}
const codesText = (codes: { manufacturerId: string; code: string }[]) => codes.map(c => `${c.manufacturerId}=${c.code}`).join("\n");
/** Staged only: caller shows the exact old/new fields before accepting the preset. */
export function stageCataloguePreset(draft: PanelPropertyDraft, ref: CatalogueReference, target: CatalogueTarget): PanelPropertyDraft {
  const issues = catalogueReferenceIssues(ref, target.kind); if (issues.length) throw new Error(issues.join(" "));
  const entry = ref.entry; if (entry.specification.status === "unassigned") throw new Error("Catalogue definition is not specified.");
  const d = entry.specification.value, next = structuredClone(draft); next.library ??= { faces: {}, edges: {} };
  if (target.kind === "material" && d.kind === "material") { next.materialDescription = entry.name; next.materialCodes = codesText(d.manufacturerCodes); next.library.material = ref; }
  if (target.kind === "finish" && d.kind === "finish") { next.faces[target.face].finish = "specified"; next.faces[target.face].finishId = d.specificationId; next.library.faces[target.face] = ref; }
  if (target.kind === "edge-treatment" && d.kind === "edge-treatment") {
    next.edges[target.edge] = { kind: d.treatmentKind, specificationId: d.specificationId ?? "", thickness: d.nominalThicknessMm === undefined ? "" : String(d.nominalThicknessMm), material: d.materialId ?? "", appearance: d.appearance ?? "", process: d.process?.specificationId ?? "" };
    next.library.edges[target.edge] = ref;
  }
  return next;
}
/** A manual edit detaches only the affected reference, preserving the supplied values. */
export function detachChangedCatalogueSelections(before: PanelPropertyDraft, after: PanelPropertyDraft): PanelPropertyDraft {
  const next = structuredClone(after); if (!next.library) return next;
  if (before.materialDescription !== after.materialDescription || before.materialCodes !== after.materialCodes) next.library.material = null;
  for (const key of ["a", "b"] as const) if (before.faces[key].finish !== after.faces[key].finish || before.faces[key].finishId !== after.faces[key].finishId) next.library.faces[key] = null;
  for (const key of ["u-min", "u-max", "v-min", "v-max"] as const) if (manufacturingFingerprint(before.edges[key]) !== manufacturingFingerprint(after.edges[key])) next.library.edges[key] = null;
  return next;
}
export function applyDraftCatalogueSelections(p: PanelManufacturingProperties, before: PanelManufacturingProperties, draft: PanelPropertyDraft, thickness: number, bulk: boolean): void {
  if (!draft.library) return;
  const reason = "Applied catalogue proposal; occurrence-specific engineering/manufacturer verification required.", proposed = <T>(value: T) => provisionalProperty(value, reason), unknown = <T>() => unassignedProperty<T>("Not specified by the selected catalogue definition.");
  const apply = (ref: CatalogueReference | null | undefined, existing: CatalogueReference | undefined, target: CatalogueTarget) => {
    if (ref === undefined || !bulk && manufacturingFingerprint(ref) === manufacturingFingerprint(existing ?? null)) return;
    if (ref === null) {
      if (target.kind === "material" && p.material.status !== "unassigned" && p.material.value.catalogue) { const v = { ...p.material.value }; delete v.catalogue; p.material = proposed(v); }
      if (target.kind === "finish") { const f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, target.face))!; if (f.finish.status !== "unassigned" && f.finish.value.kind === "specified" && f.finish.value.catalogue) { const v = { ...f.finish.value }; delete v.catalogue; f.finish = proposed(v); } }
      if (target.kind === "edge-treatment") { const e = p.edges.find(e => e.edgeId === panelEdgeId(p.componentId, target.edge))!; if (e.treatment.status !== "unassigned" && e.treatment.value.kind !== "none" && e.treatment.value.catalogue) { const v = { ...e.treatment.value }; delete v.catalogue; e.treatment = proposed(v); } }
      return;
    }
    const staged = stageCataloguePreset(draft, ref, target), issues = catalogueReferenceIssues(ref, target.kind); if (issues.length) throw new Error(issues.join(" "));
    const e = ref.entry; if (e.specification.status === "unassigned") throw new Error("Select an assigned library definition."); const d = e.specification.value;
    if (d.kind === "material" && target.kind === "material") {
      if (staged.materialCodes !== draft.materialCodes || staged.materialDescription !== draft.materialDescription) throw new Error("Material draft differs from its reviewed library selection.");
      if (p.material.status === "unassigned" || p.material.value.stockMaterialId !== d.stockMaterialId || d.nominalThicknessMm !== undefined && d.nominalThicknessMm !== thickness) throw new Error("Library stock identity/thickness is incompatible with this physical panel. An engineering stock replacement is required.");
      p.material = proposed<MaterialSpecification>({ stockMaterialId: d.stockMaterialId, description: e.name, manufacturerCodes: d.manufacturerCodes, grade: d.grade === undefined ? unknown() : proposed(d.grade), catalogue: ref });
      if (d.orientation !== undefined) p.stockOrientation = proposed(d.orientation);
    }
    if (d.kind === "finish" && target.kind === "finish") {
      if (staged.faces[target.face].finish !== draft.faces[target.face].finish || staged.faces[target.face].finishId !== draft.faces[target.face].finishId) throw new Error("Finish draft differs from its reviewed library selection.");
      p.faces.find(f => f.faceId === panelFaceId(p.componentId, target.face))!.finish = proposed<SurfaceFinish>({ kind: "specified", specificationId: d.specificationId, manufacturerCodes: d.manufacturerCodes, appearance: d.appearance === undefined ? unknown() : proposed(d.appearance), process: d.process === undefined ? unknown() : proposed(d.process), catalogue: ref });
    }
    if (d.kind === "edge-treatment" && target.kind === "edge-treatment") {
      if (manufacturingFingerprint(staged.edges[target.edge]) !== manufacturingFingerprint(draft.edges[target.edge])) throw new Error("Edging draft differs from its reviewed library selection.");
      p.edges.find(edge => edge.edgeId === panelEdgeId(p.componentId, target.edge))!.treatment = proposed<EdgeTreatment>({ kind: d.treatmentKind, ...(d.specificationId ? { specificationId: d.specificationId } : {}), material: d.materialId === undefined ? unknown() : proposed({ stockMaterialId: d.materialId, manufacturerCodes: [], grade: unknown() }), nominalThicknessMm: d.nominalThicknessMm === undefined ? unknown() : proposed(d.nominalThicknessMm), appearance: d.appearance === undefined ? unknown() : proposed(d.appearance), process: d.process === undefined ? unknown() : proposed(d.process), catalogue: ref });
    }
  };
  apply(draft.library.material, before.material.status !== "unassigned" ? before.material.value.catalogue : undefined, { kind: "material" });
  for (const key of ["a", "b"] as const) { const f = before.faces.find(f => f.faceId === panelFaceId(p.componentId, key))!.finish; apply(draft.library.faces[key], f.status !== "unassigned" && f.value.kind === "specified" ? f.value.catalogue : undefined, { kind: "finish", face: key }); }
  for (const key of ["u-min", "u-max", "v-min", "v-max"] as const) { const t = before.edges.find(e => e.edgeId === panelEdgeId(p.componentId, key))!.treatment; apply(draft.library.edges[key], t.status !== "unassigned" && t.value.kind !== "none" ? t.value.catalogue : undefined, { kind: "edge-treatment", edge: key }); }
}
export function catalogueDefinitionFromDraft(kind: CatalogueKind, draft: PanelPropertyDraft, p: PanelManufacturingProperties, thickness: number, face: FaceKey, edge: EdgeKey): CatalogueDefinition {
  const selected = kind === "material" ? draft.library?.material : kind === "finish" ? draft.library?.faces[face] : draft.library?.edges[edge];
  if (selected?.entry.specification.status !== undefined && selected.entry.specification.status !== "unassigned" && selected.entry.specification.value.kind === kind) return structuredClone(selected.entry.specification.value);
  const common = { manufacturerCodes: [] as { manufacturerId: string; code: string }[], supplierCodes: [] };
  if (kind === "material") {
    if (p.material.status === "unassigned") throw new Error("Engineering stock identity is required.");
    const manufacturerCodes = draft.materialCodes.trim() ? draft.materialCodes.split(/\r?\n/).filter(s => s.trim()).map(line => { const [maker, ...rest] = line.split("="); if (!maker.trim() || !rest.join("=").trim()) throw new Error("Use manufacturer=code."); return { manufacturerId: maker.trim(), code: rest.join("=").trim() }; }) : [];
    return { ...common, kind, stockMaterialId: p.material.value.stockMaterialId, nominalThicknessMm: thickness, manufacturerCodes, ...(p.material.value.grade.status !== "unassigned" ? { grade: p.material.value.grade.value } : {}), ...(p.stockOrientation.status !== "unassigned" ? { orientation: p.stockOrientation.value } : {}) };
  }
  if (kind === "finish") { if (draft.faces[face].finish !== "specified" || !draft.faces[face].finishId.trim()) throw new Error("Specify this face's finish reference first."); return { ...common, kind, specificationId: draft.faces[face].finishId.trim() }; }
  const d = draft.edges[edge]; if (!d.kind || d.kind === "none") throw new Error("Specify an edge-band/lipping/other proposal first.");
  return { ...common, kind, treatmentKind: d.kind, ...(d.specificationId.trim() ? { specificationId: d.specificationId.trim() } : {}), ...(d.thickness.trim() ? { nominalThicknessMm: Number(d.thickness) } : {}), ...(d.material.trim() ? { materialId: d.material.trim() } : {}), ...(d.appearance.trim() ? { appearance: d.appearance.trim() } : {}), ...(d.process.trim() ? { process: { specificationId: d.process.trim(), notes: [] } } : {}) };
}
