import type { FurnitureResult } from "../furniture";
import type { Bounds2, DrawingDimension, DrawingProfile, DrawingSheet, DrawingViewport, Rect } from "./types";
import type { ContextualSectionPlan, SectionPresentation } from "./planning/sectionTypes";
import { SECTION_VIEW_IDS } from "./planning/contextualSections";
import { bounds2, bounds3, orthographicLines, panelReference } from "./projections";
import { cropSectionGeometry } from "./sectionGeometry";
import { positionViewport } from "./viewports";
import { DEFAULT_COMPONENT_DIMENSION_STYLE as STYLE } from "./componentDimensionLayout";
import { functionalDetailCollisions } from "./functionalDetails";
import { containsRect, overlaps, primitiveBounds } from "./annotationGeometry";
import { modelToSheet, plotDimension } from "./dimensionPlot";
import { plotSectionMarkers } from "./sectionPlot";
import { viewportText } from "./layout";

/** Dimension lines/labels/arrows remain outside the image; witness extensions may
 * meet source edges. Independent lanes are checked against earlier dimensions. */
export function contextualViewCollisions(view: DrawingViewport): string[] {
  const issues = functionalDetailCollisions(view), f = view.frame, { heading, notes } = viewportText(view);
  const bands = [{ x: f.x, y: f.y, width: f.width, height: 6 + (heading.length - 1) * 3.3 },
    { x: f.x, y: f.y + f.height - 5 - Math.max(0, notes.length - 1) * 2.8, width: f.width, height: 5 + Math.max(0, notes.length - 1) * 2.8 }];
  const marker = plotSectionMarkers(view);
  if (marker.some(e => { const box = primitiveBounds(e); return !containsRect(f, box) || bands.some(b => overlaps(box, b, 0.3)); })) issues.push(`Section reference clips or overlaps reserved text: ${view.id}.`);
  const lines = view.entities.map(e => [modelToSheet(view, e.from), modelToSheet(view, e.to)]);
  if (lines.flat().some(p => !containsRect(f, { ...p, width: 0, height: 0 }))) issues.push(`Section geometry clips the viewport: ${view.id}.`);
  const dimensionInk = view.dimensions.map(d => plotDimension(view, d).slice(2).map(primitiveBounds));
  for (let i = 0; i < dimensionInk.length; i++) {
    if (dimensionInk[i].some(a => marker.some(e => overlaps(a, primitiveBounds(e), 0.3)))) issues.push(`Section dimension overlaps a reference marker: ${view.dimensions[i].id}.`);
    for (let j = 0; j < i; j++) if (dimensionInk[i].some(a => dimensionInk[j].some(b => overlaps(a, b, 0.5)))) issues.push(`Contextual dimension lanes collide: ${view.dimensions[i].id}.`);
  }
  for (const label of view.sectionData?.identifications ?? []) {
    const box = primitiveBounds({ kind: "text", size: 2.5, text: label.text, at: label.at });
    if (view.sectionData!.cutFaces.some(face => {
      const a = modelToSheet(view, face.bounds.min), b = modelToSheet(view, face.bounds.max);
      return overlaps(box, { x: a.x, y: b.y, width: b.x - a.x, height: a.y - b.y }, 0.3);
    })) issues.push(`Section identification overlaps cut material: ${label.id}.`);
  }
  return [...new Set(issues)];
}

