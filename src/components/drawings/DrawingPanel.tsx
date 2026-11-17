"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FurnitureResult } from "../../furniture";
import { generateDrawingDocument, getDrawingProfile, loadDrawingPreferences, saveDrawingPreferences } from "../../drawings";
import type { DrawingProfile } from "../../drawings";
import SheetPreview from "./SheetPreview";
import DrawingSettings from "./DrawingSettings";

export default function DrawingPanel({ result }: { result: FurnitureResult }) {
  const [profile, setProfile] = useState<DrawingProfile>(() => getDrawingProfile());
  const [baseProfileId, setBaseProfileId] = useState("furniture-workshop");
  const [preferencesMessage, setPreferencesMessage] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("GA-001");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const generation = useMemo(() => generateDrawingDocument(result, profile), [result, profile]);
  const document = generation.document;
  const latestDocument = useRef(document);
  useEffect(() => { latestDocument.current = document; }, [document]);
  const sheet = document?.sheets.find(s => s.id === selectedSheet) ?? document?.sheets[0];
  const annotationModel = sheet?.annotationModel ?? document?.drawingAnnotations;
  function selectProfile(id: string) {
    setBaseProfileId(id); setProfile(getDrawingProfile(id)); setPreferencesMessage("Profile defaults applied. Preview updated.");
  }
  function savePreferences() {
    try {
      const saved = saveDrawingPreferences(window.localStorage, profile, baseProfileId);
      setPreferencesMessage(saved.message);
    } catch { setPreferencesMessage("Browser storage is unavailable. Current settings remain available."); }
  }
  function loadPreferences() {
    try {
      const saved = loadDrawingPreferences(window.localStorage);
      if (saved.profile && saved.baseProfileId) { setProfile(saved.profile); setBaseProfileId(saved.baseProfileId); }
      setPreferencesMessage(saved.message);
    } catch { setPreferencesMessage("Browser storage is unavailable. Current settings are unchanged."); }
  }
  async function exportPDF() {
    if (!document) return;
    const captured = document;
    setExporting(true); setExportError("");
    try {
      const { exportDrawingPDF } = await import("../../drawings/pdf");
      const bytes = await exportDrawingPDF(captured);
      if (latestDocument.current !== captured) throw new Error("Drawing inputs changed during export. Export the regenerated package.");
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = `DRAFTELM-${captured.profile.numbering.prefix}-${captured.profile.numbering.revision}.pdf`;
      window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error && error.message.startsWith("Drawing inputs changed") ? error.message : "PDF export failed. The drawing preview is still available; please try again."); }
    finally { setExporting(false); }
  }
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5" aria-label="Engineering drawings">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">2D drawings · Phase 5B.2</h2><button type="button" disabled={!document || exporting} className="rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40" onClick={exportPDF}>{exporting ? "Exporting…" : "Export vector PDF"}</button></div>
      <p className="mt-2 text-sm text-amber-200">Preliminary nominal drawings — not for manufacture. BS 8888:2025 requirements have not been individually verified against licensed standards.</p>
      <DrawingSettings profile={profile} baseProfileId={baseProfileId} message={preferencesMessage}
        onChange={p => { setProfile(p); setPreferencesMessage(""); }} onSelect={selectProfile}
        onReset={() => selectProfile(baseProfileId)} onSave={savePreferences} onLoad={loadPreferences} />
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{profile.sheet.format} landscape · model dimensions in mm · plotted scales are shown per view. Drawings use revision-bound engine geometry; sheet explosion offsets are presentation only and independent of viewer controls. Overall depth includes projecting fronts; carcass depth is dimensioned separately.</p>
      {document && sheet ? <>
        <p role="status" className="mt-3 text-sm text-emerald-200">Internal BOM reconciled · {document.reconciliation.panelQuantity} panels · {document.cuttingList.length} distinct blanks · all {document.reconciliation.componentCount} component IDs retained. Nominal cutting sizes carry no manufacturing allowances.</p>
        <p className="mt-2 text-xs text-slate-300">GA primary: {document.gaPlan.policy.selectedPrimary ?? "hidden"} · {document.gaPlan.coverage.displayedDimensionIds.length}/4 nominal GA dimensions displayed. Dimensions use the current closed panel geometry; tolerances and manufacturing datums remain unspecified.</p>
        {document.gaPlan.diagnostics.length > 0 && <details className="mt-2 text-xs text-amber-200"><summary className="cursor-pointer">GA plan coverage and view selection</summary><ul className="mt-1 space-y-1">{document.gaPlan.diagnostics.map((d, i) => <li key={i}>{d.message}</li>)}</ul></details>}
        {document.output.omittedSections.length > 0 && <p className="mt-2 text-xs text-amber-200">Configured output omits: {document.output.omittedSections.join(", ")}. Hidden information remains internally traceable and unverified.</p>}
        <p className="mt-2 text-xs text-amber-200">Hardware quantities are unverified demonstration allowances, excluded from approved purchasing totals. No approved hardware purchasing items.</p>
        {annotationModel!.diagnostics.length > 0 && <details className="mt-3 text-xs text-amber-200"><summary className="cursor-pointer">Assembly annotation placement: {document.drawingAnnotations.diagnostics.filter(d => d.itemKey).length} balloon requests unplaced</summary><ul className="mt-2 space-y-1">{document.drawingAnnotations.diagnostics.map((diagnostic, i) => {
          const item = annotationModel!.items.find(item => item.key === diagnostic.itemKey);
          return <li key={i}>{item ? `Item ${item.label} (${item.description}): ` : ""}{diagnostic.message}{diagnostic.componentIds.length > 0 && <span className="block break-words text-slate-400">{diagnostic.componentIds.join(", ")}</span>}</li>;
        })}</ul></details>}
        {!!sheet.assemblyDiagnostics?.length && <details className="mt-2 text-xs text-amber-200"><summary>Assembly visibility diagnostics: {sheet.assemblyDiagnostics.length}</summary><ul>{sheet.assemblyDiagnostics.map((d, i) => <li key={i}>{d.message}</li>)}</ul></details>}
        {sheet.assemblyScope && <p className="mt-2 break-words text-xs text-slate-400">Assembly occurrences: {sheet.assemblyScope.assemblyIds.join(", ")}. Scoped quantities exclude hardware allowances. Reused sheets compare existing panel layouts; manufacturing interchangeability remains unassessed.</p>}
        <label className="mt-4 block text-sm">Drawing sheet<select aria-label="Drawing sheet" className="ml-3 max-w-full rounded-lg border border-white/20 bg-slate-900 p-2" value={sheet.id} onChange={e => setSelectedSheet(e.target.value)}>{document.sheets.map(s => <option key={s.id} value={s.id}>{s.metadata.number}/{s.metadata.total} · {s.id} · {s.metadata.subject}</option>)}</select></label>
        <div className="mt-4 overflow-auto rounded-lg bg-slate-200 p-2 sm:p-4"><div className="min-w-[720px]"><SheetPreview document={document} sheet={sheet} /></div></div>
        <p className="mt-2 text-xs text-slate-400">Scroll the sheet horizontally on small screens. Drawings use parallel projections of source panels and explicit presentation translations. {document.gaPlan.visibility.isometricMode === "diagnostic-wireframe" ? "Diagnostic isometric wireframe includes hidden edges." : "Isometric hidden edges are removed against solid panels."} PDF: print at Actual size / 100%; browser scaling changes physical print scale.</p>
      </> : <div role="status" className="mt-4 text-sm text-amber-200">{generation.issues.join(" ")}</div>}
      {exportError && <p role="alert" className="mt-3 text-sm text-red-200">{exportError}</p>}
    </section>
  );
}
