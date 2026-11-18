import type { Vector3 } from "../../furniture";
import type { Bounds2, ComponentReference, DrawingLine, Point2, Projection } from "../types";
import type { FunctionalDimensionId, ModelAxis } from "./functionalTypes";
import type { SectionCutFace, SectionDefinition, SectionGeometry } from "./sectionTypes";

export interface ContextMeasurementDisplay {
  id: string; viewId: string; requestIds: string[]; dimensionIds: FunctionalDimensionId[];
  representativeRequestId: string; representativeDimensionId: FunctionalDimensionId;
  valueMm: number; axis: "horizontal" | "vertical"; from: Point2; to: Point2;
  /** Every grouped occurrence keeps its actual geometry witnesses. */
  members: { requestId: string; dimensionId: FunctionalDimensionId; faceIds: string[]; mappedFaceIds?: string[]; from: Vector3; to: Vector3; sourceSectionPlane?: { axis: ModelAxis; coordinateMm: number }; sectionId?: string }[];
  references: ComponentReference[]; source: "front-elevation" | "horizontal-section" | "existing-detail-B";
  existingBindingId?: string;
}
export interface FunctionalContextViewDefinition {
  id: string; label: string; kind: "parent" | "section" | "detail";
  projection: Exclude<Projection, "isometric">; parentViewId?: string;
  labelToken?: string; crop?: Bounds2; sectionId?: string;
  entities: DrawingLine[]; bounds: Bounds2; cutFaces: SectionCutFace[];
  references: ComponentReference[]; displayIds: string[];
}
export interface FunctionalContextPlan {
  schemaVersion: 1; id: "functional-context-plan";
  binding: { engineeringRevision: string; sourceSnapshot: string; profileSnapshot: string; ruleVersion: "chest-functional-context-1" };
  sections: { definition: SectionDefinition; geometry: SectionGeometry }[];
  views: FunctionalContextViewDefinition[]; displays: ContextMeasurementDisplay[];
  diagnostics: { requestIds: string[]; message: string }[];
}
export interface FunctionalContextViewportData {
  kind: FunctionalContextViewDefinition["kind"];
  cutFaces: SectionCutFace[]; sectionId?: string;
  placedDisplayIds: string[]; deferredDisplayIds: string[];
  coincidentNotes: { sourceId: string; text: string; references: ComponentReference[] }[];
}
export interface FunctionalContextPresentation {
  assignments: { requestId: string; dimensionId?: FunctionalDimensionId; displayId?: string;
    viewId?: string; sheetId?: string; state: "placed" | "unplaced" | "unsupported"; reason?: string }[];
  diagnostics: string[];
}
