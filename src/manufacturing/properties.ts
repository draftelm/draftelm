import type { FurnitureResult } from "../furniture";
import type { ManufacturingProperty, PanelManufacturingDocument, PanelManufacturingProperties, PanelOrientation, PropertyVerification } from "./types";
import { compareManufacturingText, manufacturingFingerprint } from "./canonical";
import { EDGE_KEYS, FACE_KEYS, createPanelTopology, defaultPanelOrientation, panelEdgeId, panelFaceId } from "./topology";
import { assertManufacturingSource, manufacturingSourceSnapshot, panelSourceSnapshot } from "./source";

export const unassignedProperty = <T>(reason: string): ManufacturingProperty<T> => ({ status: "unassigned", reason });
export const provisionalProperty = <T>(value: T, reason: string): ManufacturingProperty<T> => ({ status: "provisional", value: structuredClone(value), reason });
/** Verification metadata is not part of the manufacturing comparison payload. */
export function propertyContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(propertyContent);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "verification").map(([key, child]) => [key, propertyContent(child)]));
  return value;
}
export function propertySubjectFingerprint(record: PanelManufacturingProperties, path: string, value: unknown): string {
  return manufacturingFingerprint({ version: "panel-property-subject-1", componentId: record.componentId, assemblyId: record.assemblyId, binding: record.binding, orientation: record.orientation, path, value: propertyContent(value) });
}
/** Records a caller-supplied verification claim and evidence. Validation checks
 * consistency; authenticated reviewer/evidence authority is a later capability. */
export function verifiedProperty<T>(record: PanelManufacturingProperties, path: string, value: T, review: Pick<PropertyVerification, "evidenceRefs" | "verifiedBy">): ManufacturingProperty<T> {
  return { status: "verified", value: structuredClone(value), verification: { engineeringRevision: record.binding.engineeringRevision, subjectFingerprint: propertySubjectFingerprint(record, path, value), ...structuredClone(review) } };
}
export function createPanelManufacturingDocument(source: FurnitureResult, orientations: Record<string, PanelOrientation> = {}): PanelManufacturingDocument {
  assertManufacturingSource(source);
  if (Object.keys(orientations).some(id => !source.components.some(c => c.kind === "panel" && c.id === id))) throw new Error("Physical orientation overrides must reference existing panel occurrences.");
  const unknown = <T>() => unassignedProperty<T>("Not specified by the source engineering model; engineering/manufacturer input required.");
  return { schemaVersion: 1, binding: { engineeringRevision: source.specificationRevision, sourceSnapshot: manufacturingSourceSnapshot(source), resolverVersion: "panel-manufacturing-1" }, manufacturingReady: false,
    panels: source.components.filter(c => c.kind === "panel").sort((a, b) => compareManufacturingText(a.id, b.id)).map(p => {
      const orientation = structuredClone(orientations[p.id] ?? defaultPanelOrientation(p)); createPanelTopology(p, orientation);
      return {
        componentId: p.id, assemblyId: p.assemblyId, binding: { engineeringRevision: source.specificationRevision, panelSnapshot: panelSourceSnapshot(p), orientationSnapshot: manufacturingFingerprint(orientation) },
        orientation,
        material: provisionalProperty({ stockMaterialId: p.materialId, manufacturerCodes: [], grade: unknown() }, "Existing engineering material ID only; grade and stock specification remain unverified."),
        stockOrientation: unknown(), grain: unknown(), grainMatching: unknown(), otherRequirements: unknown(),
        faces: FACE_KEYS.map(key => ({ faceId: panelFaceId(p.id, key), requirements: unknown(), finish: unknown() })),
        edges: EDGE_KEYS.map(key => ({ edgeId: panelEdgeId(p.id, key), treatment: unknown() })),
      };
    }) };
}
