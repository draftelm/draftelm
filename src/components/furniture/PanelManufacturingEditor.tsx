"use client";
import { useMemo, useState } from "react";
import type { FurnitureResult } from "../../furniture";
import { createPanelManufacturingDocument, parseManufacturingCatalogue, mergeManufacturingCatalogue, collectCatalogueReferences, hasSyntheticCatalogue, parsePanelPropertyStorage, rebasePanelManufacturing, syntheticPanelExample, validatePanelManufacturingDocument } from "../../manufacturing";
import type { ManufacturingCatalogue, FaceKey, PanelViewRotation, PanelManufacturingDocument } from "../../manufacturing";
import type { ManufacturingDrawingInput } from "../../drawings/manufacturing";
import DrawingPanel from "../drawings/DrawingPanel";
import PanelPropertyForm from "./PanelPropertyForm";

const STORAGE_KEY = "draftelm.panel-manufacturing.v1";
const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
interface Session { properties: PanelManufacturingDocument; syntheticExample: boolean }

export default function PanelManufacturingEditor({ result, activeId, onSelect }: { result: FurnitureResult; activeId: string | null; onSelect: (ids: string[], activeId?: string) => void }) {
  const [catalogue, setCatalogue] = useState<ManufacturingCatalogue>({ schemaVersion: 1, id: "local-manufacturing", entries: [] });
  const [libraryMessage, setLibraryMessage] = useState("");
  const [panelViews, setPanelViews] = useState<Record<string, { face: FaceKey; rotation: PanelViewRotation }>>({});
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [session, setSession] = useState<Session | null>(null), [beforeExample, setBeforeExample] = useState<Session | null>(null);
  const [message, setMessage] = useState(""), [reviewed, setReviewed] = useState(false);
  const [drawingRequest, setDrawingRequest] = useState<{ panelId: string; serial: number } | undefined>();
  const defaults = useMemo(() => result.geometryValid ? createPanelManufacturingDocument(result) : null, [result]);
  const properties = session?.properties ?? defaults;
  const validation = useMemo(() => properties ? validatePanelManufacturingDocument(properties, result) : null, [properties, result]);
  const stale = !!validation && !validation.valid;
  const panelId = properties?.panels.some(p => p.componentId === activeId) ? activeId! : properties?.panels.find(p => p.componentId === "chest/drawer-1/front")?.componentId ?? properties?.panels[0]?.componentId;
  const record = properties?.panels.find(p => p.componentId === panelId);
  const input: ManufacturingDrawingInput | undefined = useMemo(() => properties && panelId ? { properties, requestedPanelIds: [panelId], syntheticExample: session?.syntheticExample ?? false, panelViews: { [panelId]: panelViews[panelId] ?? { face: "a", rotation: 0 } } } : undefined, [properties, panelId, session?.syntheticExample, panelViews]);
  function changed(next: PanelManufacturingDocument, count: number) {
    if (!session?.syntheticExample && hasSyntheticCatalogue(next)) setBeforeExample(session);
    setSession({ properties: next, syntheticExample: (session?.syntheticExample ?? false) || hasSyntheticCatalogue(next) });
    setMessage(`Applied provisional properties to ${count} explicitly selected panel${count === 1 ? "" : "s"}. Drawing and manufacturing schedule updated.`);
    setDrawingRequest(r => ({ panelId: panelId!, serial: (r?.serial ?? 0) + 1 }));
  }
  function example() {
    if (!properties || !panelId || stale) return;
    try { setBeforeExample(session); setSession({ properties: syntheticPanelExample(properties, result, panelId), syntheticExample: true }); setMessage(`Synthetic example applied only to ${panelId}. No manufacturing or purchasing approval.`); setDrawingRequest(r => ({ panelId, serial: (r?.serial ?? 0) + 1 })); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Example unavailable."); }
  }
  function save() {
    try { if (!properties || stale) throw new Error("Review stale properties before saving."); window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, properties, syntheticExample: session?.syntheticExample ?? false })); setMessage("Manufacturing properties saved locally with their engineering revision."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Browser storage is unavailable."); }
  }
  function load() {
    try { const value = window.localStorage.getItem(STORAGE_KEY); if (!value) throw new Error("No manufacturing properties have been saved locally."); setSession(parsePanelPropertyStorage(value, result)); setReviewed(false); setMessage("Saved manufacturing properties loaded. Stale data requires explicit review before drawing/export."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Saved properties could not be loaded."); }
  }
  function rebase() {
    try { if (!properties || !reviewed) return; const next = rebasePanelManufacturing(properties, result); setSession({ properties: next.document, syntheticExample: session?.syntheticExample ?? false }); setReviewed(false); setMessage(`Carried ${next.retained.length} surviving occurrences as provisional. Reset ${next.reset.length} incompatible orientations; removed ${next.removed.length} deleted IDs.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Properties need further review."); }
  }
  return <>
    <section aria-label="Panel manufacturing properties" className="mt-6 rounded-2xl border border-blue-300/20 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-medium">Panel manufacturing properties</h2><p className="mt-2 text-sm text-slate-300">Edit a physical occurrence, then inspect its labelled panel drawing and ten-field manufacturing schedule below.</p></div><span className="rounded-full border border-amber-300/30 px-3 py-1 text-xs text-amber-200">Provisional inputs · not approved</span></div>
      {session?.syntheticExample && <p role="status" className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">SYNTHETIC EXAMPLE ACTIVE — sample properties only. Drawings/PDF are labelled. Manufacturing readiness and approved purchasing remain false.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!properties || stale || session?.syntheticExample} onClick={example}>Try synthetic example on this panel</button>{session?.syntheticExample && <button type="button" className={buttonClass} onClick={() => { setSession(beforeExample); setBeforeExample(null); setMessage("Synthetic example exited; previous properties restored."); }}>Exit synthetic example and restore</button>}<button type="button" className={buttonClass} disabled={!properties || stale} onClick={save}>Save panel properties locally</button><button type="button" className={buttonClass} disabled={!result.geometryValid} onClick={load}>Load panel properties</button><button type="button" className={buttonClass} onClick={() => { setSession(null); setBeforeExample(null); setReviewed(false); setMessage("Panel manufacturing properties reset to unspecified defaults."); }}>Reset panel properties</button></div>
      <details className="mt-4 rounded-lg border border-white/10 p-3 text-sm"><summary>Manufacturing libraries · {catalogue.entries.length} versions</summary><p className="mt-2 text-xs text-slate-400">Project/company entries are local proposals. Applied panels pin a version and snapshot; newer versions never replace existing specifications automatically. Create entries beside material, finish or selected-edge controls.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => { try { window.localStorage.setItem("draftelm.manufacturing-catalogue.v1", JSON.stringify(catalogue)); setLibraryMessage("Versioned manufacturing libraries saved locally."); } catch { setLibraryMessage("Local catalogue storage is unavailable."); } }}>Save libraries locally</button><button type="button" className={buttonClass} onClick={() => { try { const raw = window.localStorage.getItem("draftelm.manufacturing-catalogue.v1"); if (!raw) throw new Error("No manufacturing library has been saved."); setCatalogue(mergeManufacturingCatalogue(catalogue, parseManufacturingCatalogue(raw), properties ? collectCatalogueReferences(properties) : [])); setLibraryMessage("Library versions merged with known pinned versions. Applied panel references remain unchanged."); } catch (e) { setLibraryMessage(e instanceof Error ? e.message : "Library could not be loaded."); } }}>Load libraries</button></div>{libraryMessage && <p role="status" className="mt-2 text-xs text-blue-200">{libraryMessage}</p>}</details>
      {message && <p role="status" className="mt-3 text-sm text-blue-200">{message}</p>}
      {!result.geometryValid ? <p className="mt-4 text-amber-200">Correct the furniture parameters to edit panel properties.</p> : <>
        <div role="group" aria-label="Manufacturing editor mode" className="mt-5 flex items-center gap-2">{(["basic", "advanced"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={`${buttonClass} ${mode === value ? "bg-blue-300/15 text-blue-200" : ""}`} onClick={() => setMode(value)}>{value === "basic" ? "Basic" : "Advanced"}</button>)}<span className="text-xs text-slate-400">Switching modes preserves draft values.</span></div>
        <label className="mt-5 block text-sm">Physical panel occurrence<select aria-label="Manufacturing panel occurrence" className={inputClass} value={panelId ?? ""} onChange={e => { onSelect([e.target.value], e.target.value); setReviewed(false); }}>{defaults?.panels.map(p => <option key={p.componentId} value={p.componentId}>{result.components.find(c => c.id === p.componentId)?.name} · {p.componentId}</option>)}</select></label>
        {stale ? <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100"><strong>Manufacturing properties need review: the engineering model or binding changed.</strong><p className="mt-2">Edits are retained. Their drawings and export are withheld until reviewed or reset. Check surviving panel IDs and their local orientation before carrying values forward.</p><details className="mt-3"><summary>Panel IDs to review</summary><p className="mt-2 break-all text-xs">{properties?.panels.map(p => p.componentId).join(", ")}</p></details><label className="mt-3 flex gap-2"><input aria-label="Reviewed surviving panel identities and orientation" type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the surviving panel IDs and physical orientation for this engineering revision.</label><button type="button" className={`${buttonClass} mt-3`} disabled={!reviewed} onClick={rebase}>Carry reviewed edits as provisional</button></div> : record && properties && <>
          <p className="mt-3 text-xs text-amber-200">This panel: {validation?.diagnostics.filter(d => d.componentId === panelId && d.code === "unresolved-property").length} missing properties; {validation?.diagnostics.filter(d => d.componentId === panelId && d.code === "provisional-property").length} provisional properties. Missing values are not assumed to be none.</p>
          <PanelPropertyForm displayView={panelViews[panelId!] ?? { face: "a", rotation: 0 }} catalogue={catalogue} onCatalogueChange={setCatalogue} onDrawingViewChange={v => setPanelViews(old => ({ ...old, [panelId!]: v }))} mode={mode} key={panelId} record={record} source={result} document={properties} syntheticExample={session?.syntheticExample ?? false} onSave={changed} />
          <button type="button" className={`${buttonClass} mt-4`} onClick={() => setDrawingRequest(r => ({ panelId: panelId!, serial: (r?.serial ?? 0) + 1 }))}>View this panel&apos;s manufacturing drawing</button>
        </>}
      </>}
    </section>
    <DrawingPanel result={result} manufacturingInput={input} requestedManufacturingDrawing={drawingRequest} onSelectManufacturingPanel={id => onSelect([id], id)} />
  </>;
}
