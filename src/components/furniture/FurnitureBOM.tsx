import type { FurnitureResult } from "../../furniture";
import type { PanelSelection } from "./viewerGeometry";

export default function FurnitureBOM({ result, selection, onSelect }: { result: FurnitureResult; selection: PanelSelection; onSelect: (ids: string[]) => void }) {
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Component bill of materials">
      <h2 className="text-lg font-medium">Components & bill of materials</h2>
      <p className="mt-1 text-sm text-slate-400">Select a panel line to highlight its parts. Hardware entries are unverified allowances and are not rendered. Scroll the table horizontally on smaller screens.</p>
      {result.geometryValid ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-slate-400"><tr><th scope="col" className="p-3">Part / material</th><th scope="col" className="p-3">Cut size (mm)</th><th scope="col" className="p-3">Qty</th><th scope="col" className="p-3">Inspect</th></tr></thead>
            <tbody>{result.bom.map(line => {
              const selected = line.kind === "panel" && line.componentIds.some(id => selection.ids.includes(id));
              return (
                <tr key={line.id} className={`border-t border-white/10 ${selected ? "bg-amber-300/10" : ""}`}>
                  <td className="p-3"><span className="block">{line.partNames.join(" / ")}</span><span className="text-xs text-slate-400">{line.itemId}</span></td>
                  <td className="whitespace-nowrap p-3">{line.cutSize ? `${line.cutSize.length} × ${line.cutSize.width} × ${line.cutSize.thickness}` : "Hardware allowance"}</td>
                  <td className="p-3">{line.quantity}</td>
                  <td className="p-3">{line.kind === "panel" ? <button type="button" aria-pressed={selected} className="whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10" onClick={() => onSelect(line.componentIds)}>Highlight {line.quantity} {line.quantity === 1 ? "panel" : "panels"}</button> : <span className="text-xs text-slate-400">Not rendered</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-amber-200">BOM withheld until the parameters pass engineering validation.</p>}
    </section>
  );
}
