"use client";
import { useMemo, useState } from "react";
import type { FurnitureResult } from "../../furniture";
import { applyPanelPropertyDraft, createPanelManufacturingDocument, createPanelTopology, EDGE_KEYS, FACE_KEYS, manufacturingFingerprint, panelPropertyDraft, parsePanelPropertyStorage, rebasePanelManufacturing, syntheticPanelExample, validatePanelManufacturingDocument } from "../../manufacturing";
import type { PanelManufacturingDocument, PanelManufacturingProperties, PanelPropertyDraft } from "../../manufacturing";
import type { ManufacturingDrawingInput } from "../../drawings/manufacturing";
import DrawingPanel from "../drawings/DrawingPanel";

const STORAGE_KEY = "draftelm.panel-manufacturing.v1";
const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
interface Session { properties: PanelManufacturingDocument; syntheticExample: boolean }

function PropertyForm({ record, source, document, syntheticExample, onSave }: { record: PanelManufacturingProperties; source: FurnitureResult; document: PanelManufacturingDocument; syntheticExample: boolean; onSave: (document: PanelManufacturingDocument, count: number) => void }) {
  const [draft, setDraft] = useState(() => panelPropertyDraft(record));
  const [scope, setScope] = useState<string[]>([record.componentId]);
  const [confirmed, setConfirmed] = useState(false), [error, setError] = useState("");
  const panel = source.components.find(p => p.kind === "panel" && p.id === record.componentId)!;
  if (panel.kind !== "panel") return null;
  const topology = createPanelTopology(panel, record.orientation);
  const face = (key: "a" | "b", patch: Partial<PanelPropertyDraft["faces"]["a"]>) => setDraft(d => ({ ...d, faces: { ...d.faces, [key]: { ...d.faces[key], ...patch } } }));
  const edge = (key: typeof EDGE_KEYS[number], patch: Partial<PanelPropertyDraft["edges"]["u-min"]>) => setDraft(d => ({ ...d, edges: { ...d.edges, [key]: { ...d.edges[key], ...patch } } }));
  function save() {
    setError("");
    try { if (scope.length > 1 && !confirmed) throw new Error("Confirm the exact panel scope before applying shared values."); onSave(applyPanelPropertyDraft(document, source, scope, draft, syntheticExample), scope.length); }
    catch (e) { setError(e instanceof Error ? e.message : "Properties could not be saved."); }
  }
  const dirty = manufacturingFingerprint(draft) !== manufacturingFingerprint(panelPropertyDraft(record));
  return <div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={buttonClass} disabled={!scope.length || scope.length > 1 && !confirmed} onClick={save}>Apply panel properties</button><p role="status" className="text-sm text-blue-200">{dirty ? "Draft changes — Apply to update the drawing and schedule." : "Showing saved property values."}</p></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    <div className="mt-4 grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-white/10 p-4">
        <svg viewBox="0 0 240 190" role="img" aria-label="Physical panel local face and edge map" className="w-full bg-slate-950/40 text-slate-100">
          <rect x="40" y="35" width="160" height="110" fill="none" stroke="currentColor" />
          <text x="120" y="24" textAnchor="middle" fill="currentColor" fontSize="11">v-max</text><text x="120" y="162" textAnchor="middle" fill="currentColor" fontSize="11">v-min</text>
          <text x="13" y="94" fill="currentColor" fontSize="10" transform="rotate(-90 13 94)">u-min</text><text x="228" y="94" fill="currentColor" fontSize="10" transform="rotate(-90 228 94)">u-max</text>
          <text x="120" y="76" textAnchor="middle" fill="currentColor" fontSize="11">A: T=0</text><text x="120" y="94" textAnchor="middle" fill="currentColor" fontSize="11">B: T={topology.frame.size.t} (opposite)</text>
          <path d="M 56 130 H 95 M 90 126 L 95 130 L 90 134 M 56 130 V 103 M 52 108 L 56 103 L 60 108" fill="none" stroke="currentColor" /><text x="101" y="134" fill="currentColor" fontSize="10">+U</text><text x="49" y="99" fill="currentColor" fontSize="10">+V</text>
        </svg>
        <p className="mt-2 text-xs text-slate-400">Schematic local map; proportions are illustrative. Face roles are explicitly assigned below.</p>
        <p className="mt-3 break-all font-mono text-xs">{record.componentId}</p>
        <p className="mt-2 text-sm">U {record.orientation.u.sign > 0 ? "+" : "−"}{record.orientation.u.axis.toUpperCase()} · V {record.orientation.v.sign > 0 ? "+" : "−"}{record.orientation.v.axis.toUpperCase()} · T {record.orientation.normal.sign > 0 ? "+" : "−"}{record.orientation.normal.axis.toUpperCase()}</p>
        <p className="mt-2 text-xs text-slate-400">Local U × V × T: {topology.frame.size.u} × {topology.frame.size.v} × {topology.frame.size.t} mm</p>
        <details className="mt-3 text-xs"><summary>Stable physical references</summary>{[...topology.faces, ...topology.edges].map(r => <p className="mt-2 break-all" key={r.id}>{r.id} · outward normal {r.outwardNormal.x}, {r.outwardNormal.y}, {r.outwardNormal.z}</p>)}</details>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Manufacturer material codes<textarea aria-label="Manufacturer material codes" rows={2} maxLength={1000} className={inputClass} value={draft.materialCodes} placeholder="manufacturer=code" onChange={e => setDraft(d => ({ ...d, materialCodes: e.target.value }))} /><span className="text-xs text-slate-400">One manufacturer=code per line. Stock identity and grade are preserved.</span></label>
          <label className="text-sm">Grain orientation<select aria-label="Panel grain orientation" className={inputClass} value={draft.grain} onChange={e => setDraft(d => ({ ...d, grain: e.target.value as PanelPropertyDraft["grain"] }))}><option value="">Not specified</option><option value="longitudinal">Longitudinal — along local U</option><option value="transverse">Transverse — along local V</option><option value="non-directional">Non-directional</option></select>{draft.grain && draft.grain !== "non-directional" && <select aria-label="Panel grain sense" className={inputClass} value={draft.grainSense} onChange={e => setDraft(d => ({ ...d, grainSense: e.target.value as PanelPropertyDraft["grainSense"] }))}><option value="either">Either sense along this local axis</option><option value="positive">Positive local direction only</option><option value="negative">Negative local direction only</option></select>}<span className="text-xs text-slate-400">No continuous matching is inferred.</span></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{FACE_KEYS.map(key => <fieldset key={key} className="rounded-xl border border-white/10 p-4"><legend className="px-1 font-medium">Face {key.toUpperCase()} · {key === "a" ? "T=0" : "opposite"}</legend>
          <label className="text-sm">Face {key.toUpperCase()} role<select aria-label={`Face ${key.toUpperCase()} role`} className={inputClass} value={draft.faces[key].role} onChange={e => face(key, { role: e.target.value as PanelPropertyDraft["faces"]["a"]["role"] })}><option value="">Not specified</option><option value="decorative">Decorative; visibility required</option><option value="decorative-hidden">Decorative; visibility not required</option><option value="reverse">Reverse; visibility not required</option><option value="reverse-visible">Reverse; visibility required</option><option value="visible">Visible; no decorative/reverse role</option><option value="ordinary">No decorative/reverse/visibility requirement</option></select></label>
          <label className="mt-3 block text-sm">Good-face requirements<textarea aria-label={`Face ${key.toUpperCase()} good-face requirements`} className={inputClass} rows={2} maxLength={500} value={draft.faces[key].goodFace} placeholder="Your manufacturer-defined requirement" onChange={e => face(key, { goodFace: e.target.value })} /></label>
          <label className="mt-3 block text-sm">Surface finish<select aria-label={`Face ${key.toUpperCase()} surface finish`} className={inputClass} value={draft.faces[key].finish} onChange={e => face(key, { finish: e.target.value as PanelPropertyDraft["faces"]["a"]["finish"] })}><option value="">Not specified</option><option value="none">No applied finish — explicit proposal</option><option value="specified">Specify finish</option></select></label>
          {draft.faces[key].finish === "specified" && <label className="mt-3 block text-sm">Finish specification / code<input aria-label={`Face ${key.toUpperCase()} finish code`} className={inputClass} maxLength={80} value={draft.faces[key].finishId} onChange={e => face(key, { finishId: e.target.value })} /></label>}
        </fieldset>)}</div>
      </div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{EDGE_KEYS.map(key => <fieldset key={key} className="rounded-xl border border-white/10 p-4"><legend className="px-1 font-medium">{key}</legend>
      <select aria-label={`${key} treatment`} className={inputClass} value={draft.edges[key].kind} onChange={e => edge(key, { kind: e.target.value as PanelPropertyDraft["edges"]["u-min"]["kind"] })}><option value="">Not specified</option><option value="none">No treatment — explicit proposal</option><option value="edge-band">Edge-band</option><option value="lipping">Lipping</option><option value="other">Other treatment</option></select>
      {draft.edges[key].kind && draft.edges[key].kind !== "none" && <div className="mt-3 space-y-3">{([['specificationId', 'Specification / code'], ['thickness', 'Nominal thickness (mm)'], ['material', 'Treatment material ID'], ['appearance', 'Finished appearance'], ['process', 'Process reference']] as const).map(([field, label]) => <label key={field} className="block text-sm">{label}<input aria-label={`${key} ${label}`} className={inputClass} maxLength={100} value={draft.edges[key][field]} placeholder={field === "specificationId" ? "Required" : "Not specified"} onChange={e => edge(key, { [field]: e.target.value })} /></label>)}</div>}
    </fieldset>)}</div>
    <details className="mt-5 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer text-sm">Apply these editable fields to explicitly selected occurrences ({scope.length})</summary>
      <p className="mt-3 text-sm text-amber-200">This replaces the shown fields, including Not specified values, on the checked IDs. Stock grade, physical orientation, matching and other requirements stay with each occurrence.</p>
      <div className="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">{document.panels.map(p => <label key={p.componentId} className="flex items-start gap-2 break-all text-xs"><input aria-label={`Apply properties to ${p.componentId}`} type="checkbox" checked={scope.includes(p.componentId)} onChange={e => { setScope(s => e.target.checked ? [...s, p.componentId] : s.filter(id => id !== p.componentId)); setConfirmed(false); }} />{p.componentId}</label>)}</div>
      <p className="mt-3 break-all text-xs">Scope: {scope.join(", ") || "No panels selected"}</p>
      {scope.length > 1 && <label className="mt-3 flex items-start gap-2 text-sm"><input aria-label="Confirm exact manufacturing property scope" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm applying these editable values to these {scope.length} physical panel IDs.</label>}
    </details>
    <div className="mt-4 flex items-center gap-4"><button type="button" className={buttonClass} disabled={!scope.length || scope.length > 1 && !confirmed} onClick={save}>Apply to selected panel IDs</button><span className="text-xs text-amber-200">Saved as provisional / unverified. No geometry or purchasing change.</span></div>
  </div>;
}

