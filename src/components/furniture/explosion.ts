import type { SceneVector, PreviewModel } from "./viewerGeometry";
import type { DrawerGroup, DrawerPositions } from "./drawerMotion";
import { advanceDrawerOffset, clampOpening, drawerOffset, drawerMotionBounds } from "./drawerMotion";

export type ExplosionMode = "assembly" | "panels";
export interface ExplosionPlan {
  drawerOffsets: Record<string, SceneVector>;
  panelOffsets: Record<string, SceneVector>;
}
const zero = (): SceneVector => [0, 0, 0];
const scale = (v: SceneVector, n: number): SceneVector => v.map(x => x * n || 0) as SceneVector;

/** Presentation-only spacing derived from existing rendered bounds, in scene metres.
 * No cut sizes, manufacturing positions or installation instructions are generated.
 */
export function createExplosionPlan(model: PreviewModel, drawers: DrawerGroup[]): ExplosionPlan {
  const plan: ExplosionPlan = { drawerOffsets: {}, panelOffsets: {} };
  if (!model.bounds || model.error) return plan;
  const [width, height, depth] = model.bounds.size;
  const gap = Math.max(width * 0.12, 0.08);
  const zSeparation = Math.max(depth * 0.4, 0.12);
  const ySeparation = Math.max(...drawers.flatMap(d => d.panels.filter(p => p.role === "box").map(p => p.size[1] * 0.8)), 0.12);
  const moving = new Set(drawers.flatMap(d => d.panels.map(p => p.component.id)));
  const stationary = model.panels.filter(p => !moving.has(p.component.id));
  const carcassFrontZ = Math.min(...stationary.map(p => p.center[2] - p.size[2] / 2), 0);
  const rows = drawers.map(d => {
    const minY = Math.min(...d.panels.map(p => p.center[1] - p.size[1] / 2));
    const maxY = Math.max(...d.panels.map(p => p.center[1] + p.size[1] / 2));
    return { drawer: d, centerY: (minY + maxY) / 2, height: maxY - minY };
  }).sort((a, b) => a.centerY - b.centerY || a.drawer.id.localeCompare(b.drawer.id));
  const pitch = Math.max(...rows.map(r => r.height), 0) + 2 * ySeparation + gap;
  rows.forEach(({ drawer, centerY }, index) => {
    const maxZ = Math.max(...drawer.panels.map(p => p.center[2] + p.size[2] / 2));
    // Extra rear-panel separation remains clear of the carcass even after panel staging.
    const extract = Math.max(0, maxZ - carcassFrontZ) + 2 * zSeparation + gap;
    const stagger = rows.length > 1 ? index / (rows.length - 1) * gap : 0;
    plan.drawerOffsets[drawer.id] = [0, model.bounds!.center[1] + (index - (rows.length - 1) / 2) * pitch - centerY, -extract - stagger];
    for (const panel of drawer.panels) {
      const key = panel.component.id.split("/").slice(-1)[0];
      const xSeparation = Math.max(panel.size[0] * 0.3, width * 0.22, 0.12);
      plan.panelOffsets[panel.component.id] = key === "front" ? [0, 0, -2 * zSeparation] :
        key === "box-front" ? [0, 0, -zSeparation] : key === "rear" ? [0, 0, zSeparation] :
        key === "left" ? [-xSeparation, 0, 0] : key === "right" ? [xSeparation, 0, 0] :
        key === "bottom" ? [0, -ySeparation, 0] : zero();
    }
  });
  for (const panel of stationary) {
    const key = panel.component.id.split("/").slice(-1)[0];
    plan.panelOffsets[panel.component.id] = key === "top" ? [0, Math.max(height * 0.35, 0.2), 0] :
      key === "base" ? [0, -Math.max(height * 0.35, 0.2), 0] :
      key === "left" ? [-Math.max(width * 0.35, 0.2), 0, 0] :
      key === "right" ? [Math.max(width * 0.35, 0.2), 0, 0] :
      key === "back" ? [0, 0, Math.max(depth * 0.5, 0.2)] : zero();
  }
  return plan;
}

