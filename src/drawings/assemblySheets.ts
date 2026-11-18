import type { FurnitureResult } from "../furniture";
import type { DrawingProfile, DrawingSheet, DrawingViewport, Rect } from "./types";
import type { AssemblyDrawingPlan } from "./planning/assemblies";
import { assemblyPanels, translateDrawingPanels } from "./planning/assemblies";
import { explodeDrawingAssembly, explodeDrawingPanels } from "./planning/explosion";
import { bounds2, isometricLines, panelReference } from "./projections";
import { positionViewport } from "./generate";
import { createScopedAnnotations } from "./assemblyAnnotations";
import { placeComponentBalloons } from "./annotations";
import { paginateAssemblyPartsList } from "./assemblyPartsList";
import { drawingRegion } from "./layout";

export interface AssemblyScene {
  id: string; scope: NonNullable<DrawingSheet["assemblyScope"]>; subject: string;
  panels: ReturnType<typeof assemblyPanels>;
  explosion: ReturnType<typeof explodeDrawingPanels>;
}

export function assemblyVisibilityDiagnostics(scene: AssemblyScene, view: DrawingViewport): NonNullable<DrawingSheet["assemblyDiagnostics"]> {
  return [
    ...scene.explosion.unresolvedPairs.map(ids => ({ code: "projected-overlap" as const, componentIds: ids, message: `Projected panel silhouettes still overlap: ${ids.join(", ")}.` })),
    ...scene.panels.filter(p => !view.entities.some(e => e.references.some(r => r.componentId === p.id))).map(p => ({ code: "concealed-panel" as const, componentIds: [p.id], message: `No exposed edge in exploded view: ${p.id}; retained in scoped list.${scene.scope.kind === "exploded" ? " Concealed within a rigid drawer group; separated panels are shown on the drawer subassembly sheet when included." : ""}` })),
  ];
}

export function createAssemblyScenes(result: FurnitureResult, plan: AssemblyDrawingPlan): AssemblyScene[] {
  const scenes: AssemblyScene[] = [];
  const carcass = plan.groups.find(g => g.kind === "carcass");
  if (!carcass) throw new Error("Assembly drawing scene has no carcass.");
  if (plan.decisions.find(d => d.kind === "exploded")?.included) {
    const panels = assemblyPanels(result, plan, plan.rootId);
    const drawerIds = plan.groups.filter(g => g.kind === "drawer").flatMap(g => g.assemblyIds);
    scenes.push({ id: "EA-001", scope: { kind: "exploded", representativeId: plan.rootId, assemblyIds: [plan.rootId] },
      subject: "Exploded assembly - carcass panels and rigid drawer groups", panels,
      explosion: explodeDrawingAssembly(assemblyPanels(result, plan, carcass.representativeId), drawerIds.map(id => assemblyPanels(result, plan, id))) });
  }
  for (const kind of ["drawer", "carcass"] as const) {
    if (!plan.decisions.find(d => d.kind === kind)?.included) continue;
    plan.groups.filter(g => g.kind === kind).forEach((group, i) => {
      const panels = assemblyPanels(result, plan, group.representativeId);
      scenes.push({ id: `${kind === "drawer" ? "DS" : "CS"}-${String(i + 1).padStart(3, "0")}`,
        scope: { kind, representativeId: group.representativeId, assemblyIds: [...group.assemblyIds] },
        subject: `${kind === "drawer" ? "Drawer" : "Carcass"} subassembly - qty ${group.assemblyIds.length}`, panels, explosion: explodeDrawingPanels(panels) });
    });
  }
  return scenes;
}

