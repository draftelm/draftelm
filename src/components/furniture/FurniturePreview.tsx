"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { createDemoChestSpecification, generateFurniture } from "../../furniture";
import { createPreviewModel, PANEL_STYLES, selectPanels } from "./viewerGeometry";
import type { PanelRole, PanelSelection } from "./viewerGeometry";
import ComponentInspector from "./ComponentInspector";
import FurnitureBOM from "./FurnitureBOM";
import ViewerBoundary from "./ViewerBoundary";
import DrawerControls from "./DrawerControls";
import ExplosionControls from "./ExplosionControls";
import DrawingPanel from "../drawings/DrawingPanel";
import type { ExplosionMode } from "./explosion";
import { clampDemoTravel, clampOpening, DEFAULT_DEMO_TRAVEL_MM, drawerSelection, groupDrawerPanels, reconcileDrawerPositions, resetDrawerPositions, setDrawerOpening } from "./drawerMotion";
import type { DrawerPositions } from "./drawerMotion";

const FurnitureCanvas = dynamic(() => import("./FurnitureCanvas"), { ssr: false, loading: () => <p className="p-8 text-slate-400">Loading 3D viewer…</p> });
const DEFAULT_INPUTS = { width: "900", height: "850", depth: "500", drawerCount: "4" };
const ALL_LAYERS: Record<PanelRole, boolean> = { carcass: true, box: true, front: true, back: true };
const FIELDS = [
  { key: "width", label: "Carcass width", unit: "mm" },
  { key: "height", label: "Carcass height", unit: "mm" },
  { key: "depth", label: "Carcass depth", unit: "mm" },
  { key: "drawerCount", label: "Drawer count", unit: "drawers" },
] as const;
const numeric = (value: string) => value.trim() === "" ? NaN : Number(value);

