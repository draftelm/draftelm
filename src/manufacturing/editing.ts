import type { FurnitureResult } from "../furniture";
import type { EdgeKey, EdgeTreatment, FaceKey, FaceRequirements, ManufacturingProperty, PanelManufacturingDocument, PanelManufacturingProperties, SurfaceFinish } from "./types";
import { createPanelManufacturingDocument, provisionalProperty, unassignedProperty } from "./properties";
import { assertPanelManufacturingDocument, validatePanelManufacturingDocument } from "./validation";
import { createPanelTopology, EDGE_KEYS, FACE_KEYS, panelEdgeId, panelFaceId } from "./topology";
import { manufacturingFingerprint } from "./canonical";
import { applyDraftCatalogueSelections, draftCatalogueSelections } from "./catalogueEditing";

export interface PanelPropertyDraft {
  library?: import("./catalogueEditing").DraftCatalogueSelections;
  matching?: { mode: "" | "independent" | "specified"; groupId: string; face: FaceKey; sequence: string; originU: string; originV: string; rotation: "" | "0" | "90" | "180" | "270" };
  matchingEdited?: boolean;
  materialDescription: string;
  materialCodes: string;
  grain: "" | "longitudinal" | "transverse" | "non-directional";
  grainSense: "either" | "positive" | "negative";
  faces: Record<FaceKey, { role: "" | "decorative" | "decorative-hidden" | "reverse" | "reverse-visible" | "visible" | "ordinary"; goodFace: string; finish: "" | "none" | "specified"; finishId: string }>;
  edges: Record<EdgeKey, { kind: "" | "none" | "edge-band" | "lipping" | "other"; specificationId: string; thickness: string; material: string; appearance: string; process: string }>;
}
const value = <T>(p: ManufacturingProperty<T>): T | undefined => p.status === "unassigned" ? undefined : p.value;
export function panelPropertyDraft(p: PanelManufacturingProperties): PanelPropertyDraft {
  return {
    library: draftCatalogueSelections(p),
    matching: p.grainMatching.status === "unassigned" ? { mode: "", groupId: "", face: "a", sequence: "", originU: "", originV: "", rotation: "" } : p.grainMatching.value.kind === "independent" ? { mode: "independent", groupId: "", face: "a", sequence: "", originU: "", originV: "", rotation: "" } : { mode: "specified", groupId: p.grainMatching.value.groupId, face: p.grainMatching.value.faceId.endsWith(":a") ? "a" : "b", sequence: String(p.grainMatching.value.sequence), originU: String(p.grainMatching.value.originUvMm.u), originV: String(p.grainMatching.value.originUvMm.v), rotation: String(p.grainMatching.value.rotationDeg) as "0" },
    materialDescription: value(p.material)?.description ?? "",
    materialCodes: value(p.material)?.manufacturerCodes.map(c => `${c.manufacturerId}=${c.code}`).join("\n") ?? "",
    grain: value(p.grain)?.direction ?? "",
    grainSense: p.grain.status !== "unassigned" && p.grain.value.direction !== "non-directional" ? p.grain.value.sense : "either",
    faces: Object.fromEntries(FACE_KEYS.map(key => { const f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, key))!, r = value(f.requirements), finish = value(f.finish);
      return [key, { role: !r ? "" : r.decorative ? r.visibleInService ? "decorative" : "decorative-hidden" : r.reverse ? r.visibleInService ? "reverse-visible" : "reverse" : r.visibleInService ? "visible" : "ordinary", goodFace: r?.goodFaceRequirements.map(r => r.description).join("\n") ?? "", finish: finish?.kind === "none" ? "none" : finish ? "specified" : "", finishId: finish?.kind === "specified" ? finish.specificationId : "" }]; })),
    edges: Object.fromEntries(EDGE_KEYS.map(key => { const e = value(p.edges.find(e => e.edgeId === panelEdgeId(p.componentId, key))!.treatment);
      return [key, { kind: e?.kind ?? "", specificationId: e && e.kind !== "none" ? e.specificationId ?? "" : "", thickness: e && e.kind !== "none" ? String(value(e.nominalThicknessMm) ?? "") : "", material: e && e.kind !== "none" ? value(e.material)?.stockMaterialId ?? "" : "", appearance: e && e.kind !== "none" ? value(e.appearance) ?? "" : "", process: e && e.kind !== "none" ? value(e.process)?.specificationId ?? "" : "" }]; })),
  } as PanelPropertyDraft;
}
/** UI edits are supplied proposals only. Bulk scope is always explicit; no BOM or name-based expansion. */
export function applyPanelPropertyDraft(document: PanelManufacturingDocument, source: FurnitureResult, componentIds: string[], draft: PanelPropertyDraft, syntheticExample = false): PanelManufacturingDocument {
  assertPanelManufacturingDocument(document, source);
  if (!componentIds.length || new Set(componentIds).size !== componentIds.length || componentIds.some(id => !document.panels.some(p => p.componentId === id))) throw new Error("Select existing physical panel IDs exactly once.");
  const next = structuredClone(document), reason = syntheticExample ? "SYNTHETIC EXAMPLE - unverified, not for manufacture or purchasing." : "User-specified proposal; engineering/manufacturer verification required.";
  const proposed = <T>(v: T) => provisionalProperty(v, reason), unknown = <T>() => unassignedProperty<T>("Not specified");
  for (const p of next.panels.filter(p => componentIds.includes(p.componentId))) {
    const originalRecord = structuredClone(p), before = panelPropertyDraft(p), all = componentIds.length > 1;
    if (all || draft.materialCodes !== before.materialCodes || draft.materialDescription !== before.materialDescription) {
      const codes = draft.materialCodes.trim() ? draft.materialCodes.split(/\r?\n/).filter(s => s.trim()).map(line => { const i = line.indexOf("="); if (i < 1 || !line.slice(i + 1).trim()) throw new Error("Material codes use one manufacturer=code per line."); return { manufacturerId: line.slice(0, i).trim(), code: line.slice(i + 1).trim() }; }) : [];
      const original = value(p.material); if (!original) throw new Error("Select an engineering stock material before adding manufacturer codes.");
      const material = { ...original, manufacturerCodes: codes };
      delete material.catalogue;
      if (draft.materialDescription.trim()) material.description = draft.materialDescription.trim(); else delete material.description;
      p.material = proposed(material);
    }
    if (all || draft.grain !== before.grain || draft.grainSense !== before.grainSense) p.grain = draft.grain === "" ? unknown() : proposed(draft.grain === "non-directional" ? { direction: "non-directional" } : { direction: draft.grain, sense: draft.grainSense });
    for (const key of FACE_KEYS) {
      const d = draft.faces[key], old = before.faces[key], f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, key))!;
      if (all || d.role !== old.role || d.goodFace !== old.goodFace) {
        if (!d.role && d.goodFace.trim()) throw new Error(`Choose an explicit face ${key.toUpperCase()} role before specifying its good-face requirement.`);
        const r: FaceRequirements = { decorative: d.role.startsWith("decorative"), reverse: d.role.startsWith("reverse"), visibleInService: ["decorative", "reverse-visible", "visible"].includes(d.role), goodFaceRequirements: !all && d.goodFace === old.goodFace && f.requirements.status !== "unassigned" ? f.requirements.value.goodFaceRequirements : d.goodFace.split(/\r?\n/).filter(s => s.trim()).map((text, i) => ({ requirementId: `user-good-face-${i + 1}`, description: text.trim() })) };
        f.requirements = d.role ? proposed(r) : unknown();
      }
      if (all || d.finish !== old.finish || d.finishId !== old.finishId) {
        if (d.finish === "specified" && !d.finishId.trim()) throw new Error(`Face ${key.toUpperCase()} needs a finish specification/code.`);
        f.finish = !d.finish ? unknown() : proposed<SurfaceFinish>(d.finish === "none" ? { kind: "none" } : { kind: "specified", specificationId: d.finishId.trim(), manufacturerCodes: [], appearance: unknown(), process: unknown() });
      }
    }
    for (const key of EDGE_KEYS) if (all || manufacturingFingerprint(draft.edges[key]) !== manufacturingFingerprint(before.edges[key])) {
      const d = draft.edges[key], e = p.edges.find(e => e.edgeId === panelEdgeId(p.componentId, key))!;
      if (!d.kind) { e.treatment = unknown(); continue; }
      if (d.kind === "none") { e.treatment = proposed<EdgeTreatment>({ kind: "none" }); continue; }
      if (d.thickness.trim() && (!(Number(d.thickness) > 0) || !Number.isFinite(Number(d.thickness)))) throw new Error(`${key} nominal thickness must be a positive finite number; leave blank when not specified.`);
      const old = before.edges[key], existing = value(e.treatment), keep = !all && existing && existing.kind === d.kind ? existing : undefined;
      const treatment: Exclude<EdgeTreatment, { kind: "none" }> = { kind: d.kind, nominalThicknessMm: unknown(), material: unknown(), appearance: unknown(), process: unknown() };
      if (d.specificationId.trim()) treatment.specificationId = d.specificationId.trim();
      treatment.nominalThicknessMm = keep && d.thickness === old.thickness ? keep.nominalThicknessMm : d.thickness.trim() ? proposed(Number(d.thickness)) : unknown();
      treatment.material = keep && d.material === old.material ? keep.material : d.material.trim() ? proposed({ stockMaterialId: d.material.trim(), manufacturerCodes: [], grade: unknown() }) : unknown();
      treatment.appearance = keep && d.appearance === old.appearance ? keep.appearance : d.appearance.trim() ? proposed(d.appearance.trim()) : unknown();
      treatment.process = keep && d.process === old.process ? keep.process : d.process.trim() ? proposed({ specificationId: d.process.trim(), notes: [] }) : unknown();
      e.treatment = proposed(treatment);
    }
    const panel = source.components.find(c => c.id === p.componentId)!;
    if (panel.kind !== "panel") throw new Error("Missing physical panel.");
    applyDraftCatalogueSelections(p, originalRecord, draft, panel.thickness, all);
    if (draft.matchingEdited && draft.matching) {
      if (all) throw new Error("Matching registration is occurrence-specific. Apply it individually before bulk copying other properties.");
      const m = draft.matching;
      if (!m.mode) p.grainMatching = unknown();
      else if (m.mode === "independent") p.grainMatching = proposed({ kind: "independent" });
      else {
        if (!m.groupId.trim() || !m.sequence.trim() || !Number.isSafeInteger(Number(m.sequence)) || Number(m.sequence) < 0 || !m.originU.trim() || !m.originV.trim() || !Number.isFinite(Number(m.originU)) || !Number.isFinite(Number(m.originV)) || !m.rotation) throw new Error("Explicit matching needs a group, face, non-negative order, U/V registration and quarter-turn orientation. No continuity is inferred.");
        p.grainMatching = proposed({ kind: "specified", groupId: m.groupId.trim(), faceId: panelFaceId(p.componentId, m.face), sequence: Number(m.sequence), originUvMm: { u: Number(m.originU), v: Number(m.originV) }, rotationDeg: Number(m.rotation) as 0 | 90 | 180 | 270 });
      }
    }
  }
  assertPanelManufacturingDocument(next, source); return next;
}
function demote<T>(v: T): T {
  if (Array.isArray(v)) return v.map(demote) as T;
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (r.status === "verified" || r.status === "provisional") return provisionalProperty(demote(r.value), "Carried after explicit geometry review; re-verification required.") as T;
    return Object.fromEntries(Object.entries(r).map(([k, child]) => [k, k === "catalogue" ? structuredClone(child) : demote(child)])) as T;
  }
  return v;
}
export function rebasePanelManufacturing(document: PanelManufacturingDocument, source: FurnitureResult): { document: PanelManufacturingDocument; retained: string[]; reset: string[]; removed: string[] } {
  const next = createPanelManufacturingDocument(source), retained: string[] = [], reset: string[] = [];
  for (const p of next.panels) {
    const old = document.panels.find(r => r.componentId === p.componentId); if (!old) continue;
    try { const panel = source.components.find(c => c.kind === "panel" && c.id === p.componentId)!; if (panel.kind !== "panel") continue; createPanelTopology(panel, old.orientation); if (old.material.status !== "unassigned") { if (old.material.value.stockMaterialId !== panel.materialId) throw new Error("Stock identity changed."); const ref = old.material.value.catalogue?.entry.specification; if (ref && ref.status !== "unassigned" && ref.value.kind === "material" && ref.value.nominalThicknessMm !== undefined && ref.value.nominalThicknessMm !== panel.thickness) throw new Error("Pinned stock thickness changed."); } }
    catch { reset.push(p.componentId); continue; }
    Object.assign(p, demote(old), { binding: p.binding, orientation: structuredClone(old.orientation) });
    p.binding.orientationSnapshot = manufacturingFingerprint(p.orientation); retained.push(p.componentId);
  }
  assertPanelManufacturingDocument(next, source);
  return { document: next, retained, reset, removed: document.panels.filter(p => !next.panels.some(n => n.componentId === p.componentId)).map(p => p.componentId) };
}
export function syntheticPanelExample(document: PanelManufacturingDocument, source: FurnitureResult, componentId: string) {
  const p = document.panels.find(p => p.componentId === componentId); if (!p) throw new Error("Choose a physical panel for the synthetic example.");
  const draft = panelPropertyDraft(p); draft.grain = "longitudinal"; draft.materialCodes = "SYNTHETIC-MAKER=EXAMPLE-SHEET";
  draft.faces.a = { role: "decorative", goodFace: "SYNTHETIC appearance example only", finish: "specified", finishId: "SYNTHETIC-MATTE-A" };
  draft.faces.b = { role: "reverse", goodFace: "", finish: "specified", finishId: "SYNTHETIC-REVERSE-B" };
  draft.edges["v-min"] = { kind: "edge-band", specificationId: "SYNTHETIC-BAND", thickness: "1", material: "SYNTHETIC-EDGE-STOCK", appearance: "SYNTHETIC matching appearance", process: "" };
  return applyPanelPropertyDraft(document, source, [componentId], draft, true);
}
/** Presentation change detection ignores audit attribution and binding churn. */
export function panelPresentationFingerprint(p: PanelManufacturingProperties): string {
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === "object") { const r = v as Record<string, unknown>; return Object.fromEntries(Object.entries(r).filter(([k]) => !["binding", "verification", "reason"].includes(k)).map(([k, child]) => [k, visit(child)])); }
    return v;
  };
  return manufacturingFingerprint(visit({ ...p, faces: [...p.faces].sort((a, b) => a.faceId < b.faceId ? -1 : 1), edges: [...p.edges].sort((a, b) => a.edgeId < b.edgeId ? -1 : 1) }));
}
export function parsePanelPropertyStorage(value: string, source: FurnitureResult): { properties: PanelManufacturingDocument; syntheticExample: boolean } {
  const parsed = JSON.parse(value);
  if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.syntheticExample !== "boolean" || !parsed.properties) throw new Error("Unsupported saved manufacturing properties.");
  const v = validatePanelManufacturingDocument(parsed.properties, source), errors = v.diagnostics.filter(d => d.severity === "error");
  if (errors.length && !(errors.some(d => d.code === "stale-source") && errors.every(d => ["stale-source", "stale-panel", "invalid-verification"].includes(d.code)))) throw new Error("Saved manufacturing properties are invalid.");
  return { properties: parsed.properties, syntheticExample: parsed.syntheticExample };
}
