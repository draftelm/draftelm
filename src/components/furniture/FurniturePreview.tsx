"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { createDemoChestSpecification, generateFurniture } from "../../furniture";
import { createPreviewModel, PANEL_STYLES, selectPanels } from "./viewerGeometry";
import type { PanelRole, PanelSelection } from "./viewerGeometry";
import ComponentInspector from "./ComponentInspector";
import FurnitureBOM from "./FurnitureBOM";
import ViewerBoundary from "./ViewerBoundary";

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
  const { specification, result, model } = useMemo(() => {
    const specification = createDemoChestSpecification();
    specification.dimensions = { width: numeric(inputs.width), height: numeric(inputs.height), depth: numeric(inputs.depth) };
    specification.drawerCount = numeric(inputs.drawerCount);
    const result = generateFurniture(specification);
    return { specification, result, model: createPreviewModel(result) };
  }, [inputs]);
  const selection = selectPanels(requestedSelection.ids, model.panels, requestedSelection.activeId);
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
  function reset() {
    setInputs(DEFAULT_INPUTS); setVisible(ALL_LAYERS);
    setRequestedSelection({ ids: [], activeId: null }); setResetKey(k => k + 1);
  }
  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-12 sm:px-8">
      <header className="mb-6 mt-8 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-blue-200">Furniture engineering · Phase 2</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Chest of drawers</h1><p className="mt-2 text-sm text-slate-400">Parametric assembly · millimetres · single drawer column</p></div>
        <div className="max-w-md rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"><strong>Preliminary design — not manufacturing-ready</strong><p className="mt-1 text-amber-100/75">Materials, hardware, fixings, loads and stability remain unverified.</p></div>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Furniture parameters">
          <h2 className="text-lg font-medium">Dimensions</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-1">{FIELDS.map(field => (
            <label key={field.key} className="block text-sm" htmlFor={`furniture-${field.key}`}>
              {field.label} <span className="text-slate-400">({field.unit})</span>
              <input id={`furniture-${field.key}`} type="number" min="1" step="1" value={inputs[field.key]} aria-invalid={errors.length > 0} className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-white outline-offset-2" onChange={event => { setInputs(current => ({ ...current, [field.key]: event.target.value })); setRequestedSelection({ ids: [], activeId: null }); }} />
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
            {model.error ? <div role="status" className="flex h-full items-center justify-center p-8 text-center text-amber-200">{model.error}</div> : <ViewerBoundary><FurnitureCanvas model={model} visible={visible} selectedIds={selection.ids} onSelect={onSelect} resetKey={resetKey} /></ViewerBoundary>}
          </div>
          <div className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-slate-400"><p>Drag to orbit · right-drag to pan · scroll to zoom · touch: one finger orbit, two fingers pan/zoom.</p><p className="mt-1">World axes: X right · Y up · Z rearward. Hardware allowances are listed in the BOM, not modelled as physical parts.</p></div>
        </section>
        <ComponentInspector model={model} result={result} specification={specification} selection={selection} onSelect={onSelect} />
      </div>
      {errors.length > 0 && <section role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-5"><h2 className="font-medium text-red-200">Parameters need attention</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-100">{errors.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}</ul><p className="mt-3 text-sm text-red-100">The current preview and BOM are withheld. Adjust the values or reset the specification.</p></section>}
      <details className="mt-5 rounded-xl border border-white/10 p-4 text-sm"><summary className="cursor-pointer text-slate-300">Engineering assumptions & limitations ({assumptions.length})</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-slate-400">{assumptions.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul></details>
      <FurnitureBOM result={result} selection={selection} onSelect={onSelect} />
    </div>
  );
}
