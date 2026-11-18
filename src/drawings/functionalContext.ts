import type { DrawingDimension, DrawingProfile, DrawingSheet, DrawingViewport, Rect } from "./types";
import type { ContextMeasurementDisplay, FunctionalContextPlan, FunctionalContextPresentation, FunctionalContextViewDefinition } from "./planning/functionalContextTypes";
import type { FunctionalDimensionPlan } from "./planning/functionalTypes";
import { FUNCTIONAL_FRONT_ID } from "./planning/functionalContext";
import { positionViewport } from "./viewports";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { contextualViewCollisions } from "./contextualSections";
import { DEFAULT_COMPONENT_DIMENSION_STYLE as STYLE } from "./componentDimensionLayout";
import { overlaps, primitiveBounds } from "./annotationGeometry";
import { drawingRegion, viewportText } from "./layout";
import { plotDrawingAnnotations } from "./annotationPlot";
import { plotSectionMarkers } from "./sectionPlot";

export function functionalContextCollisions(view: DrawingViewport): string[] {
  const issues = contextualViewCollisions(view), markers = plotSectionMarkers(view);
  // Cutting lines intentionally cross the parent geometry. Labels/callout circles
  // must remain clear of every other reference's ink.
  for (const e of markers.filter(e => e.kind === "text" || e.kind === "circle")) for (const other of markers.filter(other => other.sourceId !== e.sourceId)) {
    if (overlaps(primitiveBounds(e), primitiveBounds(other), 0.35)) issues.push(`Context reference labels collide: ${view.id}.`);
  }
  const { heading, notes } = viewportText(view);
  if (heading.length * 3.3 + notes.length * 2.8 + 8 > view.frame.height) issues.push(`Context heading/notes cannot fit: ${view.id}.`);
  return [...new Set(issues)];
}
export function fitFunctionalContextView(view: DrawingViewport, displays: ContextMeasurementDisplay[], extraReserved: Rect[] = []): DrawingViewport {
  const coincidentNotes = displays.filter(d => d.valueMm === 0).map(display => ({ sourceId: display.id, text: `${display.requestIds.length > 1 ? `${display.requestIds.length}x ` : ""}Measured 0 mm (coincident reference planes)`, references: display.references }));
  let placed = positionViewport({ ...view, functionalContext: { ...view.functionalContext!, coincidentNotes } });
  const data = placed.functionalContext!;
  placed = { ...placed, functionalContext: { ...data, placedDisplayIds: [], deferredDisplayIds: [] } };
  for (const display of displays) {
    let found = false;
    if (display.valueMm === 0) {
      // A linked note represents coincident planes, never a zero-length edge.
      found = !functionalContextCollisions(placed).length && !extraReserved.some(r => overlaps(r, placed.frame));
    } else {
      const a = modelToSheet(placed, display.from), b = modelToSheet(placed, display.to), min = modelToSheet(placed, placed.bounds.min), max = modelToSheet(placed, placed.bounds.max);
      const prefix = `${display.requestIds.length > 1 ? `${display.requestIds.length}x ` : ""}REF `;
      const textWidth = `${prefix}${Number(display.valueMm.toFixed(6))}`.length * STYLE.textSizeMm;
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      const sides = display.axis === "horizontal" ? ["top", "bottom"] as const : ["left", "right"] as const;
      for (const side of sides) {
        for (const lane of [0, 8, 16, 24]) {
          const distance = side === "top" ? Math.min(a.y, b.y) - max.y : side === "bottom" ? min.y - Math.max(a.y, b.y) : side === "left" ? Math.min(a.x, b.x) - min.x : max.x - Math.max(a.x, b.x);
          const d: DrawingDimension = { id: display.id, semanticDimensionId: display.representativeDimensionId, equivalentFunctionalDimensionIds: display.dimensionIds,
            prefix, valueMm: display.valueMm, axis: display.axis, from: display.from, to: display.to, references: display.references, offsetPaperMm: distance + 7 + lane,
            placement: { status: "placed", side, arrows: span < textWidth + 2 * STYLE.arrowLengthMm ? "outside" : "inside", style: { ...STYLE } } };
          const candidate = { ...placed, dimensions: [...placed.dimensions, d] };
          if (!functionalContextCollisions(candidate).length && !plotDimension(candidate, d).some(e => extraReserved.some(r => overlaps(primitiveBounds(e), r, 0.5)))) { placed = candidate; found = true; break; }
        }
        if (found) break;
      }
    }
    const key = found ? "placedDisplayIds" : "deferredDisplayIds";
    placed.functionalContext = { ...placed.functionalContext!, [key]: [...placed.functionalContext![key], display.id] };
  }
  return placed;
}
function makeView(def: FunctionalContextViewDefinition, plan: FunctionalContextPlan, frame: Rect, locations: Map<string, string>): DrawingViewport {
  const children = plan.views.filter(v => v.parentViewId === def.id), section = plan.sections.find(s => s.definition.id === def.sectionId);
  const annotations = def.kind === "detail" ? ["Crop limits are not physical edges.", def.projection === "front" ? "Closed assembly; measured reveals / gaps." : "Outer: carcass side. Inner: drawer side."] :
    [def.kind === "parent" ? "Cut C-C looks down; enlarged references on FC sheets." : "Cut material hatched; uncut edges thin."];
  if (def.kind === "detail") annotations.push(`From ${def.parentViewId === FUNCTIONAL_FRONT_ID ? "FRONT" : section?.definition.label ?? "section"}: ${locations.get(def.parentViewId!) ?? "unplaced"}.`);
  const view: DrawingViewport = { id: def.id, semanticViewId: def.id, label: def.label, projection: def.projection, frame, entities: def.entities, bounds: def.bounds,
    references: def.references, dimensions: [], annotations, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1",
    functionalContext: { kind: def.kind, cutFaces: def.cutFaces, sectionId: def.sectionId, placedDisplayIds: [], deferredDisplayIds: [], coincidentNotes: [] } };
  view.sectionMarkers = children.map(child => child.kind === "section" ? (() => {
    const s = plan.sections.find(s => s.definition.id === child.sectionId)!;
    return { kind: "cutting-plane" as const, id: `marker:${s.definition.id}`, label: s.definition.label, sectionId: s.definition.id,
      from: { x: def.bounds.min.x, y: s.definition.plane.coordinateMm }, to: { x: def.bounds.max.x, y: s.definition.plane.coordinateMm }, direction: { x: 0, y: -1 }, targetViewId: child.id };
  })() : { kind: "detail-boundary" as const, id: `marker:${child.id}`, detailId: child.id, label: child.labelToken!, bounds: child.crop!, targetViewId: child.id, ...(["E", "G"].some(token => child.labelToken?.startsWith(token)) ? { calloutCorner: "bottom-right" as const } : {}) });
  const targetNotes = children.map(child => `${child.labelToken}: ${locations.get(child.id) ?? "unplaced"}`);
  if (targetNotes.length) view.annotations.push(targetNotes.join("; "));
  return fitFunctionalContextView(view, plan.displays.filter(d => def.displayIds.includes(d.id)));
}

