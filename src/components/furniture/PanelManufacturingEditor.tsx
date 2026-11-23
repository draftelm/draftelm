"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FurnitureResult } from "../../furniture";
import { manufacturingComponentGroups, createPanelManufacturingDocument, parseManufacturingCatalogue, mergeManufacturingCatalogue, collectCatalogueReferences, hasSyntheticCatalogue, manufacturingFingerprint, parsePanelPropertyStorage, rebasePanelManufacturing, syntheticPanelExample, validatePanelManufacturingDocument } from "../../manufacturing";
import type { ManufacturingCatalogue, FaceKey, PanelViewRotation, PanelManufacturingDocument } from "../../manufacturing";
import type { ManufacturingDrawingInput } from "../../drawings/manufacturing";
import DrawingPanel from "../drawings/DrawingPanel";
import PanelPropertyForm from "./PanelPropertyForm";
import WorkspaceTabs from "./WorkspaceTabs";
import ConfirmProjectAction from "./ConfirmProjectAction";
import type { ProjectAction } from "./ConfirmProjectAction";

const STORAGE_KEY = "draftelm.panel-manufacturing.v1";
const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
interface Session { properties: PanelManufacturingDocument; syntheticExample: boolean }
interface EditingContext { source: FurnitureResult; properties: PanelManufacturingDocument }

