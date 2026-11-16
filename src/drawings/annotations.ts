import type { FurnitureResult } from "../furniture";
import type { DrawingAnnotationModel, DrawingProfile, DrawingSheet, DrawingViewport, PlacedComponentBalloon } from "./types";
import { reconcileDrawingParts } from "./reconcile";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { panelReference, projectPoint } from "./projections";
import { viewportPadding } from "./layout";
import { BALLOON_STYLE, anchorIsVisible, balloonBounds, containsRect, overlaps, panelEdges, pointOnSegment, primitiveBounds, segmentHitsRect, segmentsIntersect, visibleAnchorCandidates } from "./annotationGeometry";

const ordered = (ids: string[]) => [...ids].sort();
const sameIds = (a: string[], b: string[]) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

/** Number validated BOM groups by canonical physical membership, never BOM array order,
 * dimensions, names or transient bom-N IDs. Regrouping can intentionally renumber items. */
export function createDrawingAnnotations(result: FurnitureResult, settings: DrawingProfile["annotations"]): DrawingAnnotationModel {
  if (!result.geometryValid || !reconcileDrawingParts(result).valid) throw new Error("Annotations require reconciled engineering geometry/BOM.");
  const lines = result.bom.filter(line => line.kind === "panel").map(line => ({ line, key: `panel:${JSON.stringify(ordered(line.componentIds))}` })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const items = lines.map(({ line, key }, index) => ({ key, number: index + 1, label: `${settings.itemNumberStyle === "prefixed" ? "P" : ""}${index + 1}`,
    bomId: line.id, kind: "panel" as const, componentIds: ordered(line.componentIds), description: line.partNames.join(" / "), quantity: line.quantity,
    materialId: line.itemId, cuttingListBomId: line.id,
    references: ordered(line.componentIds).map(id => { const component = result.components.find(c => c.id === id)!; return { componentId: id, assemblyId: component.assemblyId, bomId: line.id }; }) }));
  const balloons = items.flatMap(item => (settings.balloonDisplay === "one-per-item" ? [item.componentIds] : item.componentIds.map(id => [id])).map(ids => ({
    kind: "component-balloon" as const, id: `balloon-${item.number}-${encodeURIComponent(ids[0])}`,
    itemKey: item.key, componentIds: [...ids], scope: settings.balloonDisplay === "one-per-item" ? "group-representative" as const : "occurrence" as const,
  })));
  return { schemaVersion: 1, groupingPolicy: "bom-membership-v1", items, balloons, anchors: [], leaders: [],
    partsList: { kind: "assembly-parts-list", id: "assembly-parts-list", scope: "panels", itemKeys: items.map(item => item.key) }, diagnostics: [] };
}

/** Deterministic conservative rail placement. Failed placements remain explicit diagnostics. */
export function placeComponentBalloons(model: DrawingAnnotationModel, result: FurnitureResult, views: DrawingViewport[], enabled: boolean): PlacedComponentBalloon[] {
  if (!enabled) return [];
  const panels = result.components.filter(c => c.kind === "panel"), placements: PlacedComponentBalloon[] = [];
  const priority = ["isometric", "front", "top", "right"];
  const candidates = [...views].sort((a, b) => priority.indexOf(a.projection) - priority.indexOf(b.projection));
  for (const balloon of model.balloons) {
    let placed = false, visible = false;
    for (const view of candidates) {
      const pad = viewportPadding(view);
      const obstacles = view.dimensions.flatMap(d => plotDimension(view, d)).map(primitiveBounds);
      const slots = [];
      for (let y = view.frame.y + pad.top + 5; y <= view.frame.y + view.frame.height - pad.bottom - 5; y += 9.5) {
        for (const x of [view.frame.x + 5, view.frame.x + view.frame.width - 5]) slots.push({ x, y });
      }
      for (const id of balloon.componentIds) {
        const panel = panels.find(p => p.id === id)!;
        for (const candidate of visibleAnchorCandidates(panel, view, panels)) {
          visible = true;
          const nearestSlots = [...slots].sort((a, b) => Math.hypot(a.x - candidate.paper.x, a.y - candidate.paper.y) - Math.hypot(b.x - candidate.paper.x, b.y - candidate.paper.y));
          for (const center of nearestSlots) {
            const box = balloonBounds(center), distance = Math.hypot(candidate.paper.x - center.x, candidate.paper.y - center.y);
            if (distance <= BALLOON_STYLE.radius + 2 || !containsRect(view.frame, box) || obstacles.some(obstacle => overlaps(box, obstacle, 0.7))) continue;
            const start = { x: center.x + (candidate.paper.x - center.x) / distance * BALLOON_STYLE.radius, y: center.y + (candidate.paper.y - center.y) / distance * BALLOON_STYLE.radius };
            if (obstacles.some(obstacle => segmentHitsRect(start, candidate.paper, obstacle))) continue;
            if (placements.some(previous => overlaps(box, balloonBounds(previous.center), 0.7) || segmentHitsRect(start, candidate.paper, balloonBounds(previous.center)) ||
              segmentHitsRect(previous.leaderPoints[0], previous.leaderPoints[1], box) || segmentsIntersect(start, candidate.paper, previous.leaderPoints[0], previous.leaderPoints[1]))) continue;
            const anchorId = `${balloon.id}-anchor`, leaderId = `${balloon.id}-leader`, item = model.items.find(i => i.key === balloon.itemKey)!;
            model.anchors.push({ kind: "panel-edge", id: anchorId, viewportId: view.id, sourceLineId: candidate.sourceLineId,
              reference: panelReference(panel, item.bomId), point: candidate.point, edgeStart: candidate.edge.from, edgeEnd: candidate.edge.to, visibility: "verified-visible" });
            model.leaders.push({ kind: "leader", id: leaderId, balloonId: balloon.id, anchorId });
            placements.push({ annotationId: balloon.id, anchorId, leaderId, viewportId: view.id, center, leaderPoints: [start, candidate.paper] });
            placed = true; break;
          }
          if (placed) break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) model.diagnostics.push({ code: !views.length ? "assembly-views-hidden" : visible ? "layout-full" : "no-visible-edge", annotationId: balloon.id, itemKey: balloon.itemKey,
      componentIds: [...balloon.componentIds], message: !views.length ? "Assembly views are hidden; balloon not placed." : visible ? "No collision-free balloon/leader position fits the selected views." : "No reliably visible panel edge of readable length in the selected closed-assembly views." });
  }
  return placements;
}

/** Independent checks of annotation identities, coverage, physical anchors and rendered links. */
export function validateDrawingAnnotations(result: FurnitureResult, model: DrawingAnnotationModel, sheets: DrawingSheet[] = []): string[] {
  const issues: string[] = [], coverage = new Map<string, number>(), numbers = new Set<number>(), keys = new Set<string>();
  const panels = result.components.filter(c => c.kind === "panel");
  for (const item of model.items) {
    const line = result.bom.find(l => l.id === item.bomId);
    if (!line || line.kind !== "panel" || !sameIds(line.componentIds, item.componentIds) || line.quantity !== item.quantity || line.itemId !== item.materialId || item.description !== line.partNames.join(" / ") || item.cuttingListBomId !== line.id) issues.push(`Assembly parts-list item ${item.label} disagrees with BOM ${item.bomId}.`);
    if (!sameIds(item.references.map(r => r.componentId), item.componentIds) || item.references.some(ref => ref.bomId !== item.bomId || ref.assemblyId !== result.components.find(c => c.id === ref.componentId)?.assemblyId)) issues.push(`Assembly parts-list references disagree with source components: ${item.label}.`);
    if (keys.has(item.key) || numbers.has(item.number) || !Number.isSafeInteger(item.number) || item.number < 1) issues.push(`Duplicate/invalid assembly item identity: ${item.label}.`);
    keys.add(item.key); numbers.add(item.number);
    item.componentIds.forEach(id => coverage.set(id, (coverage.get(id) ?? 0) + 1));
  }
  if (!sameIds(model.partsList.itemKeys, model.items.map(item => item.key))) issues.push("Assembly parts-list item coverage is incomplete or duplicated.");
  if (panels.some(p => coverage.get(p.id) !== 1) || [...coverage.keys()].some(id => !panels.some(p => p.id === id))) issues.push("Assembly item numbering does not account for every physical panel exactly once.");
  for (const balloon of model.balloons) {
    const item = model.items.find(i => i.key === balloon.itemKey);
    if (!item || !balloon.componentIds.length || balloon.componentIds.some(id => !item.componentIds.includes(id)) || (balloon.scope === "group-representative" && !sameIds(balloon.componentIds, item.componentIds)) || (balloon.scope === "occurrence" && balloon.componentIds.length !== 1)) issues.push(`Invalid balloon-to-item relationship: ${balloon.id}.`);
  }
  for (const collection of [model.balloons, model.anchors, model.leaders]) if (new Set(collection.map(entity => entity.id)).size !== collection.length) issues.push("Duplicate semantic annotation ID.");
  const views = sheets.flatMap(s => s.viewports);
  for (const anchor of model.anchors) {
    const panel = panels.find(p => p.id === anchor.reference.componentId), view = views.find(v => v.id === anchor.viewportId);
    const validEdge = panel && panelEdges(panel).some(edge => JSON.stringify(edge.from) === JSON.stringify(anchor.edgeStart) && JSON.stringify(edge.to) === JSON.stringify(anchor.edgeEnd));
    const projected = view && view.projection !== "panel-face" ? projectPoint(anchor.point, view.projection) : null;
    const line = view?.entities.find(e => e.id === anchor.sourceLineId && e.references.some(r => r.componentId === panel?.id));
    const onEdge = validEdge && (["x", "y", "z"] as const).every(axis => anchor.point[axis] >= Math.min(anchor.edgeStart[axis], anchor.edgeEnd[axis]) - 1e-6 && anchor.point[axis] <= Math.max(anchor.edgeStart[axis], anchor.edgeEnd[axis]) + 1e-6);
    if (!panel || !view || !line || !projected || !onEdge || anchor.reference.assemblyId !== panel.assemblyId || !pointOnSegment(projected, line.from, line.to) || !anchorIsVisible(anchor.point, view.projection as "front" | "top" | "right" | "isometric", panels)) issues.push(`Unreliable or detached balloon anchor: ${anchor.id}.`);
  }
  const allPlacements = sheets.flatMap(s => s.balloons ?? []);
  if (new Set(allPlacements.map(p => p.annotationId)).size !== allPlacements.length || model.anchors.length !== allPlacements.length || model.leaders.length !== allPlacements.length) issues.push("Duplicate or orphan balloon placements, leaders or anchors.");
  for (const sheet of sheets) for (const placement of sheet.balloons ?? []) {
    const balloon = model.balloons.find(b => b.id === placement.annotationId), anchor = model.anchors.find(a => a.id === placement.anchorId), view = views.find(v => v.id === placement.viewportId);
    const item = model.items.find(i => i.key === balloon?.itemKey), leader = model.leaders.find(l => l.id === placement.leaderId);
    if (!balloon || !anchor || !view || !item || !balloon.componentIds.includes(anchor.reference.componentId) || anchor.reference.bomId !== item.bomId || !leader || leader.anchorId !== anchor.id || leader.balloonId !== balloon.id || anchor.viewportId !== view.id || placement.leaderPoints.length !== 2) { issues.push(`Invalid placed balloon/leader relationship: ${placement.annotationId}.`); continue; }
    const point = modelToSheet(view, projectPoint(anchor.point, view.projection as "front" | "top" | "right" | "isometric"));
    if (Math.hypot(point.x - placement.leaderPoints[1].x, point.y - placement.leaderPoints[1].y) > 1e-6 || !containsRect(view.frame, balloonBounds(placement.center))) issues.push(`Balloon placement is detached or outside its viewport: ${balloon.id}.`);
    const dimensions = view.dimensions.flatMap(d => plotDimension(view, d)).map(primitiveBounds);
    if (dimensions.some(box => overlaps(box, balloonBounds(placement.center), 0.7) || segmentHitsRect(placement.leaderPoints[0], placement.leaderPoints[1], box))) issues.push(`Balloon/leader overlaps a dimension: ${balloon.id}.`);
  }
  for (let i = 0; i < allPlacements.length; i++) for (let j = i + 1; j < allPlacements.length; j++) {
    const a = allPlacements[i], b = allPlacements[j];
    if (overlaps(balloonBounds(a.center), balloonBounds(b.center), 0.7) || segmentsIntersect(a.leaderPoints[0], a.leaderPoints[1], b.leaderPoints[0], b.leaderPoints[1])) issues.push("Balloon placements or leader paths overlap.");
  }
  const tables = sheets.flatMap(s => s.assemblyPartsList ? [s.assemblyPartsList] : []);
  if (tables.length) {
    const fragments = tables.flatMap(t => t.rows);
    const compact = (value: string) => value.replace(/\s/g, "");
    for (const item of model.items) {
      const rows = fragments.filter(row => row.itemKey === item.key);
      if (rows.filter(row => !row.continuation).length !== 1 || rows.some(row => row.cells[0][0] !== item.label) || rows.flatMap(row => row.cells[2]).join("") !== String(item.quantity) ||
        compact(rows.flatMap(row => row.cells[1]).join("")) !== compact(item.description) || compact(rows.flatMap(row => row.cells[3]).join("")) !== compact(item.materialId)) issues.push(`Rendered assembly parts list disagrees with BOM item ${item.label}.`);
    }
    if (fragments.some(row => !keys.has(row.itemKey))) issues.push("Rendered assembly parts list references an unknown item.");
    for (const sheet of sheets) if (sheet.assemblyPartsList) {
      const table = sheet.assemblyPartsList;
      if (table.fontSize < 2.5 || sheet.viewports.some(view => overlaps(view.frame, table.frame))) issues.push(`Assembly parts list overlaps a view or has unreadable lettering: ${sheet.id}.`);
    }
  }
  return issues;
}