export default function PanelManufacturingEditor({ result, activeId, onSelect }: { result: FurnitureResult; activeId: string | null; onSelect: (ids: string[], activeId?: string) => void }) {
  const [session, setSession] = useState<Session | null>(null), [beforeExample, setBeforeExample] = useState<Session | null>(null);
  const [message, setMessage] = useState(""), [reviewed, setReviewed] = useState(false);
  const [drawingRequest, setDrawingRequest] = useState<{ panelId: string; serial: number } | undefined>();
  const defaults = useMemo(() => result.geometryValid ? createPanelManufacturingDocument(result) : null, [result]);
  const properties = session?.properties ?? defaults;
  const validation = useMemo(() => properties ? validatePanelManufacturingDocument(properties, result) : null, [properties, result]);
  const stale = !!validation && !validation.valid;
  const panelId = properties?.panels.some(p => p.componentId === activeId) ? activeId! : properties?.panels.find(p => p.componentId === "chest/drawer-1/front")?.componentId ?? properties?.panels[0]?.componentId;
  const record = properties?.panels.find(p => p.componentId === panelId);
  const input: ManufacturingDrawingInput | undefined = useMemo(() => properties && panelId ? { properties, requestedPanelIds: [panelId], syntheticExample: session?.syntheticExample ?? false } : undefined, [properties, panelId, session?.syntheticExample]);
  function changed(next: PanelManufacturingDocument, count: number) {
    setSession({ properties: next, syntheticExample: session?.syntheticExample ?? false });
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
      {message && <p role="status" className="mt-3 text-sm text-blue-200">{message}</p>}
      {!result.geometryValid ? <p className="mt-4 text-amber-200">Correct the furniture parameters to edit panel properties.</p> : <>
        <label className="mt-5 block text-sm">Physical panel occurrence<select aria-label="Manufacturing panel occurrence" className={inputClass} value={panelId ?? ""} onChange={e => { onSelect([e.target.value], e.target.value); setReviewed(false); }}>{defaults?.panels.map(p => <option key={p.componentId} value={p.componentId}>{p.componentId}</option>)}</select></label>
        {stale ? <div role="alert" className="mt-4 rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100"><strong>Manufacturing properties need review: the engineering model or binding changed.</strong><p className="mt-2">Edits are retained. Their drawings and export are withheld until reviewed or reset. Check surviving panel IDs and their local orientation before carrying values forward.</p><details className="mt-3"><summary>Panel IDs to review</summary><p className="mt-2 break-all text-xs">{properties?.panels.map(p => p.componentId).join(", ")}</p></details><label className="mt-3 flex gap-2"><input aria-label="Reviewed surviving panel identities and orientation" type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the surviving panel IDs and physical orientation for this engineering revision.</label><button type="button" className={`${buttonClass} mt-3`} disabled={!reviewed} onClick={rebase}>Carry reviewed edits as provisional</button></div> : record && properties && <>
          <p className="mt-3 text-xs text-amber-200">This panel: {validation?.diagnostics.filter(d => d.componentId === panelId && d.code === "unresolved-property").length} missing properties; {validation?.diagnostics.filter(d => d.componentId === panelId && d.code === "provisional-property").length} provisional properties. Missing values are not assumed to be none.</p>
          <PropertyForm key={`${panelId}:${manufacturingFingerprint(record)}`} record={record} source={result} document={properties} syntheticExample={session?.syntheticExample ?? false} onSave={changed} />
          <button type="button" className={`${buttonClass} mt-4`} onClick={() => setDrawingRequest(r => ({ panelId: panelId!, serial: (r?.serial ?? 0) + 1 }))}>View this panel&apos;s manufacturing drawing</button>
        </>}
      </>}
    </section>
    <DrawingPanel result={result} manufacturingInput={input} requestedManufacturingDrawing={drawingRequest} onSelectManufacturingPanel={id => onSelect([id], id)} />
  </>;
}
