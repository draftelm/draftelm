import type { PanelComponent } from "../furniture";
import { createPanelTopology, panelFaceView, panelWorldToLocal, panelFaceId, EDGE_KEYS } from "../manufacturing";
import type { FaceKey, PanelViewRotation, PanelTopology, LocalPoint, PanelManufacturingProperties } from "../manufacturing";
import type { ComponentDrawingIntent } from "./planning/componentTypes";
import type { DrawingViewport, Point2 } from "./types";

export interface ManufacturingFaceView { face: FaceKey; rotation: PanelViewRotation }
export function projectPanelLocal(topology: PanelTopology, display: ManufacturingFaceView, p: LocalPoint): Point2 {
  const basis = panelFaceView(topology, display.face, display.rotation), size = topology.frame.size;
  return { x: p.u * basis.localU.x + p.v * basis.localV.x - Math.min(0, size.u * basis.localU.x) - Math.min(0, size.v * basis.localV.x), y: p.u * basis.localU.y + p.v * basis.localV.y - Math.min(0, size.u * basis.localU.y) - Math.min(0, size.v * basis.localV.y) };
}
/** Reference dimension values/IDs are unchanged; their paper axes follow the view. */
export function orientManufacturingViewport(view: DrawingViewport, panel: PanelComponent, p: PanelManufacturingProperties, group: ComponentDrawingIntent, display: ManufacturingFaceView): DrawingViewport {
  const occurrence = group.occurrences.find(o => o.componentId === p.componentId)!, topology = createPanelTopology(panel, p.orientation), basis = panelFaceView(topology, display.face, display.rotation);
  const map = (point: Point2) => projectPanelLocal(topology, display, panelWorldToLocal(topology.frame, { ...panel.position, [occurrence.displayAxes.horizontal]: panel.position[occurrence.displayAxes.horizontal] + point.x, [occurrence.displayAxes.vertical]: panel.position[occurrence.displayAxes.vertical] + point.y }));
  return { ...view, label: `${view.label} | FACE ${display.face.toUpperCase()} / ${display.rotation} deg`, manufacturingFaceView: display, entities: view.entities.map(e => ({ ...e, from: map(e.from), to: map(e.to) })), dimensions: view.dimensions.map(d => { const from = map(d.from), to = map(d.to); return { ...d, from, to, axis: Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? "horizontal" : "vertical" }; }), bounds: { min: { x: 0, y: 0 }, max: { x: basis.widthMm, y: basis.heightMm } }, annotations: [...view.annotations, `Displayed face ${display.face.toUpperCase()}; diagram turn ${display.rotation} deg. Physical edge IDs unchanged.`] };
}
export const treatmentKey = (key: typeof EDGE_KEYS[number]) => `E${EDGE_KEYS.indexOf(key) + 1}`;
export function manufacturingFaceBadge(p: PanelManufacturingProperties, display?: ManufacturingFaceView): { text: string; sourceId: string } | null {
  const face = display?.face ?? "a", f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, face))!;
  if (f.requirements.status === "unassigned") return display ? { text: `FACE ${face.toUpperCase()} VIEW`, sourceId: f.faceId } : null;
  const r = f.requirements.value, role = r.goodFaceRequirements.length ? "GOOD-FACE REQ" : r.decorative ? "DECORATIVE" : r.reverse ? "REVERSE" : r.visibleInService ? "VISIBLE REQUIRED" : "NO DECORATIVE ROLE";
  return { text: `${face.toUpperCase()}: ${role} [${f.requirements.status === "provisional" ? "P" : "V"}]`, sourceId: f.faceId };
}
