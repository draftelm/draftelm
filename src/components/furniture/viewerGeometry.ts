import type { FurnitureResult, PanelComponent } from "../../furniture";

export type SceneVector = [number, number, number];
export type PanelRole = "carcass" | "box" | "front" | "back";
export const SCENE_UNITS_PER_MM = 0.001;
export const PANEL_STYLES: Record<PanelRole, { label: string; color: string }> = {
  carcass: { label: "Carcass", color: "#b8a58b" },
  box: { label: "Drawer boxes", color: "#e6cfab" },
  front: { label: "Decorative fronts", color: "#55778a" },
  back: { label: "Back panel", color: "#947a61" },
};
export interface PreviewPanel {
  component: PanelComponent;
  role: PanelRole;
  center: SceneVector;
  size: SceneVector;
}
export interface PreviewModel {
  panels: PreviewPanel[];
  bounds: { center: SceneVector; size: SceneVector } | null;
  error: string | null;
}

/** Presentation classification only; never used to calculate manufacturing geometry. */
export function panelRole(panel: PanelComponent): PanelRole {
  if (panel.id.endsWith("/back")) return "back";
  if (panel.assemblyId.includes("/drawer-")) return panel.id.endsWith("/front") ? "front" : "box";
  return "carcass";
}

/** Three boxes are centre-based. Preserve all world axis signs and assembled extents.
 * In particular, never add an assembly position: engine positions are already global.
 */
export function toScenePanel(panel: PanelComponent): PreviewPanel | null {
  const axes = ["x", "y", "z"] as const;
  if (axes.some(a => !Number.isFinite(panel.position[a]) || !Number.isFinite(panel.dimensions[a]) || panel.dimensions[a] <= 0)) return null;
  const size = axes.map(a => panel.dimensions[a] * SCENE_UNITS_PER_MM) as SceneVector;
  const center = axes.map(a => (panel.position[a] + panel.dimensions[a] / 2) * SCENE_UNITS_PER_MM) as SceneVector;
  if ([...center, ...size].some(v => !Number.isFinite(v))) return null;
  return { component: panel, role: panelRole(panel), center, size };
}

export function createPreviewModel(result: FurnitureResult): PreviewModel {
  const unavailable = (error: string): PreviewModel => ({ panels: [], bounds: null, error });
  if (!result.geometryValid) return unavailable("Preview paused. Correct the engineering validation errors below.");
  const source = result.components.filter(c => c.kind === "panel");
  if (!source.length) return unavailable("No physical panels were generated.");
  const panels = source.map(toScenePanel);
  if (panels.some(p => !p)) return unavailable("Preview unavailable: a panel has invalid bounds.");
  const safePanels = panels as PreviewPanel[];
  const min = [0, 1, 2].map(a => Math.min(...safePanels.map(p => p.center[a] - p.size[a] / 2)));
  const max = [0, 1, 2].map(a => Math.max(...safePanels.map(p => p.center[a] + p.size[a] / 2)));
  return { panels: safePanels, bounds: {
    center: min.map((v, a) => (v + max[a]) / 2) as SceneVector,
    size: min.map((v, a) => max[a] - v) as SceneVector,
  }, error: null };
}

export interface PanelSelection { ids: string[]; activeId: string | null }
/** Used by canvas clicks, keyboard-accessible component controls and grouped BOM rows. */
export function selectPanels(ids: readonly string[], panels: readonly PreviewPanel[], activeId?: string | null): PanelSelection {
  const available = new Set(panels.map(p => p.component.id));
  const selected = [...new Set(ids)].filter(id => available.has(id));
  return { ids: selected, activeId: activeId && selected.includes(activeId) ? activeId : selected[0] ?? null };
}