export function contextualSectionViews(result: FurnitureResult, plan: ContextualSectionPlan, frames: Record<"parent" | "section" | "detail", Rect>, detailSheetId: string, sectionSheetId: string): DrawingViewport[] {
  if (!plan.section || !plan.geometry || !plan.detail) return [];
  const panels = result.components.filter(c => c.kind === "panel").sort((a, b) => a.id.localeCompare(b.id)), box = bounds3(panels), section = plan.section;
  const parentEntities = orthographicLines(panels, "top");
  const detailGeometry = cropSectionGeometry(plan.geometry, plan.detail.crop);
  const references = panels.map(p => panelReference(p, result.bom.find(b => b.kind === "panel" && b.componentIds.includes(p.id))!.id));
  const make = (kind: "parent" | "section" | "detail", entities: DrawingViewport["entities"], bounds: Bounds2, label: string, annotations: string[]): DrawingViewport => ({
    id: SECTION_VIEW_IDS[kind], semanticViewId: SECTION_VIEW_IDS[kind], label, projection: kind === "parent" ? "top" : section.projection,
    frame: frames[kind], bounds, entities, dimensions: [], references, annotations, origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1",
    sectionData: { kind, sectionId: section.id, ...(kind === "detail" ? { detailId: plan.detail!.id } : {}),
      cutFaces: kind === "section" ? plan.geometry!.cutFaces : kind === "detail" ? detailGeometry.cutFaces : [],
      dimensionBindings: plan.dimensionBindings.filter(b => b.view === kind), deferredDimensionIds: [] },
  });
  const parent = make("parent", parentEntities, bounds2(parentEntities.flatMap(e => [e.from, e.to])), "TOP - CUTTING PLANE", [`A-A: ${sectionSheetId}; arrows look toward -X.`]);
  parent.sectionMarkers = [{ kind: "cutting-plane", id: `marker:${section.id}`, sectionId: section.id, label: section.label,
    from: { x: section.plane.coordinateMm, y: box.min.z }, to: { x: section.plane.coordinateMm, y: box.max.z }, direction: { x: -1, y: 0 }, targetViewId: SECTION_VIEW_IDS.section }];
  const main = make("section", plan.geometry.edges, plan.geometry.bounds, "SECTION A-A - LOOKING -X", [`Cut: hatch; retained: thin edges.`, `Detail B: ${detailSheetId}; REF source measurements.`]);
  main.sectionMarkers = [{ kind: "detail-boundary", id: `marker:${plan.detail.id}`, detailId: plan.detail.id, label: plan.detail.label, bounds: plan.detail.crop, targetViewId: SECTION_VIEW_IDS.detail }];
  const detail = make("detail", detailGeometry.edges, detailGeometry.bounds, "DETAIL B - LOWEST DRAWER / BACK / BASE", [`From A-A: ${sectionSheetId}. Crop limits are not physical edges.`, "REF measured geometry; no tolerance or fixing specification."]);
  return [parent, main, detail].map(view => {
    let placed = positionViewport(view);
    for (const binding of view.sectionData!.dimensionBindings) {
      if (binding.valueMm === 0) { placed.sectionData = { ...placed.sectionData!, deferredDimensionIds: [...placed.sectionData!.deferredDimensionIds, binding.id] }; continue; }
      const a = modelToSheet(placed, binding.from), b = modelToSheet(placed, binding.to), min = modelToSheet(placed, placed.bounds.min), max = modelToSheet(placed, placed.bounds.max);
      const sides = binding.axis === "horizontal" ? ["top", "bottom"] as const : ["left", "right"] as const;
      let found = false;
      for (const side of sides) {
        for (const lane of [0, 8, 16]) {
          const distance = side === "top" ? Math.min(a.y, b.y) - max.y : side === "bottom" ? min.y - Math.max(a.y, b.y) : side === "left" ? Math.min(a.x, b.x) - min.x : max.x - Math.max(a.x, b.x);
          const span = Math.hypot(a.x - b.x, a.y - b.y), textWidth = (`REF ${binding.valueMm}`).length * STYLE.textSizeMm;
          const dimension: DrawingDimension = { id: binding.id, semanticDimensionId: binding.semanticDimensionId, prefix: "REF ", from: binding.from, to: binding.to, axis: binding.axis,
            valueMm: binding.valueMm, references: binding.references, offsetPaperMm: distance + 7 + lane,
            placement: { status: "placed", side, arrows: span < textWidth + 2 * STYLE.arrowLengthMm ? "outside" : "inside", style: { ...STYLE } } };
          const candidate = { ...placed, dimensions: [...placed.dimensions, dimension] };
          if (!contextualViewCollisions(candidate).length) { placed = candidate; found = true; break; }
        }
        if (found) break;
      }
      if (!found) placed.sectionData = { ...placed.sectionData!, deferredDimensionIds: [...placed.sectionData!.deferredDimensionIds, binding.id] };
    }
    if (view.sectionData!.kind === "detail") {
      const rearBinding = plan.dimensionBindings.find(b => b.view === "detail" && b.anchors[0].componentId.endsWith("/rear"));
      const rear = rearBinding && panels.find(p => p.id === rearBinding.anchors[0].componentId);
      const back = rearBinding && panels.find(p => p.id === rearBinding.anchors[1].componentId);
      const base = back && panels.find(p => p.assemblyId === back.assemblyId && p.id.endsWith("/base"));
      if (rear && back && base) {
        const left = rear.position.z + rear.dimensions.z, right = back.position.z;
        const low = base.position.y + base.dimensions.y, high = Math.min(rear.position.y + rear.dimensions.y, view.bounds.max.y);
        const midX = (left + right) / 2;
        const candidates = [{ panel: rear, text: "Rear", y: low + (high - low) * 0.75, anchorX: left },
          { panel: back, text: "Back", y: low + (high - low) * 0.5, anchorX: right },
          { panel: base, text: "Base", y: low + (high - low) * 0.25, anchorX: midX }];
        const identifications: NonNullable<NonNullable<DrawingViewport["sectionData"]>["identifications"]> = [], deferredIdentificationIds: string[] = [];
        for (const c of candidates) {
          const point = modelToSheet(placed, { x: midX, y: c.y });
          const label = { id: `section-identification:${c.panel.id}`, componentId: c.panel.id, text: c.text,
            at: { x: point.x - c.text.length * 1.25, y: point.y }, anchor: { x: c.anchorX, y: c.panel === base ? low : c.y } };
          const candidate = { ...placed, sectionData: { ...placed.sectionData!, identifications: [...identifications, label] } };
          if (!contextualViewCollisions(candidate).length) identifications.push(label); else deferredIdentificationIds.push(label.id);
        }
        placed.sectionData = { ...placed.sectionData!, identifications, deferredIdentificationIds };
      }
    }
    return placed;
  });
}