/** First 40% extracts rigid drawers. Remaining 60% fans panels and spaces drawer rows. */
export function explosionStages(amount: number) {
  const n = clampOpening(amount);
  return { extraction: clampOpening(n / 0.4), panels: clampOpening((n - 0.4) / 0.6) };
}
export function explosionOffsets(plan: ExplosionPlan, mode: ExplosionMode, amount: number): ExplosionPlan {
  const n = clampOpening(amount), stage = explosionStages(n);
  return {
    drawerOffsets: Object.fromEntries(Object.entries(plan.drawerOffsets).map(([id, v]) =>
      [id, mode === "assembly" ? [0, 0, v[2] * n] : [0, v[1] * stage.panels, v[2] * stage.extraction]])),
    panelOffsets: Object.fromEntries(Object.entries(plan.panelOffsets).map(([id, v]) => [id, scale(v, mode === "panels" ? stage.panels : 0)])),
  };
}

export interface VisualFrame { mode: ExplosionMode; amount: number; openingZ: Record<string, number> }
export function initialVisualFrame(mode: ExplosionMode): VisualFrame { return { mode, amount: 0, openingZ: {} }; }
function easeAmount(current: number, target: number, delta: number) {
  const dt = Number.isFinite(delta) ? Math.min(0.1, Math.max(0, delta)) : 0;
  const difference = target - current;
  const step = Math.min(Math.abs(difference) * (1 - Math.exp(-8 * dt)), dt * 0.9);
  const next = current + Math.sign(difference) * step;
  return Math.abs(target - next) < 0.00001 ? target : clampOpening(next);
}

/** One state machine owns all visual transforms. Explosion and opening never add up.
 * No saved target is edited: extraction waits for displayed opening to close;
 * return/mode-switch waits for displayed explosion to fully reassemble.
 */
export function advanceVisualFrame(frame: VisualFrame, mode: ExplosionMode, amount: number, drawers: DrawerGroup[], positions: DrawerPositions, maximumMm: number, delta: number): VisualFrame {
  const target = clampOpening(amount);
  if (frame.amount > 0) {
    const nextAmount = easeAmount(frame.amount, frame.mode === mode ? target : 0, delta);
    return { mode: nextAmount === 0 ? mode : frame.mode, amount: nextAmount, openingZ: Object.fromEntries(drawers.map(d => [d.id, 0])) };
  }
  const openingZ = Object.fromEntries(drawers.map(d => [d.id,
    advanceDrawerOffset(frame.openingZ[d.id] ?? 0, target > 0 ? 0 : positions[d.id] ?? 0, maximumMm, delta),
  ]));
  const closed = Object.values(openingZ).every(z => z === 0);
  return { mode, amount: target > 0 && closed ? easeAmount(0, target, delta) : 0, openingZ };
}
export function visualFrameSettled(frame: VisualFrame, mode: ExplosionMode, amount: number, drawers: DrawerGroup[], positions: DrawerPositions, maximumMm: number) {
  const target = clampOpening(amount);
  return frame.mode === mode && frame.amount === target && drawers.every(d => (frame.openingZ[d.id] ?? 0) === (target > 0 ? 0 : drawerOffset(positions[d.id] ?? 0, maximumMm)[2]));
}

/** Camera envelope covers closed/open, both explosion modes, and the extraction stage. */
export function explosionBounds(model: PreviewModel, drawers: DrawerGroup[], plan: ExplosionPlan, maximumMm: number): PreviewModel["bounds"] {
  if (!model.bounds) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const parents = new Map(drawers.flatMap(d => d.panels.map(p => [p.component.id, d.id] as const)));
  for (const [mode, amount] of [["assembly", 0], ["assembly", 1], ["panels", 0.4], ["panels", 1]] as const) {
    const offsets = explosionOffsets(plan, mode, amount);
    for (const panel of model.panels) {
      const parent = parents.get(panel.component.id);
      for (let a = 0; a < 3; a++) {
        const center = panel.center[a] + (parent ? offsets.drawerOffsets[parent]?.[a] ?? 0 : 0) + (offsets.panelOffsets[panel.component.id]?.[a] ?? 0);
        min[a] = Math.min(min[a], center - panel.size[a] / 2);
        max[a] = Math.max(max[a], center + panel.size[a] / 2);
      }
    }
  }
  const normal = drawerMotionBounds(model, drawers, maximumMm)!;
  for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], normal.center[a] - normal.size[a] / 2);
    max[a] = Math.max(max[a], normal.center[a] + normal.size[a] / 2);
  }
  return {
    center: min.map((v, a) => (v + max[a]) / 2) as SceneVector,
    size: min.map((v, a) => max[a] - v) as SceneVector,
  };
}
