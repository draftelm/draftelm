import type { FurnitureResult } from "../furniture";
import type { PanelManufacturingDocument, PanelManufacturingProperties, EdgeKey, FaceKey } from "./types";
import type { PanelPropertyDraft } from "./editing";
import type { ManufacturingCatalogue } from "./catalogue";
import { parseManufacturingCatalogue } from "./catalogue";
import { applyPanelPropertyDraft, panelPropertyDraft } from "./editing";
import { manufacturingFingerprint as fingerprint } from "./canonical";
import { assertPanelManufacturingDocument } from "./validation";
import { propertyText } from "./schedule";

export type PanelProposalField = "material" | "grain" | `face:${FaceKey}:requirements` | `face:${FaceKey}:finish` | `edge:${EdgeKey}`;
export const PANEL_PROPOSAL_FIELDS: readonly PanelProposalField[] = ["material", "grain", "face:a:requirements", "face:a:finish", "face:b:requirements", "face:b:finish", "edge:u-min", "edge:u-max", "edge:v-min", "edge:v-max"];
export const proposalFieldLabel = (field: PanelProposalField) => field === "material" ? "Material / stock restriction" : field === "grain" ? "Grain direction" : field.startsWith("edge:") ? `Physical edge ${field.slice(5)}` : `Face ${field.split(":")[1].toUpperCase()} ${field.endsWith("finish") ? "finish" : "appearance requirements"}`;
/** Copy only named draft fields. Used to preserve unrelated pending edits after Apply. */
export function mergePanelDraftFields(base: PanelPropertyDraft, incoming: PanelPropertyDraft, fields: readonly PanelProposalField[], detachMissingReferences = false): PanelPropertyDraft {
  const out = structuredClone(base); out.library ??= { faces: {}, edges: {} };
  for (const field of fields) {
    if (!PANEL_PROPOSAL_FIELDS.includes(field)) throw new Error("Unsupported proposal field.");
    if (field === "material") {
      out.materialDescription = incoming.materialDescription; out.materialCodes = incoming.materialCodes;
      if (incoming.library?.material !== undefined) out.library.material = structuredClone(incoming.library.material);
      else if (detachMissingReferences) out.library.material = null; else delete out.library.material;
    } else if (field === "grain") { out.grain = incoming.grain; out.grainSense = incoming.grainSense; }
    else if (field.startsWith("edge:")) {
      const key = field.slice(5) as EdgeKey; out.edges[key] = structuredClone(incoming.edges[key]);
      if (incoming.library?.edges[key] !== undefined) out.library.edges[key] = structuredClone(incoming.library.edges[key]);
      else if (detachMissingReferences) out.library.edges[key] = null; else delete out.library.edges[key];
    } else {
      const key = field.split(":")[1] as FaceKey;
      if (field.endsWith("requirements")) { out.faces[key].role = incoming.faces[key].role; out.faces[key].goodFace = incoming.faces[key].goodFace; }
      else {
        out.faces[key].finish = incoming.faces[key].finish; out.faces[key].finishId = incoming.faces[key].finishId;
        if (incoming.library?.faces[key] !== undefined) out.library.faces[key] = structuredClone(incoming.library.faces[key]);
        else if (detachMissingReferences) out.library.faces[key] = null; else delete out.library.faces[key];
      }
    }
  }
  return out;
}
function fieldValue(p: PanelManufacturingProperties, field: PanelProposalField): unknown {
  if (field === "material") return { material: p.material, stockOrientation: p.stockOrientation };
  if (field === "grain") return p.grain;
  if (field.startsWith("edge:")) return p.edges.find(e => e.edgeId.endsWith(`:${field.slice(5)}`))!.treatment;
  const face = p.faces.find(f => f.faceId.endsWith(`:${field.split(":")[1]}`))!;
  return field.endsWith("finish") ? face.finish : face.requirements;
}
function copyField(target: PanelManufacturingProperties, from: PanelManufacturingProperties, field: PanelProposalField) {
  if (field === "material") { target.material = structuredClone(from.material); target.stockOrientation = structuredClone(from.stockOrientation); }
  else if (field === "grain") target.grain = structuredClone(from.grain);
  else if (field.startsWith("edge:")) target.edges.find(e => e.edgeId.endsWith(`:${field.slice(5)}`))!.treatment = structuredClone(from.edges.find(e => e.edgeId.endsWith(`:${field.slice(5)}`))!.treatment);
  else { const key = field.split(":")[1], a = target.faces.find(f => f.faceId.endsWith(`:${key}`))!, b = from.faces.find(f => f.faceId.endsWith(`:${key}`))!; if (field.endsWith("finish")) a.finish = structuredClone(b.finish); else a.requirements = structuredClone(b.requirements); }
}
export interface PanelFieldProposal { referenceId: string; componentIds: string[]; fields: PanelProposalField[]; draft: PanelPropertyDraft }
export interface PanelFieldReview {
  sourceRevision: string; documentFingerprint: string; proposalFingerprint: string; catalogueFingerprint: string; syntheticExample: boolean;
  fields: PanelProposalField[]; componentIds: string[];
  rows: { componentId: string; name: string; stock: string; changes: { field: PanelProposalField; before: unknown; after: unknown; differs: boolean }[]; preservedFields: PanelProposalField[] }[];
  issues: { componentId: string; message: string; blocking: boolean }[];
  revisionCompatible: true;
}
function resolve(document: PanelManufacturingDocument, source: FurnitureResult, proposal: PanelFieldProposal, catalogue: ManufacturingCatalogue, syntheticExample: boolean) {
  assertPanelManufacturingDocument(document, source);
  parseManufacturingCatalogue(JSON.stringify(catalogue));
  if (!proposal || Object.keys(proposal).some(k => !["referenceId", "componentIds", "fields", "draft"].includes(k)) || !Array.isArray(proposal.componentIds) || !proposal.componentIds.length || new Set(proposal.componentIds).size !== proposal.componentIds.length || !Array.isArray(proposal.fields) || !proposal.fields.length || new Set(proposal.fields).size !== proposal.fields.length || proposal.fields.some(f => !PANEL_PROPOSAL_FIELDS.includes(f)) || typeof syntheticExample !== "boolean") throw new Error("Choose an explicit nonempty panel scope and supported field set.");
  const reference = document.panels.find(p => p.componentId === proposal.referenceId); if (!reference) throw new Error("Proposal reference panel is not in this source.");
  const fields = [...proposal.fields].sort(), ids = [...proposal.componentIds].sort();
  const next = structuredClone(document);
  const review: PanelFieldReview = { sourceRevision: source.specificationRevision, documentFingerprint: fingerprint(document), proposalFingerprint: fingerprint(proposal), catalogueFingerprint: fingerprint(catalogue), syntheticExample, fields, componentIds: ids, rows: [], issues: [], revisionCompatible: true };
  for (const id of ids) {
    const before = document.panels.find(p => p.componentId === id); if (!before) throw new Error(`Unknown physical panel: ${id}.`);
    if (fields.some(f => f !== "material") && fingerprint(before.orientation) !== fingerprint(reference.orientation)) review.issues.push({ componentId: id, message: "Face/edge/grain orientation differs from the reference. Narrow the scope or configure this occurrence individually in Advanced.", blocking: true });
    try {
      const draft = mergePanelDraftFields(panelPropertyDraft(before), proposal.draft, fields, true);
      delete draft.matchingEdited; // matching registration is always occurrence-specific
      const candidate = applyPanelPropertyDraft(document, source, [id], draft, syntheticExample).panels.find(p => p.componentId === id)!;
      const after = next.panels.find(p => p.componentId === id)!;
      for (const field of fields) copyField(after, candidate, field);
      review.rows.push({ componentId: id, name: source.components.find(p => p.id === id)!.name, stock: before.material.status === "unassigned" ? "Not specified" : before.material.value.stockMaterialId, changes: fields.map(field => ({ field, before: structuredClone(fieldValue(before, field)), after: structuredClone(fieldValue(after, field)), differs: fingerprint(fieldValue(before, field)) !== fingerprint(fieldValue(after, field)) })), preservedFields: PANEL_PROPOSAL_FIELDS.filter(f => !fields.includes(f)) });
    } catch (e) { review.issues.push({ componentId: id, message: e instanceof Error ? e.message : "Proposal cannot be applied.", blocking: true }); }
  }
  if (!review.issues.some(i => i.blocking)) assertPanelManufacturingDocument(next, source);
  return { review, next };
}
export function reviewPanelFields(document: PanelManufacturingDocument, source: FurnitureResult, proposal: PanelFieldProposal, catalogue: ManufacturingCatalogue, syntheticExample = false): PanelFieldReview { return resolve(document, source, proposal, catalogue, syntheticExample).review; }
export function applyReviewedPanelFields(document: PanelManufacturingDocument, source: FurnitureResult, proposal: PanelFieldProposal, catalogue: ManufacturingCatalogue, review: PanelFieldReview | null, confirmed: boolean, syntheticExample = false): PanelManufacturingDocument {
  const current = resolve(document, source, proposal, catalogue, syntheticExample);
  if (!confirmed || !review || fingerprint(current.review) !== fingerprint(review)) throw new Error("Review and confirm the current fields, scope, catalogue and source before applying.");
  if (current.review.issues.some(i => i.blocking)) throw new Error("Resolve the blocking conflicts before applying this proposal.");
  return current.next;
}
/** Concise review text; complete captured values stay available alongside it. */
export function proposalValueText(value: unknown): string {
  if (value && typeof value === "object" && "status" in value) return propertyText(value as Parameters<typeof propertyText>[0], summary);
  if (value && typeof value === "object" && "material" in value) return proposalValueText(value.material) + " / stock constraint: " + proposalValueText((value as Record<string, unknown>).stockOrientation);
  return JSON.stringify(value);
}

function summary(value: unknown): string {
  if (value === null) return "Explicitly not applicable";
  if (!value || typeof value !== "object") return String(value);
  const v = value as Record<string, unknown>;
  if ("stockMaterialId" in v) return [v.description, v.stockMaterialId, ...(v.manufacturerCodes as { manufacturerId: string; code: string }[] ?? []).map(c => c.manufacturerId + "=" + c.code), "grade: " + proposalValueText(v.grade)].filter(Boolean).join(" · ");
  if ("direction" in v) return String(v.direction) + (v.sense ? " / " + v.sense : "");
  if ("decorative" in v) return [v.decorative ? "Decorative" : "", v.reverse ? "Reverse" : "", v.visibleInService ? "Required visible in use" : "Visibility not required", ...(v.goodFaceRequirements as { description: string }[]).map(r => r.description)].filter(Boolean).join(" · ");
  if (v.kind === "none") return "Explicit none";
  if ("specificationId" in v || "nominalThicknessMm" in v) return [v.kind, v.specificationId ?? "Code not specified", ...(v.nominalThicknessMm ? ["thickness: " + proposalValueText(v.nominalThicknessMm)] : [])].filter(Boolean).join(" · ");
  return JSON.stringify(value);
}