type SheetFactory = (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet;
/** Keep sparse slots readable: first use genuinely vacant related assembly space;
 * then pack overview and enlarged details without touching the GA. */
export function buildFunctionalContextSheets(profile: DrawingProfile, plan: FunctionalContextPlan | null, sheets: DrawingSheet[], page: { width: number; height: number }, factory: SheetFactory): void {
  if (!plan || !profile.contents.functionalDimensions) return;
  const locations = new Map<string, string>(), placements = new Map<string, Rect>();
  const sideDetails = plan.views.filter(v => v.kind === "detail" && v.projection === "top");
  for (const sheet of sheets.filter(s => s.assemblyScope?.kind === "drawer" && s.assemblyPartsList)) {
    const table = sheet.assemblyPartsList!, used = table.titleHeight + table.headerHeight + table.rows.reduce((sum, r) => sum + r.height, 0);
    let y = table.frame.y + used + 6;
    const candidates = sideDetails.filter(v => !locations.has(v.id) && plan.sections.find(s => s.definition.id === v.sectionId)?.definition.requiredIntersectionIds.some(id => sheet.assemblyScope!.assemblyIds.some(a => id.startsWith(`${a}/`))));
    const height = Math.min(145, (page.height - 64 - y) / Math.max(1, candidates.length));
    if (table.frame.width < 145 || height < 115) continue;
    const annotationInk = plotDrawingAnnotations(sheet.annotationModel!, sheet).map(primitiveBounds);
    for (const def of candidates) {
      const frame = { x: table.frame.x, y, width: table.frame.width, height };
      const trialLocations = new Map(locations); trialLocations.set(def.parentViewId!, "FC-001");
      const trial = makeView(def, plan, frame, trialLocations);
      if (!sheet.viewports.some(v => overlaps(frame, v.frame)) && !annotationInk.some(r => overlaps(frame, r, 0.5)) && !functionalContextCollisions(trial).length && !trial.functionalContext!.deferredDisplayIds.length) {
        locations.set(def.id, sheet.id); placements.set(def.id, frame); y += height;
      }
    }
  }
  const newSheets: { id: string; defs: FunctionalContextViewDefinition[]; frames: Rect[] }[] = [];
  const body = drawingRegion(page);
  const overview = plan.views.filter(v => v.kind !== "detail"), remainingSides = sideDetails.filter(v => !locations.has(v.id));
  const add = (defs: FunctionalContextViewDefinition[], frames: Rect[]) => { if (!defs.length) return; const id = `FC-${String(newSheets.length + 1).padStart(3, "0")}`; newSheets.push({ id, defs, frames }); defs.forEach((d, i) => { locations.set(d.id, id); placements.set(d.id, frames[i]); }); };
  // Related views travel together. Try real, fully annotated views before
  // accepting a composition; use the established continuation path if needed.
  const families = overview.map(parent => [parent, ...plan.views.filter(v => v.kind === "detail" && v.parentViewId === parent.id && !locations.has(v.id))]);
  const relatedLayouts = page.width >= 350 && page.width < 700 && overview.length === 2 ? families.map(defs => {
    const trials = [0.34, 0.38, 0.42, 0.46, 0.5].flatMap(fraction => {
      const left = body.width * fraction, detailWidth = (body.width - left) / Math.max(1, defs.length - 1);
      const frames = defs.map((_, i) => i === 0 ? { ...body, width: left - 1 } : { ...body, x: body.x + left + (i - 1) * detailWidth, width: detailWidth - 1 });
      const arrangements = [frames];
      if (defs.length === 4) for (const topFraction of [0.4, 0.45, 0.5, 0.55]) {
        const right = { ...body, x: body.x + left, width: body.width - left - 1 }, h = body.height * topFraction;
        arrangements.push([frames[0], { ...right, height: h - 1 },
          { ...right, y: right.y + h, width: right.width / 2 - 1, height: body.height - h },
          { ...right, x: right.x + right.width / 2, y: right.y + h, width: right.width / 2 - 1, height: body.height - h }]);
      }
      return arrangements;
    }).map(frames => {
      const trialLocations = new Map(locations); plan.views.forEach(d => trialLocations.set(d.id, "FC-001"));
      const views = defs.map((d, i) => makeView(d, plan, frames[i], trialLocations));
      const valid = views.every(v => !functionalContextCollisions(v).length && !v.functionalContext!.deferredDisplayIds.length) && views.slice(1).every(v => v.scale > views[0].scale);
      const score = Math.min(...views.slice(1).map(v => v.scale), 1) * 10000 + views.reduce((sum, v) => sum + (v.bounds.max.x - v.bounds.min.x) * (v.bounds.max.y - v.bounds.min.y) * v.scale ** 2, 0);
      return { frames, valid, score };
    }).filter(t => t.valid).sort((a, b) => b.score - a.score);
    return trials[0];
  }) : [];
  if (relatedLayouts.length === families.length && relatedLayouts.every(Boolean)) {
    families.forEach((defs, i) => add(defs, relatedLayouts[i].frames));
  } else if (page.width >= 700 && overview.length === 2) {
    const details = plan.views.filter(v => v.kind === "detail" && !locations.has(v.id));
    const topHeight = body.height * 0.42, width = body.width / overview.length;
    const frames = overview.map((_, i) => ({ ...body, x: body.x + width * i, width, height: topHeight }));
    const lowerWidth = body.width / Math.max(1, details.length);
    add([...overview, ...details], [...frames, ...details.map((_, i) => ({ x: body.x + i * lowerWidth, y: body.y + topHeight, width: lowerWidth, height: body.height - topHeight }))]);
  } else if (page.width >= 350 && overview.length === 2 && remainingSides.length <= 2) {
    const leftWidth = body.width * 0.44, rightWidth = body.width - leftWidth;
    const frames = [{ ...body, width: leftWidth }, { ...body, x: body.x + leftWidth, width: rightWidth, height: remainingSides.length ? body.height * 0.5 : body.height }];
    const sideWidth = rightWidth / Math.max(1, remainingSides.length);
    add([...overview, ...remainingSides], [...frames, ...remainingSides.map((_, i) => ({ x: body.x + leftWidth + i * sideWidth, y: body.y + body.height * 0.5, width: sideWidth, height: body.height * 0.5 }))]);
  } else {
    for (let i = 0; i < overview.length; i += 2) { const defs = overview.slice(i, i + 2); add(defs, defs.map((_, j) => ({ ...body, x: body.x + body.width * j / defs.length, width: body.width / defs.length }))); }
  }
  const remaining = plan.views.filter(v => !locations.has(v.id)), perPage = page.width < 350 ? 2 : 3;
  for (let i = 0; i < remaining.length; i += perPage) { const defs = remaining.slice(i, i + perPage); add(defs, defs.map((_, j) => ({ ...body, x: body.x + body.width * j / defs.length, width: body.width / defs.length }))); }
  for (const spec of newSheets) {
    const views = spec.defs.map(d => makeView(d, plan, placements.get(d.id)!, locations)), sheet = factory(spec.id, `${spec.id} - Contextual functional relationships`, 0, views);
    sheet.annotations = ["Measured geometry; shared REF values link verified equal source relationships. No tolerances, datums or hardware installation specification.", `${views.flatMap(v => v.functionalContext!.deferredDisplayIds).length} functional annotation placements deferred on this sheet.`];
    sheets.push(sheet);
  }
  for (const [id, sheetId] of locations) {
    const existing = sheets.find(s => s.id === sheetId && !s.id.startsWith("FC-"));
    if (existing) existing.viewports.push(makeView(plan.views.find(v => v.id === id)!, plan, placements.get(id)!, locations));
  }
}
export function functionalContextPresentation(plan: FunctionalContextPlan | null, functional: FunctionalDimensionPlan, sheets: DrawingSheet[], enabled: boolean): FunctionalContextPresentation | null {
  if (!plan) return null;
  const diagnostics = plan.diagnostics.map(d => d.message);
  const assignments = functional.requests.filter(r => r.required).map(request => {
    const display = plan.displays.find(d => d.requestIds.includes(request.id));
    if (request.state === "unsupported" || !display) return { requestId: request.id, dimensionId: request.dimensionId, state: "unsupported" as const, reason: request.reason ?? "No supported contextual mapping; see plan diagnostics." };
    const sheet = sheets.find(s => s.viewports.some(v => v.id === display.viewId)), view = sheet?.viewports.find(v => v.id === display.viewId);
    const placed = enabled && !!view && (display.source === "existing-detail-B" ? view.dimensions.some(d => d.id === display.existingBindingId) : view.functionalContext?.placedDisplayIds.includes(display.id));
    const reason = placed ? undefined : !enabled ? "Contextual functional views are hidden." : !view ? "The referenced contextual section/detail is hidden or unavailable." : "No reliable dimension or linked-note placement in this contextual detail.";
    return { requestId: request.id, dimensionId: request.dimensionId, displayId: display.id, viewId: display.viewId, sheetId: sheet?.id, state: placed ? "placed" as const : "unplaced" as const, ...(reason ? { reason } : {}) };
  });
  for (const sheet of sheets) for (const view of sheet.viewports.filter(v => v.functionalContext)) diagnostics.push(...functionalContextCollisions(view));
  diagnostics.push(...assignments.filter(a => a.state !== "placed").map(a => `${a.requestId}: ${a.reason}`));
  return { assignments, diagnostics: [...new Set(diagnostics)] };
}
