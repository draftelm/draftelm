import type { PanelPropertyDraft } from "./editing";
import type { FurnitureResult } from "../furniture";
import type { PanelManufacturingDocument } from "./types";
import { manufacturingFingerprint } from "./canonical";
import { applyPanelPropertyDraft } from "./editing";
import { assertPanelManufacturingDocument } from "./validation";

export type EdgeTreatmentDraft = PanelPropertyDraft["edges"]["u-min"];
export const emptyEdgeTreatment = (): EdgeTreatmentDraft => ({ kind: "", specificationId: "", thickness: "", material: "", appearance: "", process: "" });
export interface EdgeTreatmentPreset { id: string; name: string; scope: "project" | "company"; treatment: EdgeTreatmentDraft }
/** Local reusable proposals, not a manufacturer catalogue or an approval source. */
export function parseEdgeTreatmentPresets(value: string): EdgeTreatmentPreset[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error("Invalid edging preset collection.");
  const text = (v: unknown) => typeof v === "string" && v.length <= 100 && !/[\x00-\x1f\x7f]/.test(v);
  const presets = parsed as EdgeTreatmentPreset[];
  if (presets.some(p => !p || Object.keys(p).sort().join() !== "id,name,scope,treatment" || !text(p.id) || !p.id.trim() || !text(p.name) || !p.name.trim() || !["project", "company"].includes(p.scope) || !p.treatment || Object.keys(p.treatment).sort().join() !== "appearance,kind,material,process,specificationId,thickness" || Object.values(p.treatment).some(v => !text(v)) || !["none", "edge-band", "lipping", "other"].includes(p.treatment.kind) || p.treatment.thickness.trim() && (!(Number(p.treatment.thickness) > 0) || !Number.isFinite(Number(p.treatment.thickness)))) || new Set(presets.map(p => p.id)).size !== presets.length) throw new Error("Invalid edging preset; use explicit treatment fields without approval data.");
  return structuredClone(presets);
}
export interface PanelEditReview { componentIds: string[]; draftFingerprint: string; documentFingerprint: string }
export function reviewPanelPropertyEdit(document: PanelManufacturingDocument, source: FurnitureResult, componentIds: string[], draft: PanelPropertyDraft): PanelEditReview {
  // Validate the exact proposed change before offering it for confirmation.
  applyPanelPropertyDraft(document, source, componentIds, draft);
  return { componentIds: [...componentIds].sort(), draftFingerprint: manufacturingFingerprint(draft), documentFingerprint: manufacturingFingerprint(document) };
}
export function applyReviewedPanelPropertyEdit(document: PanelManufacturingDocument, source: FurnitureResult, componentIds: string[], draft: PanelPropertyDraft, review: PanelEditReview | null, confirmed: boolean, syntheticExample = false) {
  assertPanelManufacturingDocument(document, source);
  if (componentIds.length > 1 && (!confirmed || !review || manufacturingFingerprint(review) !== manufacturingFingerprint(reviewPanelPropertyEdit(document, source, componentIds, draft)))) throw new Error("Review and confirm the current values and exact panel scope before applying bulk changes.");
  return applyPanelPropertyDraft(document, source, componentIds, draft, syntheticExample);
}