type SheetFactory = (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet;
function continuationFrames(page: { width: number; height: number }): Record<"parent" | "section" | "detail", Rect> {
  const body: Rect = { x: 10, y: 23, width: page.width - 20, height: page.height - 87 };
  if (page.width < 350) return { parent: { ...body, width: body.width * 0.52 }, section: { ...body, x: body.x + body.width * 0.52, width: body.width * 0.48 }, detail: { ...body } };
  return { section: { ...body, width: body.width * 0.44 }, parent: { ...body, x: body.x + body.width * 0.44, width: body.width * 0.56, height: body.height * 0.3 },
    detail: { ...body, x: body.x + body.width * 0.44, y: body.y + body.height * 0.3, width: body.width * 0.56, height: body.height * 0.7 } };
}
/** First try unoccupied space below the carcass list. Never displace the clean GA
 * or an existing assembly view/table. Compact sheets use cross-referenced pages. */
export function buildContextualSections(result: FurnitureResult, profile: DrawingProfile, plan: ContextualSectionPlan, sheets: DrawingSheet[], page: { width: number; height: number }, makeSheet: SheetFactory): SectionPresentation | null {
  if (!profile.contents.contextualSections || !plan.section || !plan.geometry || !plan.detail) return null;
  const carcass = sheets.find(s => s.assemblyScope?.kind === "carcass" && s.viewports.length), table = carcass?.assemblyPartsList;
  let host = "SC-001", detailHost = page.width < 350 ? "SC-002" : host, continuation = true;
  let frames = continuationFrames(page);
  const usedTableHeight = table ? table.titleHeight + table.headerHeight + table.rows.reduce((sum, r) => sum + r.height, 0) : 0;
  const free = table ? { x: table.frame.x, y: table.frame.y + usedTableHeight + 6, width: table.frame.width, height: page.height - 64 - table.frame.y - usedTableHeight - 6 } : null;
  if (carcass && free && free.width >= 155 && free.height >= 350 && !carcass.viewports.some(v => overlaps(v.frame, free, 1))) {
    host = carcass.id; detailHost = host; continuation = false;
    frames = { parent: { ...free, height: 80 }, section: { ...free, y: free.y + 80, height: (free.height - 80) * 0.55 }, detail: { ...free, y: free.y + 80 + (free.height - 80) * 0.55, height: (free.height - 80) * 0.45 } };
  }
  let views = contextualSectionViews(result, plan, frames, detailHost, host);
  // A free slot is useful only if the complete composition actually fits.
  if (!continuation && (views.some(v => contextualViewCollisions(v).length || v.sectionData!.deferredDimensionIds.length || v.sectionData!.deferredIdentificationIds?.length) || views[2].scale <= views[1].scale)) {
    host = "SC-001"; detailHost = page.width < 350 ? "SC-002" : host; continuation = true;
    frames = continuationFrames(page);
    views = contextualSectionViews(result, plan, frames, detailHost, host);
  }
  const diagnostics = views.flatMap(contextualViewCollisions);
  if (views[2].scale <= views[1].scale) diagnostics.push("Detail B could not be enlarged relative to section A-A at the configured sheet size.");
  const placed = views.flatMap(v => v.dimensions.map(d => d.id)), deferred = views.flatMap(v => v.sectionData!.deferredDimensionIds);
  diagnostics.push(...views.flatMap(v => v.sectionData!.deferredIdentificationIds ?? []).map(id => `Component label deferred: ${id}.`));
  diagnostics.push(...deferred.map(id => `Context measurement ${id} deferred: no reliable dimension lane (including coincident faces). Legacy functional coverage retained.`));
  const presentation: SectionPresentation = { hostSheetId: host, detailSheetId: detailHost, parentAssemblySheetId: carcass?.id, continuation, placedBindingIds: placed, deferredBindingIds: deferred, diagnostics };
  if (continuation) {
    const add = (id: string, subset: DrawingViewport[]) => {
      const sheet = makeSheet(id, `${id} - ${id === detailHost && detailHost !== host ? "Enlarged assembly detail B" : "Assembly section A-A and contextual detail"}`, 0, subset);
      sheet.annotations = [`${carcass ? `Assembly context: ${carcass.id}. ` : ""}Measured REF dimensions repeat existing source relationships; legacy FD sheets retain full coverage.`, `${diagnostics.length} contextual placement diagnostics. Hatching denotes actual intersected panels only; no material layers inferred.`];
      sheets.push(sheet);
    };
    add(host, views.filter(v => v.id !== SECTION_VIEW_IDS.detail || host === detailHost));
    if (detailHost !== host) add(detailHost, views.filter(v => v.id === SECTION_VIEW_IDS.detail));
    if (carcass) carcass.annotations[1] = `Existing panel geometry; section A-A / detail B: ${host}${detailHost !== host ? ` / ${detailHost}` : ""}. No fixing specifications.`;
  } else { carcass!.viewports.push(...views); carcass!.annotations[1] = "Existing panel geometry; section A-A and detail B shown here. No fixing specifications."; }
  return presentation;
}
