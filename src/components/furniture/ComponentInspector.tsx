import type { FurnitureResult, FurnitureSpecification } from "../../furniture";
import type { PanelSelection, PreviewModel } from "./viewerGeometry";

interface Props {
  model: PreviewModel;
  result: FurnitureResult;
  specification: FurnitureSpecification;
  selection: PanelSelection;
  onSelect: (ids: string[], activeId?: string) => void;
}
const mm = (n: number) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 }).format(n);

export default function ComponentInspector({ model, result, specification, selection, onSelect }: Props) {
  const panel = model.panels.find(p => p.component.id === selection.activeId)?.component;
  const assemblyName = (id: string) => result.assemblies.find(a => a.id === id)?.name ?? id;
  const material = panel && specification.materials.find(m => m.id === panel.materialId);
  return (
    <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Component inspector">
      <h2 className="text-lg font-medium">Inspect a panel</h2>
      <p className="mt-1 text-sm text-slate-400">Click the model, choose a component, or select a BOM line.</p>
      <label className="mt-5 block text-sm" htmlFor="active-panel">Component</label>
      <select id="active-panel" className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-2 text-sm" value={selection.activeId ?? ""} onChange={e => onSelect(e.target.value ? [e.target.value] : [])} disabled={!model.panels.length}>
        <option value="">Choose a panel</option>
        {model.panels.map(({ component: c }) => <option key={c.id} value={c.id}>{assemblyName(c.assemblyId)} / {c.name}</option>)}
      </select>
      {selection.ids.length > 1 && (
        <div className="mt-3 text-sm">
          <p>{selection.ids.length} panels highlighted. Inspect one:</p>
          <div className="mt-2 flex flex-wrap gap-2">{selection.ids.map(id => <button type="button" key={id} className="rounded border border-white/20 px-2 py-1" onClick={() => onSelect(selection.ids, id)}>{id.split("/").slice(-2).join(" / ")}</button>)}</div>
        </div>
      )}
      {panel ? (
        <dl className="mt-5 space-y-4 text-sm" aria-live="polite">
          <div><dt className="text-slate-400">Part</dt><dd className="mt-1">{panel.name}</dd></div>
          <div><dt className="text-slate-400">Component ID</dt><dd className="mt-1 break-all font-mono text-xs">{panel.id}</dd></div>
          <div><dt className="text-slate-400">Dimensions · X × Y × Z</dt><dd className="mt-1">{mm(panel.dimensions.x)} × {mm(panel.dimensions.y)} × {mm(panel.dimensions.z)} mm</dd></div>
          <div><dt className="text-slate-400">Global minimum corner · X, Y, Z</dt><dd className="mt-1">{mm(panel.position.x)}, {mm(panel.position.y)}, {mm(panel.position.z)} mm</dd></div>
          <div><dt className="text-slate-400">Material</dt><dd className="mt-1">{material?.name ?? panel.materialId}<span className="mt-1 block font-mono text-xs text-slate-400">{panel.materialId}</span></dd></div>
          <div><dt className="text-slate-400">Assembly</dt><dd className="mt-1">{assemblyName(panel.assemblyId)}<span className="mt-1 block break-all font-mono text-xs text-slate-400">{panel.assemblyId}</span></dd></div>
          <div><dt className="text-slate-400">Stock thickness</dt><dd className="mt-1">{mm(panel.thickness)} mm · {panel.thicknessAxis.toUpperCase()} axis</dd></div>
        </dl>
      ) : <p className="mt-6 text-sm text-slate-400">No panel selected.</p>}
    </aside>
  );
}
