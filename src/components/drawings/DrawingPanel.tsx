"use client";

import { useMemo, useState } from "react";
import type { FurnitureResult } from "../../furniture";
import { DEFAULT_DRAWING_OPTIONS, FORMAL_TEMPLATE_LABEL, generateDrawingDocument } from "../../drawings";
import type { DrawingOptions, DrawingTemplate, ProjectionConvention } from "../../drawings";
import SheetPreview from "./SheetPreview";

export default function DrawingPanel({ result }: { result: FurnitureResult }) {
  const [options, setOptions] = useState<DrawingOptions>(DEFAULT_DRAWING_OPTIONS);
  const [selectedSheet, setSelectedSheet] = useState("GA-001");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const generation = useMemo(() => generateDrawingDocument(result, options), [result, options]);
  const document = generation.document;
  const sheet = document?.sheets.find(s => s.id === selectedSheet) ?? document?.sheets[0];
  async function exportPDF() {
    if (!document) return;
    setExporting(true); setExportError("");
    try {
      const { exportDrawingPDF } = await import("../../drawings/pdf");
      const bytes = await exportDrawingPDF(document);
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = `DRAFTELM-${options.drawingPrefix}-${options.revision}.pdf`;
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError("PDF export failed. The drawing preview is still available; please try again."); }
    finally { setExporting(false); }
  }
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Engineering drawings">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">2D drawings · Phase 4A</h2><button type="button" disabled={!document || exporting} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40" onClick={exportPDF}>{exporting ? "Exporting…" : "Export vector PDF"}</button></div>
      <p className="mt-2 text-sm text-amber-200">Preliminary nominal drawings — not for manufacture. BS 8888:2025 requirements have not been individually verified against licensed standards.</p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <label>Drawing template<select aria-label="Drawing template" className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={options.template} onChange={e => setOptions(o => ({ ...o, template: e.target.value as DrawingTemplate }))}><option value="workshop">Furniture Workshop</option><option value="engineering">{FORMAL_TEMPLATE_LABEL}</option></select></label>
        <label>Projection convention<select aria-label="Projection convention" className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={options.projectionConvention} onChange={e => setOptions(o => ({ ...o, projectionConvention: e.target.value as ProjectionConvention }))}><option value="third-angle">Third-angle</option><option value="first-angle">First-angle</option></select></label>
        <label>Project name<input aria-label="Drawing project name" maxLength={60} className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={options.projectName} onChange={e => setOptions(o => ({ ...o, projectName: e.target.value }))} /></label>
        <label>Drawing revision<input aria-label="Drawing revision" maxLength={60} className="mt-2 w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={options.revision} onChange={e => setOptions(o => ({ ...o, revision: e.target.value }))} /></label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">A3 landscape · model dimensions in mm · plotted scales are shown per view. Drawings use the closed engine assembly, independent of drawer movement, explosion and hidden layers. Overall depth includes projecting fronts; carcass depth is dimensioned separately.</p>
      {document && sheet ? <>
        <label className="mt-4 block text-sm">Drawing sheet<select aria-label="Drawing sheet" className="ml-3 max-w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={sheet.id} onChange={e => setSelectedSheet(e.target.value)}>{document.sheets.map(s => <option key={s.id} value={s.id}>{s.metadata.number}/{s.metadata.total} · {s.metadata.subject}</option>)}</select></label>
        <div className="mt-4 overflow-auto rounded-lg bg-slate-200 p-2 sm:p-4"><div className="min-w-[720px]"><SheetPreview document={document} sheet={sheet} /></div></div>
        <p className="mt-2 text-xs text-slate-400">Scroll the sheet horizontally on small screens. Orthographic views show visible panel outlines. The isometric is a parallel wireframe illustration, not a perspective rendering or hidden-line drawing. PDF: print at Actual size / 100%; browser scaling changes physical print scale.</p>
      </> : <div role="status" className="mt-4 text-sm text-amber-200">{generation.issues.join(" ")}</div>}
      {exportError && <p role="alert" className="mt-3 text-sm text-red-200">{exportError}</p>}
    </section>
  );
}