export default function PanelManufacturingEditor({ result, activeId, onSelect, onPendingCount }: { result: FurnitureResult; activeId: string | null; onSelect: (ids: string[], activeId?: string) => void; onPendingCount: (count: number) => void }) {
  const [area, setArea] = useState<"panels" | "schedule" | "drawings">("panels");
  const [catalogue, setCatalogue] = useState<ManufacturingCatalogue>({ schemaVersion: 1, id: "local-manufacturing", entries: [] });
  const [libraryMessage, setLibraryMessage] = useState("");
  const [panelViews, setPanelViews] = useState<Record<string, { face: FaceKey; rotation: PanelViewRotation }>>({});
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [session, setSession] = useState<Session | null>(null), [beforeExample, setBeforeExample] = useState<Session | null>(null);
  const [message, setMessage] = useState(""), [reviewed, setReviewed] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [action, setAction] = useState<ProjectAction | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [visited, setVisited] = useState<string[]>([]), [formEpoch, setFormEpoch] = useState(0);
  const [drawingRequest, setDrawingRequest] = useState<{ panelId: string; serial: number } | undefined>();
  const defaults = useMemo(() => result.geometryValid ? createPanelManufacturingDocument(result) : null, [result]);
  const properties = session?.properties ?? defaults;
  const validation = useMemo(() => properties ? validatePanelManufacturingDocument(properties, result) : null, [properties, result]);
  const stale = !!validation && !validation.valid;
  const groups = useMemo(() => result.geometryValid ? manufacturingComponentGroups(result) : [], [result]);
  const activeGroup = groups.find(g => g.componentIds.includes(activeId ?? "")) ?? groups[0];
  const panelId = properties?.panels.some(p => p.componentId === activeId) ? activeId : null;
  // Visited forms retain all pending fields, undo, edge selection and library proposals.
  // A stale source keeps the last valid context inaccessible until explicit review/reset.
  const [editing, setEditing] = useState<EditingContext | null>(() => defaults ? { source: result, properties: defaults } : null);
  if (properties && validation?.valid && (editing?.properties !== properties || editing?.source !== result)) setEditing({ source: result, properties });
  if (panelId && !visited.includes(panelId)) setVisited([...visited, panelId]);
  const editingGroups = useMemo(() => editing ? manufacturingComponentGroups(editing.source) : [], [editing]);
  const pendingIds = Object.keys(pending).filter(id => pending[id]);
  const pendingCount = pendingIds.length;
  const unsavedApplied = !!session && manufacturingFingerprint(session.properties) !== savedSnapshot && manufacturingFingerprint(session.properties) !== (defaults ? manufacturingFingerprint(defaults) : "");
  useEffect(() => { onPendingCount(pendingCount); }, [pendingCount, onPendingCount]);
  useEffect(() => {
    if (!pendingCount && !unsavedApplied) return;
    let leavingConfirmed = false;
    const warn = (event: BeforeUnloadEvent) => { if (!leavingConfirmed) { event.preventDefault(); event.returnValue = ""; } };
    // Next links can leave the workspace without a document unload. Guard them
    // before the router handles the click; PDF blob downloads are deliberately excluded.
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (!["http:", "https:"].includes(url.protocol) || url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      setAction({ title: "Leave this furniture project?", confirmLabel: "Leave project", description: "Pending drafts and applied properties that have not been saved locally will be lost. Workspace switching keeps them; leaving this page does not. Cabinet dimensions are not included in panel-property saves.", run: () => { leavingConfirmed = true; window.location.assign(url.href); } });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", guardLink, true); };
  }, [pendingCount, unsavedApplied]);
  const reportDraft = useCallback((id: string, dirty: boolean) => {
    setPending(old => !!old[id] === dirty ? old : { ...old, [id]: dirty });
    // Capture the source even before Apply, so a geometry edit cannot rebind a pending draft.
    if (dirty && editing) setSession(old => old ?? { properties: editing.properties, syntheticExample: false });
  }, [editing]);
  const input: ManufacturingDrawingInput | undefined = useMemo(() => properties ? { properties, requestedPanelIds: panelId ? [panelId] : [], syntheticExample: session?.syntheticExample ?? false, panelViews: panelId ? { [panelId]: panelViews[panelId] ?? { face: "a", rotation: 0 } } : {} } : undefined, [properties, panelId, session?.syntheticExample, panelViews]);
  function clearDrafts() { setPending({}); setVisited([]); setFormEpoch(n => n + 1); }
  function replacement(title: string, description: string, run: () => void) {
    setAction({ title, description: `${description}\n${pendingCount ? `This will discard pending drafts on ${pendingCount} panel(s): ${pendingIds.join(", ")}.` : "No pending panel property drafts will be discarded."}\nPanel-form undo history, bulk reviews and unfinished library-entry forms will also reset. Locally saved records are unchanged until you explicitly save again.`, run });
  }
  function changed(next: PanelManufacturingDocument, count: number, id: string) {
    if (!session?.syntheticExample && hasSyntheticCatalogue(next)) setBeforeExample(session);
    setSession({ properties: next, syntheticExample: (session?.syntheticExample ?? false) || hasSyntheticCatalogue(next) });
    setMessage(`Applied provisional properties to ${count} explicitly selected panel${count === 1 ? "" : "s"} in this project. Save locally to keep applied values for later.`);
    setDrawingRequest(r => ({ panelId: id, serial: (r?.serial ?? 0) + 1 }));
  }
  function example() {
    if (!properties || !panelId || stale) return;
    try { const next = syntheticPanelExample(properties, result, panelId); setBeforeExample(session); clearDrafts(); setSession({ properties: next, syntheticExample: true }); setMessage(`Synthetic example applied only to ${panelId}. No manufacturing or purchasing approval.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Example unavailable."); }
  }
  function save() {
    try { if (!properties || stale || pendingCount) throw new Error("Apply or restore pending drafts and review stale properties before saving locally."); window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, properties, syntheticExample: session?.syntheticExample ?? false })); setSavedSnapshot(manufacturingFingerprint(properties)); setMessage("Applied manufacturing properties saved in this browser with their engineering revision. Cabinet dimensions and pending forms are not part of this save."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Browser storage is unavailable."); }
  }
  function load() {
    try { const value = window.localStorage.getItem(STORAGE_KEY); if (!value) throw new Error("No manufacturing properties have been saved locally."); const next = parsePanelPropertyStorage(value, result); clearDrafts(); setSession(next); setReviewed(""); setSavedSnapshot(manufacturingFingerprint(next.properties)); setMessage("Saved applied properties loaded. Stale data requires explicit review before drawing/export."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Saved properties could not be loaded."); }
  }
  function rebase() {
    try { if (!properties || reviewed !== result.specificationRevision) return; const next = rebasePanelManufacturing(properties, result); clearDrafts(); setSession({ properties: next.document, syntheticExample: session?.syntheticExample ?? false }); setReviewed(""); setMessage(`Carried ${next.retained.length} surviving occurrences as provisional. Reset ${next.reset.length} incompatible bindings; removed ${next.removed.length} deleted IDs. No prior approval is transferred.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Properties need further review."); }
  }
  const missing = validation?.diagnostics.filter(d => d.code === "unresolved-property").length ?? 0;
  const unresolvedPanels = new Set(validation?.diagnostics.filter(d => d.code === "unresolved-property" || d.code === "provisional-property").map(d => d.componentId).filter(Boolean)).size;
  const provisional = validation?.diagnostics.filter(d => d.code === "provisional-property").length ?? 0;
  return <>
    <header className="mt-6"><h2 className="text-xl font-medium">Prepare your panels</h2><p className="mt-2 text-sm text-slate-400">Choose a panel, define its requirements, then inspect the schedule or drawings.</p></header>
    <div className="my-4"><WorkspaceTabs id="manufacturing-area" label="Manufacturing views" value={area} onChange={setArea} items={[{ id: "panels", label: "Panel setup" }, { id: "schedule", label: "Schedule" }, { id: "drawings", label: "Drawings & PDF" }]} /></div>
    <div className="mb-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm text-amber-100" aria-label="Manufacturing information status">
      <strong>{stale ? "Design changed — manufacturing review required" : `${unresolvedPanels} panels need manufacturing information`}</strong>
      <p className="mt-1 text-xs">Not approved for manufacture. Materials, hardware, fixings, loads and stability still require engineering review. Missing values never mean no treatment.</p>
      {pendingCount > 0 && <p role="status" className="mt-2 text-xs">{pendingCount} panel draft(s) retained in this session. Drawings and schedules show applied values only.</p>}
      <details className="mt-2 text-xs"><summary>Outstanding property details and retained drafts</summary><p className="mt-2">{missing} missing property entries; {provisional} provisional entries.</p><p className="mt-2 break-all">Pending panel IDs: {pendingIds.join(", ") || "None"}</p><ul className="mt-2 max-h-60 space-y-2 overflow-auto">{validation?.diagnostics.map((d, i) => <li key={i} className="break-words">{d.componentId ? `${d.componentId}: ` : ""}{d.message}</li>)}</ul></details>
    </div>
    {session?.syntheticExample && <p role="status" className="mb-4 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">SYNTHETIC EXAMPLE ACTIVE — sample properties only. Drawings/PDF are labelled. Manufacturing readiness and approved purchasing remain false.</p>}
    {message && <p role="status" className="my-3 text-sm text-blue-200">{message}</p>}
    <section role="tabpanel" id="manufacturing-area-panel-panels" aria-labelledby="manufacturing-area-tab-panels" hidden={area !== "panels"}>
    <section aria-label="Panel manufacturing properties" className="rounded-2xl border border-blue-300/20 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-medium">Panel setup</h3><div role="group" aria-label="Manufacturing editor mode" className="flex gap-2">{(["basic", "advanced"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={`${buttonClass} ${mode === value ? "bg-blue-300/15 text-blue-200" : ""}`} onClick={() => setMode(value)}>{value === "basic" ? "Basic" : "Advanced"}</button>)}</div></div>
      {mode === "basic" && <div role="group" aria-label="Manufacturing component groups" className="mt-4 grid gap-3 sm:grid-cols-3">{groups.map(g => <button type="button" key={g.id} disabled={stale} aria-pressed={activeGroup?.id === g.id} className={`rounded-xl border p-4 text-left ${activeGroup?.id === g.id ? "border-blue-300/60 bg-blue-300/10" : "border-white/15"}`} onClick={() => { const id = g.componentIds.includes(panelId ?? "") ? panelId! : g.componentIds[0]; onSelect([id], id); }}><strong className="block">{g.label}</strong><span className="mt-2 block text-sm text-blue-200">{g.quantity} panels</span><span className="mt-2 block text-xs text-slate-400">{g.description}</span></button>)}</div>}
      <label className="mt-4 block text-sm">{mode === "basic" ? "Review one panel from this group" : "Selected physical panel"}<select aria-label="Manufacturing panel occurrence" className={inputClass} value={panelId ?? ""} disabled={!result.geometryValid} onChange={e => { onSelect(e.target.value ? [e.target.value] : [], e.target.value || undefined); setReviewed(""); }}><option value="">Choose a panel</option>{defaults?.panels.filter(p => mode === "advanced" || activeGroup?.componentIds.includes(p.componentId)).map(p => <option key={p.componentId} value={p.componentId}>{result.assemblies.find(a => a.id === p.assemblyId)?.name} / {result.components.find(c => c.id === p.componentId)?.name}</option>)}</select></label>
      {panelId && <details className="mt-2 text-xs text-slate-400"><summary>Physical panel ID</summary><p className="mt-2 break-all">{panelId}</p></details>}
      <p className="mt-3 text-xs text-slate-400">Switch panels or workspaces freely: pending values stay with their physical panel in this session. Basic/Advanced share the same draft.</p>
      {!result.geometryValid && <p className="mt-4 text-amber-200">Correct the Design inputs to edit properties. Existing drafts are retained.</p>}
      {stale && <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100"><strong>Manufacturing properties need review: the engineering model or binding changed.</strong><p className="mt-2">Applied values and pending drafts are retained against the earlier source. Drawings/export are withheld. Review surviving physical IDs and orientation; carrying applied values forward discards pending drafts after confirmation.</p><details className="mt-3"><summary>Panel IDs to review</summary><p className="mt-2 break-all text-xs">{properties?.panels.map(p => p.componentId).join(", ")}</p></details><label className="mt-3 flex gap-2"><input aria-label="Reviewed surviving panel identities and orientation" type="checkbox" checked={reviewed === result.specificationRevision} onChange={e => setReviewed(e.target.checked ? result.specificationRevision : "")} />I reviewed the surviving panel IDs and physical orientation for this engineering revision.</label><button type="button" className={`${buttonClass} mt-3`} disabled={reviewed !== result.specificationRevision || !result.geometryValid} onClick={() => replacement("Carry reviewed applied values?", "Rebind compatible applied values as provisional to the current engineering source. Pending drafts cannot be automatically transferred to changed geometry.", rebase)}>Carry reviewed edits as provisional</button></div>}
      {!panelId && result.geometryValid && !stale && <p className="mt-4 text-slate-300">Choose a physical panel above or in Design to begin.</p>}
      {editing && <div hidden={stale || !result.geometryValid} inert={stale || !result.geometryValid}>{editing.properties.panels.filter(p => visited.includes(p.componentId)).map(record => <div key={`${formEpoch}:${record.componentId}`} hidden={panelId !== record.componentId} inert={panelId !== record.componentId} data-panel-form={record.componentId}>
        <PanelPropertyForm diagnostics={validation?.diagnostics ?? []} group={editingGroups.find(g => g.componentIds.includes(record.componentId))!} currentRevision={result.specificationRevision} sourceCurrent={!stale && result.geometryValid} displayView={panelViews[record.componentId] ?? { face: "a", rotation: 0 }} catalogue={catalogue} onCatalogueChange={setCatalogue} onDrawingViewChange={v => setPanelViews(old => ({ ...old, [record.componentId]: v }))} mode={mode} record={record} source={editing.source} document={editing.properties} syntheticExample={session?.syntheticExample ?? false} onDraftStatus={reportDraft} onSave={changed} onRequestApply={(ids, apply) => {
          const conflicts = ids.filter(id => id !== record.componentId && pending[id]);
          if (conflicts.length) setAction({ title: "Replace other panels' pending drafts?", description: `The reviewed bulk update also targets pending drafts on: ${conflicts.join(", ")}. Confirming replaces those drafts with the applied proposal. Other panel drafts and locally saved records are unchanged.`, run: apply });
          else apply();
        }} />
      </div>)}</div>}
      {panelId && !stale && <button type="button" className={`${buttonClass} mt-4`} onClick={() => { setDrawingRequest(r => ({ panelId, serial: (r?.serial ?? 0) + 1 })); setArea("drawings"); document.getElementById("manufacturing-area-tab-drawings")?.focus(); }}>View this panel&apos;s manufacturing drawing</button>}
      <details className="mt-5 rounded-xl border border-white/10 p-4 text-sm"><summary>Save locally, load & examples</summary>
        <p className="mt-3 text-xs text-slate-400">Apply updates this project. Save locally keeps applied panel properties in this browser, not cabinet dimensions, library edits or pending drafts. These are separate from drawing preferences and library saves.</p>
        <p role="status" className="mt-2 text-xs text-blue-200">{properties && savedSnapshot === manufacturingFingerprint(properties) ? "Current applied properties match the local save loaded or written this session." : "Current applied properties have not been saved locally in this session."}</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!properties || stale || pendingCount > 0} onClick={save}>Save applied properties locally</button><button type="button" className={buttonClass} disabled={!result.geometryValid} onClick={() => replacement("Load locally saved properties?", "Replace applied project properties with the saved document. Geometry bindings will be checked.", load)}>Load saved properties</button><button type="button" className={buttonClass} onClick={() => replacement("Reset all panel properties?", "Reset this project's panel properties to unspecified/provisional source defaults. No material, finish or edging is approved by this reset.", () => { clearDrafts(); setSession(null); setBeforeExample(null); setReviewed(""); setMessage("Active properties reset to unspecified defaults. Local saves are unchanged."); })}>Reset all panel properties</button></div>
        {pendingCount > 0 && <p className="mt-2 text-xs text-amber-200">Apply or restore pending drafts on every listed panel before saving locally.</p>}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!properties || !panelId || stale || session?.syntheticExample} onClick={() => replacement("Try a synthetic panel example?", "Apply illustrative grain, face, finish and edging to the selected panel. All examples remain labelled and unapproved.", example)}>Try synthetic example on this panel</button>{session?.syntheticExample && <button type="button" className={buttonClass} onClick={() => replacement("Exit synthetic example and restore?", "Restore the pre-example applied properties, or source defaults if no earlier session exists.", () => { clearDrafts(); setSession(beforeExample); setBeforeExample(null); setMessage("Synthetic example exited; previous applied properties restored."); })}>Exit synthetic example and restore</button>}</div>
      </details>
      <details className="mt-4 rounded-lg border border-white/10 p-3 text-sm"><summary>Manufacturing libraries · {catalogue.entries.length} versions</summary><p className="mt-2 text-xs text-slate-400">Local project/company proposals. Create entries beside material, face finish or selected-edge controls. New versions never replace pinned applied definitions. Save libraries separately for reuse.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => { try { window.localStorage.setItem("draftelm.manufacturing-catalogue.v1", JSON.stringify(catalogue)); setLibraryMessage("Versioned libraries saved locally. Panel drafts were not applied."); } catch { setLibraryMessage("Local catalogue storage is unavailable."); } }}>Save libraries locally</button><button type="button" className={buttonClass} onClick={() => { try { const raw = window.localStorage.getItem("draftelm.manufacturing-catalogue.v1"); if (!raw) throw new Error("No manufacturing library has been saved."); setCatalogue(mergeManufacturingCatalogue(catalogue, parseManufacturingCatalogue(raw), properties ? collectCatalogueReferences(properties) : [])); setLibraryMessage("Library versions merged. Pinned panel references and pending drafts are unchanged."); } catch (e) { setLibraryMessage(e instanceof Error ? e.message : "Library could not be loaded."); } }}>Load libraries</button></div>{libraryMessage && <p role="status" className="mt-2 text-xs text-blue-200">{libraryMessage}</p>}</details>
    </section>
    </section>
    <div hidden={area === "panels"}>
      <DrawingPanel result={result} manufacturingInput={input} requestedManufacturingDrawing={drawingRequest} mode={area === "schedule" ? "schedule" : "drawings"} pendingCount={pendingCount} onSelectManufacturingPanel={id => { onSelect([id], id); setArea("panels"); document.getElementById("manufacturing-area-tab-panels")?.focus(); }} />
    </div>
    {action && <ConfirmProjectAction action={action} onClose={() => setAction(null)} />}
  </>;
}
