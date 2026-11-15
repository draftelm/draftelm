import type { DrawerGroup, DrawerPositions } from "./drawerMotion";
import { clampDemoTravel, MAX_DEMO_TRAVEL_MM } from "./drawerMotion";
import type { PanelRole } from "./viewerGeometry";

interface Props {
  suspended: boolean;
  drawers: DrawerGroup[];
  positions: DrawerPositions;
  selectedIds: string[];
  travelInput: string;
  visible: Record<PanelRole, boolean>;
  onSelect: (id: string, selected: boolean) => void;
  onOpening: (id: string, value: number) => void;
  onTravel: (input: string) => void;
  onReset: () => void;
}

export default function DrawerControls({ suspended, drawers, positions, selectedIds, travelInput, visible, onSelect, onOpening, onTravel, onReset }: Props) {
  const requested = travelInput.trim() === "" ? NaN : Number(travelInput);
  const effective = clampDemoTravel(requested);
  const invalidTravel = !Number.isFinite(requested) || requested < 0 || requested > MAX_DEMO_TRAVEL_MM;
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Drawer movement">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Drawer movement</h2><button type="button" onClick={onReset} disabled={!drawers.length} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40">Reset Drawers</button></div>
      <p className="mt-2 text-sm text-amber-200">Visualisation only — demonstration travel, not verified runner movement. Multiple open drawers do not demonstrate stability or safe use.</p>
      {suspended && <p className="mt-2 text-sm text-amber-200">Opening paused during explosion/reassembly. Slider values are saved; Reset Drawers clears only those saved openings.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label htmlFor="demo-drawer-travel">Demo maximum travel (mm)<input id="demo-drawer-travel" type="number" min="0" max={MAX_DEMO_TRAVEL_MM} step="1" value={travelInput} aria-invalid={invalidTravel} className="ml-3 w-24 rounded-lg border border-white/20 bg-slate-900 px-3 py-2" onChange={e => onTravel(e.target.value)} /></label>
        <span className="text-slate-400" role="status">Effective demonstration limit: {effective} mm · viewer cap {MAX_DEMO_TRAVEL_MM} mm</span>
      </div>
      {invalidTravel && <p className="mt-2 text-sm text-amber-200">Enter a finite value from 0 to {MAX_DEMO_TRAVEL_MM} mm. The visual limit is clamped; a blank or non-finite value closes travel to 0 mm.</p>}
      {!drawers.length ? <p className="mt-4 text-sm text-slate-400">Correct the specification to enable drawer movement.</p> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">{drawers.map(drawer => {
          const selected = selectedIds.includes(drawer.id), percent = Math.round((positions[drawer.id] ?? 0) * 100);
          const hidden = drawer.panels.every(p => !visible[p.role]);
          return (
            <div key={drawer.id} className={`rounded-xl border p-4 ${selected ? "border-amber-300/50 bg-amber-300/5" : "border-white/10"}`}>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select ${drawer.name}`} checked={selected} onChange={e => onSelect(drawer.id, e.target.checked)} />{drawer.name}</label>
              <p className="mt-1 break-all font-mono text-xs text-slate-400">{drawer.id} · target {percent}%</p>
              {selected && <div className="mt-3 flex items-center gap-3">
                <button type="button" className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40" disabled={effective === 0 || suspended} aria-label={`${percent > 0 ? "Close" : "Open"} ${drawer.name}`} onClick={() => onOpening(drawer.id, percent > 0 ? 0 : 1)}>{percent > 0 ? "Close" : "Open"}</button>
                <label className="flex flex-1 items-center gap-2 text-sm"><span className="sr-only">{drawer.name} opening percent</span><input aria-label={`${drawer.name} opening percent`} className="min-w-0 flex-1 accent-amber-300" type="range" min="0" max="100" step="1" value={percent} disabled={effective === 0 || suspended} onChange={e => onOpening(drawer.id, Number(e.target.value) / 100)} /><output className="w-10 text-right">{percent}%</output></label>
              </div>}
              {selected && hidden && <p className="mt-2 text-xs text-slate-400">Drawer panels are hidden. Movement is retained; enable their layers to view it.</p>}
            </div>
          );
        })}</div>
      )}
    </section>
  );
}
