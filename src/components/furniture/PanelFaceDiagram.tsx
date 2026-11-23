import { useId } from "react";
import { PANEL_SIDES } from "../../manufacturing";
import type { EdgeKey, FaceKey, PanelPropertyDraft, PanelViewRotation, PanelTopology } from "../../manufacturing";
import { panelFaceView } from "../../manufacturing";

export default function PanelFaceDiagram({ topology, face, rotation, draft, selectedEdge, onSelect }: { topology: PanelTopology; face: FaceKey; rotation: PanelViewRotation; draft: PanelPropertyDraft; selectedEdge: EdgeKey; onSelect: (key: EdgeKey) => void }) {
  const markerId = useId();
  const view = panelFaceView(topology, face, rotation);
  const width = Math.max(60, 176 * view.widthMm / Math.max(view.widthMm, view.heightMm));
  const height = Math.max(24, 176 * view.heightMm / Math.max(view.widthMm, view.heightMm));
  const x = (260 - width) / 2, y = (250 - height) / 2;
  const line = { top: [x, y, x + width, y], bottom: [x, y + height, x + width, y + height], left: [x, y, x, y + height], right: [x + width, y, x + width, y + height] };
  const grain = draft.grain === "longitudinal" ? view.localU : draft.grain === "transverse" ? view.localV : null;
  return <svg viewBox="0 0 260 250" role="group" aria-label={`Interactive panel face ${face.toUpperCase()}`} className="w-full rounded-xl bg-slate-950/60">
    <rect x={x} y={y} width={width} height={height} fill="#1e293b" stroke="#94a3b8" />
    <text x="130" y={y + Math.min(23, height * 0.3)} textAnchor="middle" fill="#f1f5f9" fontSize="17">Face {face.toUpperCase()}</text>
    {grain && <path data-grain-direction={draft.grain} d={`M ${130 - grain.x * 22} ${125 + grain.y * 22} L ${130 + grain.x * 22} ${125 - grain.y * 22}`} stroke="#93c5fd" strokeWidth="2" markerStart={draft.grainSense !== "positive" ? `url(#${markerId}-start)` : undefined} markerEnd={draft.grainSense !== "negative" ? `url(#${markerId}-end)` : undefined} />}
    <defs><marker id={`${markerId}-start`} markerWidth="5" markerHeight="5" refX="1" refY="2.5" orient="auto"><path d="M 5 0 L 0 2.5 L 5 5" fill="none" stroke="#93c5fd" /></marker><marker id={`${markerId}-end`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5" fill="none" stroke="#93c5fd" /></marker></defs>
    {PANEL_SIDES.map(side => {
      const physical = view.sides[side], [x1, y1, x2, y2] = line[side], kind = draft.edges[physical.key].kind;
      const selected = selectedEdge === physical.key, assigned = !!kind && kind !== "none";
      const textX = side === "left" ? x - 9 : side === "right" ? x + width + 9 : 130;
      const textY = side === "top" ? y - 14 : side === "bottom" ? y + height + 22 : 130;
      return <g key={side} role="button" tabIndex={0} aria-label={`${side[0].toUpperCase() + side.slice(1)} edge`} aria-pressed={selected} data-physical-edge={physical.id} data-treatment-state={!kind ? "unknown" : kind === "none" ? "none" : "assigned"} className="cursor-pointer focus:outline focus:outline-2 focus:outline-blue-300" onClick={() => onSelect(physical.key)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(physical.key); } }}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="22" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={selected ? "#60a5fa" : assigned ? "#fbbf24" : "#94a3b8"} strokeWidth={selected ? 6 : assigned ? 4 : 2} strokeDasharray={!kind ? "4 3" : kind === "none" ? "1 4" : undefined} />
        <text x={textX} y={textY} textAnchor={side === "left" ? "end" : side === "right" ? "start" : "middle"} fill={selected ? "#93c5fd" : "#e2e8f0"} fontSize="11">{side[0].toUpperCase() + side.slice(1)}</text>
      </g>;
    })}
  </svg>;
}
