import type { DrawingProfile, PlotEntity } from "./types";

/** Paper millimetres. Candidate company conventions, not verified normative
 * requirements. The same resolved primitives feed browser SVG and vector PDF. */
export const STROKE_ROLES = ["visible-outline", "visible-internal", "section-cut", "hidden", "centre", "cutting-plane", "dimension", "extension", "leader", "balloon", "hatch", "border", "title-block", "table", "detail-boundary"] as const;
export type StrokeRole = typeof STROKE_ROLES[number];
export interface DrawingStyle {
  strokes: Record<StrokeRole, { width: number; dash?: number[] }>;
  text: { dimension: number; balloon: number; heading: number; note: number };
}
export const DRAWING_TEXT = Object.freeze({ dimension: 2.5, balloon: 3, heading: 2.6, note: 2, sectionSymbol: 2.6 });
export function resolveDrawingStyle(profile: Pick<DrawingProfile, "template" | "presentation">): DrawingStyle {
  const outline = profile.template === "engineering" ? 0.35 : 0.3;
  const strokes: DrawingStyle["strokes"] = {
    "visible-outline": { width: outline }, "visible-internal": { width: 0.18 }, "section-cut": { width: 0.45 },
    hidden: { width: 0.18, dash: [3, 1.5] }, centre: { width: 0.18, dash: [8, 1.5, 1, 1.5] },
    "cutting-plane": { width: 0.35, dash: [10, 2, 1, 2] },
    dimension: { width: 0.18 }, extension: { width: 0.18 }, leader: { width: 0.18 },
    balloon: { width: 0.25 }, hatch: { width: 0.13 }, border: { width: 0.35 },
    "title-block": { width: 0.25 }, table: { width: 0.18 }, "detail-boundary": { width: 0.18, dash: [2.5, 1.5] },
  };
  for (const role of STROKE_ROLES) {
    const width = profile.presentation?.lineWeights?.[role];
    if (width !== undefined) strokes[role] = { ...strokes[role], width };
  }
  return { strokes, text: { ...DRAWING_TEXT } };
}
export function stylePlot(entities: PlotEntity[], style: DrawingStyle): PlotEntity[] {
  return entities.map(e => {
    if (e.kind === "line") {
      const role = e.strokeRole ?? (e.role === "geometry" ? "visible-outline" : e.role === "dimension" ? "dimension" : e.role === "sheet" ? "title-block" : e.role === "hatch" ? "hatch" : "leader");
      return { ...e, strokeRole: role, ...style.strokes[role] };
    }
    if (e.kind === "circle" && !e.filled) return { ...e, width: style.strokes.balloon.width };
    return e;
  });
}
