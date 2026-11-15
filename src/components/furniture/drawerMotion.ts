import type { Assembly } from "../../furniture";
import type { PreviewModel, PreviewPanel, SceneVector } from "./viewerGeometry";
import { SCENE_UNITS_PER_MM } from "./viewerGeometry";

/** Viewer policy only. Neither value is a runner specification or engineering approval. */
export const DEFAULT_DEMO_TRAVEL_MM = 300;
export const MAX_DEMO_TRAVEL_MM = 400;
export type DrawerPositions = Record<string, number>; // normalized target positions: 0 closed, 1 open
export interface DrawerGroup { id: string; name: string; panels: PreviewPanel[] }

/** Use assembly relationships and member IDs, not panel-name guesses, for movement. */
export function groupDrawerPanels(assemblies: Assembly[], model: PreviewModel): DrawerGroup[] {
  if (model.error) return [];
  return assemblies.flatMap(a => {
    const members = new Set(a.componentIds);
    const panels = model.panels.filter(p => p.component.assemblyId === a.id && members.has(p.component.id));
    // The selected schema-v2 construction has one decorative front + five box panels.
    const drawer = a.parentId !== null && panels.length === 6 &&
      panels.filter(p => p.role === "front").length === 1 && panels.filter(p => p.role === "box").length === 5;
    return drawer ? [{ id: a.id, name: a.name, panels }] : [];
  });
}

export function clampOpening(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
export function clampDemoTravel(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_DEMO_TRAVEL_MM, Math.max(0, value)) : 0;
}

/** Drop deleted drawers, initialize new ones closed, and sanitize every target. */
export function reconcileDrawerPositions(drawers: DrawerGroup[], positions: DrawerPositions): DrawerPositions {
  return Object.fromEntries(drawers.map(d => [d.id, clampOpening(positions[d.id] ?? 0)]));
}
export function setDrawerOpening(drawers: DrawerGroup[], positions: DrawerPositions, id: string, value: number): DrawerPositions {
  const next = reconcileDrawerPositions(drawers, positions);
  if (Object.prototype.hasOwnProperty.call(next, id)) next[id] = clampOpening(value);
  return next;
}
export function resetDrawerPositions(drawers: DrawerGroup[]): DrawerPositions {
  return reconcileDrawerPositions(drawers, {});
}
export function drawerOffset(opening: number, maximumMm: number): SceneVector {
  const distance = clampOpening(opening) * clampDemoTravel(maximumMm) * SCENE_UNITS_PER_MM;
  return [0, 0, distance === 0 ? 0 : -distance];
}

/** Monotonic exponential easing. Clamp current AND target so a lowered limit cannot
 * leave a drawer outside its new visual envelope, even for one rendered frame.
 */
export function advanceDrawerOffset(currentZ: number, opening: number, maximumMm: number, deltaSeconds: number): number {
  const limit = clampDemoTravel(maximumMm) * SCENE_UNITS_PER_MM;
  const current = Number.isFinite(currentZ) ? Math.max(-limit, Math.min(0, currentZ)) : 0;
  const target = drawerOffset(opening, maximumMm)[2];
  const delta = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0;
  const next = current + (target - current) * (1 - Math.exp(-12 * delta));
  return Math.abs(target - next) < 0.00001 ? target : Math.max(-limit, Math.min(0, next));
}

/** A component/BOM selection highlights its entire parent drawer, preserving the
 * original linked component selection for the active part inspector and BOM.
 */
export function drawerSelection(drawers: DrawerGroup[], selectedPanelIds: string[]) {
  const selected = new Set(selectedPanelIds);
  const selectedDrawers = drawers.filter(d => d.panels.some(p => selected.has(p.component.id)));
  return {
    drawerIds: selectedDrawers.map(d => d.id),
    highlightedIds: [...new Set([...selectedPanelIds, ...selectedDrawers.flatMap(d => d.panels.map(p => p.component.id))])],
  };
}

/** Frame the whole possible visual travel envelope, not each animation step.
 * This avoids camera jumps while any number of drawers move independently.
 */
export function drawerMotionBounds(model: PreviewModel, drawers: DrawerGroup[], maximumMm: number): PreviewModel["bounds"] {
  if (!model.bounds) return null;
  const travel = clampDemoTravel(maximumMm) * SCENE_UNITS_PER_MM;
  const moving = drawers.flatMap(d => d.panels);
  const minZ = Math.min(model.bounds.center[2] - model.bounds.size[2] / 2,
    ...moving.map(p => p.center[2] - p.size[2] / 2 - travel));
  const maxZ = model.bounds.center[2] + model.bounds.size[2] / 2;
  return {
    center: [model.bounds.center[0], model.bounds.center[1], (minZ + maxZ) / 2],
    size: [model.bounds.size[0], model.bounds.size[1], maxZ - minZ],
  };
}
