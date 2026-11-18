import { MANUFACTURING_COLUMNS } from "../../manufacturing";
import type { ManufacturingScheduleRow } from "../../manufacturing";

export default function ManufacturingSchedule({ rows, syntheticExample, onSelect }: { rows: ManufacturingScheduleRow[]; syntheticExample: boolean; onSelect: (id: string) => void }) {
  return <section aria-label="Panel manufacturing schedule" className="mt-5 rounded-xl border border-white/10 p-4">
    <h3 className="text-lg font-medium">Panel manufacturing schedule · {rows.length} physical occurrences</h3>
    <p className="mt-2 text-sm text-amber-200">{syntheticExample ? "SYNTHETIC EXAMPLE. " : ""}P = provisional / unverified; V = supplied verification record only. No approved manufacturing or purchasing data. Part numbers and finished dimensions remain Not specified.</p>
    <p className="mt-1 text-xs text-slate-400">Each row retains its own occurrence and manufacturing-variant link. Equal blank sizes do not establish interchangeability. The engineering BOM remains separate and unchanged.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-xs"><thead><tr>{MANUFACTURING_COLUMNS.map(label => <th key={label} scope="col" className="border-b border-white/20 p-3 align-top text-slate-300">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} data-manufacturing-row={row.componentId} data-manufacturing-variant={row.variantId} className="border-b border-white/10 hover:bg-white/5">{row.cells.map((cell, i) => <td key={i} className="whitespace-pre-line p-3 align-top">{i === 1 ? <><button type="button" className="text-left text-blue-200 underline decoration-blue-300/40 underline-offset-4" onClick={() => onSelect(row.componentId)}>{cell}</button><details className="mt-2"><summary>Traceability</summary><p className="mt-1 break-all">Occurrence: {row.componentId}<br />Source BOM: {row.sourceBomId}<br />Manufacturing variant is occurrence-specific unless all relevant specifications are verified.</p></details></> : cell}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
