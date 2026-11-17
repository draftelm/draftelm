import type { Projection, ProjectionConvention, Rect } from "../types";
import type { GeneralAssemblyPlan } from "./types";

/** Paper layout only. Source dimensions and view intent are never changed to fit. */
export function layoutGAViews(plan: GeneralAssemblyPlan, page: { width: number; height: number }, convention: ProjectionConvention): { frames: Record<Projection, Rect>; partsListSlot: Rect | null } {
  if (plan.policy.layoutStrategy !== "drawer-chest-primary-and-supports-v1") throw new Error("No registered layout for the GA policy; review the furniture-family layout strategy.");
  const body = { x: 10, y: 23, width: page.width - 20, height: page.height - 85 };
  const dominantIso = plan.policy.selectedPrimary === "isometric";
  const primaryWidth = dominantIso ? body.width * 0.42 : 0;
  const support = dominantIso ? { x: body.x + primaryWidth + 8, y: body.y, width: body.width - primaryWidth - 8, height: body.height } : body;
  const cell = (col: number, row: number): Rect => ({ x: support.x + col * support.width / 2, y: support.y + row * support.height / 2, width: support.width / 2, height: support.height / 2 });
  const free = convention === "third-angle" ? cell(1, 0) : cell(0, 1);
  const frames = convention === "third-angle"
    ? { front: cell(0, 1), top: cell(0, 0), right: cell(1, 1), isometric: free }
    : { front: cell(1, 0), top: cell(1, 1), right: cell(0, 0), isometric: free };
  if (dominantIso) frames.isometric = { ...body, width: primaryWidth };
  const hasIso = plan.views.some(v => v.projection === "isometric" && v.included);
  return { frames, partsListSlot: dominantIso || !hasIso ? free : null };
}