export function buildAssemblySheets(result: FurnitureResult, profile: DrawingProfile, plan: AssemblyDrawingPlan, page: { width: number; height: number }, makeSheet: (id: string, subject: string, number: number, views: DrawingViewport[]) => DrawingSheet): DrawingSheet[] {
  const output: DrawingSheet[] = [];
  for (const scene of createAssemblyScenes(result, plan)) {
    const model = createScopedAnnotations(result, plan, scene.scope, profile.annotations);
    const body = drawingRegion(page), availableHeight = body.height, listWidth = Math.min(page.width >= 700 ? 168 : 154, (page.width - 28) * 0.44);
    const tables = profile.annotations.assemblyPartsList ? paginateAssemblyPartsList(model, listWidth, availableHeight) : [];
    const viewWidth = page.width - 20 - (tables.length === 1 ? listWidth + 6 : 0);
    const frame = { x: 10, y: 23, width: viewWidth, height: availableHeight };
    const makeView = (exploded: boolean, rect: Rect): DrawingViewport => {
      const offsets = exploded ? scene.explosion.offsets : {};
      const panels = translateDrawingPanels(scene.panels, offsets), entities = isometricLines(panels);
      const id = `${scene.id}-${exploded ? "exploded" : "assembled"}`;
      return positionViewport({ id, label: exploded ? "EXPLODED ISOMETRIC" : "ASSEMBLED ISOMETRIC", projection: "isometric",
        entities, dimensions: [], bounds: bounds2(entities.flatMap(e => [e.from, e.to])), frame: rect,
        origin: { x: 0, y: 0 }, scale: 1, scaleLabel: "1:1", annotations: [], balloonMargin: profile.annotations.balloons ? 16 : undefined,
        references: scene.panels.map(p => panelReference(p, result.bom.find(l => l.componentIds.includes(p.id))!.id)), presentationOffsets: offsets });
    };
    const candidates: DrawingViewport[][] = [];
    if (scene.scope.kind === "exploded") candidates.push([makeView(true, frame)]);
    else {
      for (const fraction of [0.4, 0.45, 0.5, 0.55, 0.6]) {
        const h = availableHeight * fraction;
        candidates.push([makeView(false, { ...frame, height: h }), makeView(true, { ...frame, y: frame.y + h, height: availableHeight - h })]);
        if (tables.length === 1) {
          const table = tables[0], used = table.titleHeight + table.headerHeight + table.rows.reduce((sum, row) => sum + row.height, 0);
          if (h >= used + 6) candidates.push([makeView(false, { ...frame, height: h }), makeView(true, { ...body, y: body.y + h, height: availableHeight - h })]);
          if (page.width < 700 && availableHeight - used - 6 > 50) {
            const right = { x: page.width - 10 - listWidth, y: body.y + used + 6, width: listWidth, height: availableHeight - used - 6 };
            candidates.push([makeView(false, frame), makeView(true, right)], [makeView(false, right), makeView(true, frame)]);
          }
        }
      }
    }
    const area = (v: DrawingViewport) => (v.bounds.max.x - v.bounds.min.x) * (v.bounds.max.y - v.bounds.min.y) * v.scale ** 2;
    // Reward both views, rather than sacrificing the assembled context for a
    // large exploded illustration. Text and balloon sizes never enter model scale.
    const score = (vs: DrawingViewport[]) => (vs.reduce((sum, v) => sum + area(v), 0) + (vs.length > 1 ? Math.min(...vs.map(area)) * 2 : 0)) * (vs.length > 1 && vs[0].scale > vs[1].scale * 2 ? 0.5 : 1);
    const views = candidates.sort((a, b) => score(b) - score(a))[0];
    const sheet = makeSheet(scene.id, scene.subject, 0, views);
    sheet.assemblyScope = scene.scope; sheet.annotationModel = model;
    // Prefer the exploded view for leaf attachments; assembled view is a context inset.
    sheet.balloons = placeComponentBalloons(model, result, [...views].reverse(), profile.annotations.balloons);
    const exploded = views.find(v => v.id.endsWith("-exploded"))!;
    sheet.assemblyDiagnostics = assemblyVisibilityDiagnostics(scene, exploded);
    sheet.annotations = [
      `Presentation offsets only; ${model.diagnostics.filter(d => d.itemKey).length} balloons unplaced; ${sheet.assemblyDiagnostics.length} unresolved visibility/overlap diagnostics.`,
      scene.scope.kind === "drawer" ? `Qty ${scene.scope.assemblyIds.length} existing panel-layout equivalents; list quantities are per drawer. No fixing or machining details.` : "Existing panel geometry only; no joint, fixing or assembly-process specification.",
    ];
    if (profile.annotations.assemblyPartsList) {
      if (tables.length === 1) {
        sheet.assemblyPartsList = tables[0]; tables[0].frame.x = page.width - 10 - listWidth;
        tables[0].frame.height = tables[0].titleHeight + tables[0].headerHeight + tables[0].rows.reduce((sum, row) => sum + row.height, 0);
      } else {
        // Use full-width continuation pages rather than reducing table lettering.
        const continuations = paginateAssemblyPartsList(model, page.width - 20, availableHeight);
        continuations.forEach((table, i) => {
          const prefix = scene.id.split("-")[0], groupIndex = Number(scene.id.split("-")[1]);
          const list = makeSheet(`${prefix}L-${String((groupIndex - 1) * 100 + i + 1).padStart(3, "0")}`, `${scene.subject} - parts list`, 0, []);
          list.assemblyPartsList = table; list.assemblyScope = scene.scope; list.annotationModel = model;
          list.annotations = ["Quantities apply to one representative assembly; occurrence mappings remain in the drawing plan."];
          output.push(list);
        });
        sheet.annotations[1] += " Parts list continues on adjacent sheets.";
      }
    }
    // Keep the parent view before its continuation tables.
    const continuationIndex = output.findIndex(s => s.annotationModel === model);
    output.splice(continuationIndex < 0 ? output.length : continuationIndex, 0, sheet);
  }
  return output;
}
