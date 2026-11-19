import type { DrawingProfile } from "./types";

export const COMPACT_MANUFACTURING_OUTPUT = { propertyDrawings: true, detailedTables: false, schedule: true, panelScope: "selected" as const, keyedAnnotations: true, catalogueLegend: true };
export function manufacturingOutput(profile: DrawingProfile) {
  return profile.contents.manufacturingOutput ?? { propertyDrawings: true, detailedTables: true, schedule: true, panelScope: "selected-and-edited" as const, keyedAnnotations: false, catalogueLegend: true };
}
/** Application defaults; old saved profiles retain their existing output choices. */
export function manufacturingWorkflowProfile(profile: DrawingProfile): DrawingProfile {
  return { ...profile, contents: { ...profile.contents, manufacturingOutput: { ...COMPACT_MANUFACTURING_OUTPUT } } };
}
