import type { ExplosionMode } from "./explosion";

export default function ExplosionControls({ mode, amount, disabled, busy, onMode, onAmount, onReset }: {
  mode: ExplosionMode; amount: number; disabled: boolean; busy: boolean;
  onMode: (mode: ExplosionMode) => void; onAmount: (amount: number) => void; onReset: () => void;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Exploded View">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Exploded View</h2><button type="button" disabled={disabled} onClick={onReset} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40">Reset Explosion</button></div>
      <p className="mt-2 text-sm text-amber-200">Visualisation only — illustrative separation, not manufacturing geometry or assembly instructions.</p>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-3">Mode<select aria-label="Explosion mode" disabled={disabled} className="rounded-lg border border-white/20 bg-slate-900 px-3 py-2" value={mode} onChange={e => onMode(e.target.value as ExplosionMode)}><option value="assembly">Assembly</option><option value="panels">Individual Panels</option></select></label>
        <label className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1"><span>Explosion</span><input aria-label="Explosion percent" className="min-w-20 flex-1 accent-amber-300" disabled={disabled} type="range" min="0" max="100" step="1" value={Math.round(amount * 100)} onChange={e => onAmount(Number(e.target.value) / 100)} /><output className="w-10">{Math.round(amount * 100)}%</output></label>
      </div>
      <p className="mt-3 text-xs text-slate-400" role="status">{disabled ? "Correct the specification to enable explosion." : busy ? "Drawer opening is paused; saved slider values return after reassembly. Mode changes reassemble first." : "Assembly mode extracts rigid drawers. Individual Panels extracts drawers first, then separates panels. Use Reset view to fit the model."}</p>
    </section>
  );
}