export default function FurniturePreview() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [requestedSelection, setRequestedSelection] = useState<PanelSelection>({ ids: [], activeId: null });
  const [visible, setVisible] = useState(ALL_LAYERS);
  const [resetKey, setResetKey] = useState(0);
  const [drawerPositions, setDrawerPositions] = useState<DrawerPositions>({});
  const [travelInput, setTravelInput] = useState(String(DEFAULT_DEMO_TRAVEL_MM));
  const [explosionMode, setExplosionMode] = useState<ExplosionMode>("assembly");
  const [explosionAmount, setExplosionAmount] = useState(0);
  const [explosionBusy, setExplosionBusy] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const rendererStatus = useCallback((ready: boolean) => { setRendererReady(ready); if (!ready) setExplosionBusy(false); }, []);
  const { specification, result, model } = useMemo(() => {
    const specification = createDemoChestSpecification();
    specification.dimensions = { width: numeric(inputs.width), height: numeric(inputs.height), depth: numeric(inputs.depth) };
    specification.drawerCount = numeric(inputs.drawerCount);
    const result = generateFurniture(specification);
    return { specification, result, model: createPreviewModel(result) };
  }, [inputs]);
  const selection = selectPanels(requestedSelection.ids, model.panels, requestedSelection.activeId);
  const drawers = useMemo(() => groupDrawerPanels(result.assemblies, model), [result.assemblies, model]);
  const positions = reconcileDrawerPositions(drawers, drawerPositions);
  const motionSelection = drawerSelection(drawers, selection.ids);
  const maximumMm = clampDemoTravel(numeric(travelInput));
  const parentDrawer = drawers.find(d => d.panels.some(p => p.component.id === selection.activeId));
  const errors = result.issues.filter(i => i.severity === "error");
  const assumptions = result.issues.filter(i => i.severity !== "error");
  function onSelect(ids: string[], activeId?: string) {
    const next = selectPanels(ids, model.panels, activeId);
    setRequestedSelection(next);
    // BOM/list selection reveals the actual part without moving any furniture geometry.
    setVisible(current => {
      const layers = { ...current };
      for (const p of model.panels) if (next.ids.includes(p.component.id)) layers[p.role] = true;
      return layers;
    });
  }
  function selectDrawer(id: string, selected: boolean) {
    const drawer = drawers.find(d => d.id === id);
    if (!drawer) return;
    const ids = drawer.panels.map(p => p.component.id);
    onSelect(selected ? [...selection.ids, ...ids] : selection.ids.filter(id => !ids.includes(id)));
  }
  function changeExplosion(value: number) {
    const amount = clampOpening(value);
    setExplosionAmount(amount);
    if (amount > 0) setExplosionBusy(true);
    else if (!rendererReady) setExplosionBusy(false);
  }
  function clearVisualState() {
    setDrawerPositions({}); setExplosionAmount(0); setExplosionBusy(false);
  }
  function reset() {
    setInputs(DEFAULT_INPUTS); setVisible(ALL_LAYERS);
    clearVisualState(); setExplosionMode("assembly"); setTravelInput(String(DEFAULT_DEMO_TRAVEL_MM));
    setRequestedSelection({ ids: [], activeId: null }); setResetKey(k => k + 1);
  }
  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-12 sm:px-8">
      <header className="mb-6 mt-8 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-blue-200">Furniture engineering · Phase 4A</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Chest of drawers</h1><p className="mt-2 text-sm text-slate-400">Parametric assembly · millimetres · single drawer column</p></div>
        <div className="max-w-md rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><strong>Preliminary design — not manufacturing-ready</strong><p className="mt-1 text-amber-100/75">Materials, hardware, fixings, loads and stability remain unverified.</p></div>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Furniture parameters">
          <h2 className="text-lg font-medium">Dimensions</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-1">{FIELDS.map(field => (
            <label key={field.key} className="block text-sm" htmlFor={`furniture-${field.key}`}>
              {field.label} <span className="text-slate-400">({field.unit})</span>
              <input id={`furniture-${field.key}`} type="number" min="1" step="1" value={inputs[field.key]} aria-invalid={errors.length > 0} className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-white outline-offset-2" onChange={event => { setInputs(current => ({ ...current, [field.key]: event.target.value })); setRequestedSelection({ ids: [], activeId: null }); clearVisualState(); }} />
            </label>
          ))}</div>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">Four drawers is the default. Other counts must pass engine validation with the current box height and hardware settings. Parts are never silently resized.</p>
          <button type="button" onClick={reset} className="mt-5 w-full rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">Reset specification</button>
          <fieldset className="mt-6 border-t border-white/10 pt-4">
            <legend className="px-1 text-sm font-medium">Visible panels</legend>
            {(Object.keys(PANEL_STYLES) as PanelRole[]).map(role => (
              <label key={role} className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={visible[role]} onChange={e => setVisible(current => ({ ...current, [role]: e.target.checked }))} /><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: PANEL_STYLES[role].color }} />{PANEL_STYLES[role].label}</label>
            ))}
          </fieldset>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">Hide outer panels to inspect the boxes. Layer visibility does not change the engineering specification or BOM.</p>
        </section>
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101b2b]" aria-label="Interactive furniture model">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm"><span aria-live="polite">{model.error ? "Preview unavailable" : `${model.panels.length} physical panels`}</span><button type="button" disabled={!!model.error} className="rounded border border-white/20 px-3 py-1 disabled:opacity-40" onClick={() => setResetKey(k => k + 1)}>Reset view</button></div>
          <div className="h-[450px] touch-none sm:h-[570px]" aria-label="3D panel canvas">
            {model.error ? <div role="status" className="flex h-full items-center justify-center p-8 text-center text-amber-200">{model.error}</div> : <ViewerBoundary onFailure={() => rendererStatus(false)}><FurnitureCanvas key={result.specificationRevision} model={model} drawers={drawers} positions={positions} maximumMm={maximumMm} visible={visible} selectedIds={motionSelection.highlightedIds} onSelect={onSelect} resetKey={resetKey} explosionMode={explosionMode} explosionAmount={explosionAmount} explosionBusy={explosionBusy} onExplosionBusy={setExplosionBusy} onRendererReady={rendererStatus} /></ViewerBoundary>}
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400"><p>Drag to orbit · right-drag to pan · scroll to zoom · touch: one finger orbit, two fingers pan/zoom.</p><p className="mt-1">World axes: X right · Y up · Z rearward. Drawers open along negative Z. Hardware allowances are listed in the BOM, not modelled as physical parts.</p></div>
        </section>
        <ComponentInspector model={model} result={result} specification={specification} selection={selection} highlightedCount={motionSelection.highlightedIds.length} parentDrawerName={parentDrawer?.name} onSelect={onSelect} />
      </div>
      <ExplosionControls mode={explosionMode} amount={explosionAmount} disabled={!!model.error} busy={explosionAmount > 0 || explosionBusy} onMode={setExplosionMode} onAmount={changeExplosion} onReset={() => changeExplosion(0)} />
      <DrawerControls suspended={explosionAmount > 0 || explosionBusy} drawers={drawers} positions={positions} selectedIds={motionSelection.drawerIds} travelInput={travelInput} visible={visible} onSelect={selectDrawer} onOpening={(id, value) => setDrawerPositions(current => setDrawerOpening(drawers, current, id, value))} onTravel={setTravelInput} onReset={() => setDrawerPositions(resetDrawerPositions(drawers))} />
      {errors.length > 0 && <section role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-5"><h2 className="font-medium text-red-200">Parameters need attention</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">{errors.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul><p className="mt-3 text-sm text-red-100">The current preview and BOM are withheld. Adjust the values or reset the specification.</p></section>}
      <details className="mt-5 rounded-xl border border-white/10 p-4 text-sm"><summary className="cursor-pointer text-slate-300">Engineering assumptions & limitations ({assumptions.length})</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-400">{assumptions.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul></details>
      <DrawingPanel result={result} />
      <FurnitureBOM result={result} selection={selection} onSelect={onSelect} />
    </div>
  );
}
