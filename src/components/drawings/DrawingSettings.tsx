import { DRAWING_PROFILE_CHOICES, FORMAL_TEMPLATE_LABEL } from "../../drawings";
import type { DrawingProfile, Projection } from "../../drawings";
import { manufacturingOutput } from "../../drawings/manufacturingOutput";

interface Props {
  profile: DrawingProfile; baseProfileId: string; message: string;
  onChange: (profile: DrawingProfile) => void; onSelect: (id: string) => void;
  onReset: () => void; onSave: () => void; onLoad: () => void;
}
const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-slate-900 p-2";
const buttonClass = "rounded-lg border border-white/20 px-3 py-2 text-xs";

export default function DrawingSettings({ profile, baseProfileId, message, onChange, onSelect, onReset, onSave, onLoad }: Props) {
  const { contents, titleBlock, numbering } = profile;
  const output = manufacturingOutput(profile);
  const setContents = (patch: Partial<DrawingProfile["contents"]>) => onChange({ ...profile, contents: { ...contents, ...patch } });
  const setTitle = (patch: Partial<DrawingProfile["titleBlock"]>) => onChange({ ...profile, titleBlock: { ...titleBlock, ...patch } });
  const setNumbering = (patch: Partial<DrawingProfile["numbering"]>) => onChange({ ...profile, numbering: { ...numbering, ...patch } });
  return (
    <div className="mt-4 rounded-xl border border-white/10 p-3" role="group" aria-label="Drawing Settings">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Drawing Settings</h3>
        <button type="button" className={buttonClass} onClick={onReset}>Reset to profile defaults</button>
        <button type="button" className={buttonClass} onClick={onSave}>Save preferences locally</button>
        <button type="button" className={buttonClass} onClick={onLoad}>Load saved preferences</button>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <label>Drawing profile<select aria-label="Drawing profile" className={inputClass} value={baseProfileId} onChange={e => onSelect(e.target.value)}>{DRAWING_PROFILE_CHOICES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Drawing template<select aria-label="Drawing template" className={inputClass} value={profile.template} onChange={e => onChange({ ...profile, template: e.target.value as DrawingProfile["template"] })}><option value="workshop">Furniture Workshop</option><option value="engineering">{FORMAL_TEMPLATE_LABEL}</option></select></label>
        <label>Sheet size<select aria-label="Drawing sheet size" className={inputClass} value={profile.sheet.format} onChange={e => onChange({ ...profile, sheet: { ...profile.sheet, format: e.target.value as DrawingProfile["sheet"]["format"] } })}>{["A4", "A3", "A2", "A1"].map(format => <option key={format} value={format}>{format} landscape</option>)}</select></label>
        <label>Projection convention<select aria-label="Projection convention" className={inputClass} value={profile.sheet.projectionConvention} onChange={e => onChange({ ...profile, sheet: { ...profile.sheet, projectionConvention: e.target.value as DrawingProfile["sheet"]["projectionConvention"] } })}><option value="third-angle">Third-angle</option><option value="first-angle">First-angle</option></select></label>
      </div>
      <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <legend className="text-xs text-slate-400">Assembly annotations</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={profile.annotations.balloons} onChange={e => onChange({ ...profile, annotations: { ...profile.annotations, balloons: e.target.checked } })} />Component balloons</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={profile.annotations.assemblyPartsList} onChange={e => onChange({ ...profile, annotations: { ...profile.annotations, assemblyPartsList: e.target.checked } })} />Compact assembly parts list</label>
        <label>GA callouts<select aria-label="GA callout level" className="ml-2 rounded-lg border border-white/20 bg-slate-900 p-2" value={profile.annotations.gaLevel} onChange={e => onChange({ ...profile, annotations: { ...profile.annotations, gaLevel: e.target.value as "panels" | "assemblies" } })}><option value="assemblies">Top-level assemblies</option><option value="panels">Panel BOM groups</option></select></label>
        <label>Balloon display<select aria-label="Balloon display" className="ml-2 rounded-lg border border-white/20 bg-slate-900 p-2" value={profile.annotations.balloonDisplay} onChange={e => onChange({ ...profile, annotations: { ...profile.annotations, balloonDisplay: e.target.value as DrawingProfile["annotations"]["balloonDisplay"] } })}><option value="one-per-item">One representative per item</option><option value="visible-occurrences">Each visible occurrence</option></select></label>
        <label>Item labels<select aria-label="Item labels" className="ml-2 rounded-lg border border-white/20 bg-slate-900 p-2" value={profile.annotations.itemNumberStyle} onChange={e => onChange({ ...profile, annotations: { ...profile.annotations, itemNumberStyle: e.target.value as DrawingProfile["annotations"]["itemNumberStyle"] } })}><option value="numeric">1, 2, 3…</option><option value="prefixed">P1, P2, P3…</option></select></label>
      </fieldset>
      <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="text-xs text-slate-400">Assembly sheets</legend>
        <label>Functional presentation<select aria-label="Functional dimension presentation" className="ml-2 rounded-lg border border-white/20 bg-slate-900 p-2" value={contents.functionalPresentation ?? "isolated-edges"} onChange={e => setContents({ functionalPresentation: e.target.value as "contextual" | "isolated-edges" })}><option value="contextual">Contextual assembly details</option><option value="isolated-edges">Isolated edges (diagnostic)</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" aria-label="Contextual assembly sections" checked={!!contents.contextualSections} onChange={e => setContents({ contextualSections: e.target.checked })} />Contextual sections and detail</label>
        <label className="flex items-center gap-2"><input type="checkbox" aria-label="Functional dimension details" checked={!!contents.functionalDimensions} onChange={e => setContents({ functionalDimensions: e.target.checked })} />Functional dimension details</label>
        {([['exploded', 'Exploded assembly sheet'], ['drawers', 'Drawer subassembly sheets'], ['carcass', 'Carcass subassembly sheet']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" aria-label={label} checked={contents.assemblySheets[key]} onChange={e => setContents({ assemblySheets: { ...contents.assemblySheets, [key]: e.target.checked } })} />{label}</label>)}
      </fieldset>
      <fieldset className="mt-3 text-sm">
        <legend className="text-xs text-slate-400">Assembly views</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">{(["front", "top", "right", "isometric"] as Projection[]).map(view => <label className="flex items-center gap-2" key={view}><input type="checkbox" aria-label={`Include ${view} assembly view`} checked={contents.assemblyViews.includes(view)} onChange={e => setContents({ assemblyViews: e.target.checked ? [...contents.assemblyViews, view] : contents.assemblyViews.filter(v => v !== view) })} />{view === "right" ? "Right side" : view[0].toUpperCase() + view.slice(1)}</label>)}</div>
      </fieldset>
      <details className="mt-3 text-xs text-slate-400">
        <summary className="cursor-pointer">Drawing diagnostics</summary>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" aria-label="Diagnostic isometric wireframe" checked={profile.sheet.isometricMode === "diagnostic-wireframe"} onChange={e => onChange({ ...profile, sheet: { ...profile.sheet, isometricMode: e.target.checked ? "diagnostic-wireframe" : "visible-edges" } })} />Transparent isometric wireframe — diagnostic only</label>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={contents.componentDrawings} onChange={e => setContents({ componentDrawings: e.target.checked })} />Component drawings</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={contents.cuttingList.include} onChange={e => setContents({ cuttingList: { ...contents.cuttingList, include: e.target.checked } })} />Cutting list</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={contents.hardwareSchedule} onChange={e => setContents({ hardwareSchedule: e.target.checked })} />Unverified hardware schedule</label>
        <label>Cutting list placement<select aria-label="Cutting list placement" className="ml-2 rounded-lg border border-white/20 bg-slate-900 p-2" disabled={!contents.cuttingList.include} value={contents.cuttingList.placement} onChange={e => setContents({ cuttingList: { ...contents.cuttingList, placement: e.target.value as "before-components" | "after-components" } })}><option value="after-components">After component drawings</option><option value="before-components">Before component drawings</option></select></label>
      </div>
      <details className="mt-3 rounded-lg border border-white/10 p-3 text-sm">
        <summary className="cursor-pointer">Panel property output</summary>
        <p className="mt-2 text-xs text-slate-400">Hidden sheets keep their source properties and validation. Compact notes are the workshop default; continuations are added only when needed for readability.</p>
        <div className="mt-3 flex flex-wrap gap-4">{([['propertyDrawings', 'Panel property drawings'], ['detailedTables', 'Detailed panel property tables'], ['schedule', 'Printed manufacturing schedule'], ['keyedAnnotations', 'Grain, face and edging drawing keys'], ['catalogueLegend', 'Referenced library definitions']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input aria-label={label} type="checkbox" checked={!!output[key]} onChange={e => setContents({ manufacturingOutput: { ...output, [key]: e.target.checked } })} />{label}</label>)}</div>
        <label className="mt-3 block">Panel drawing scope<select aria-label="Panel property drawing scope" className={inputClass} value={output.panelScope} onChange={e => setContents({ manufacturingOutput: { ...output, panelScope: e.target.value as typeof output.panelScope } })}><option value="selected">Selected panel only</option><option value="selected-and-edited">Selected and all edited panels</option></select></label>
        <p className="mt-2 text-xs text-slate-400">Property drawings/tables also require Component drawings. Printing the schedule also requires Cutting list. The live schedule remains available.</p>
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">Title block and numbering</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label>Project name<input aria-label="Drawing project name" className={inputClass} maxLength={60} value={titleBlock.projectName} onChange={e => setTitle({ projectName: e.target.value })} /></label>
          <label>Company name (optional)<input aria-label="Drawing company name" className={inputClass} maxLength={60} value={titleBlock.companyName ?? ""} onChange={e => setTitle({ companyName: e.target.value })} /></label>
          <label>Drawing prefix<input aria-label="Drawing prefix" className={inputClass} maxLength={60} value={numbering.prefix} onChange={e => setNumbering({ prefix: e.target.value })} /></label>
          <label>Revision<input aria-label="Drawing revision" className={inputClass} maxLength={60} value={numbering.revision} onChange={e => setNumbering({ revision: e.target.value })} /></label>
          <label>Drawing numbering<select aria-label="Drawing numbering" className={inputClass} value={numbering.scheme} onChange={e => setNumbering({ scheme: e.target.value as DrawingProfile["numbering"]["scheme"] })}><option value="by-sheet-kind">By sheet kind (GA / EA / DS / CS / CP / CL / HW)</option><option value="sequential">Sequential across the package</option></select></label>
          <label>First drawing number<input aria-label="First drawing number" className={inputClass} type="number" min={1} max={999999} step={1} value={Number.isFinite(numbering.startAt) ? numbering.startAt : ""} onChange={e => setNumbering({ startAt: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
        </div>
        {titleBlock.additionalFields.map((field, index) => <div className="mt-2 flex flex-wrap items-end gap-2" key={index}>
          <label className="min-w-0 flex-1">Metadata label<input aria-label={`Metadata label ${index + 1}`} className={inputClass} maxLength={20} value={field.label} onChange={e => setTitle({ additionalFields: titleBlock.additionalFields.map((f, i) => i === index ? { ...f, label: e.target.value } : f) })} /></label>
          <label className="min-w-0 flex-1">Metadata value<input aria-label={`Metadata value ${index + 1}`} className={inputClass} maxLength={60} value={field.value} onChange={e => setTitle({ additionalFields: titleBlock.additionalFields.map((f, i) => i === index ? { ...f, value: e.target.value } : f) })} /></label>
          <button type="button" className={buttonClass} aria-label={`Remove metadata field ${index + 1}`} onClick={() => setTitle({ additionalFields: titleBlock.additionalFields.filter((_, i) => i !== index) })}>Remove</button>
        </div>)}
        <button type="button" disabled={titleBlock.additionalFields.length >= 3} className={`${buttonClass} mt-2 disabled:opacity-40`} onClick={() => setTitle({ additionalFields: [...titleBlock.additionalFields, { label: "Reference", value: "" }] })}>Add title-block metadata</button>
      </details>
      <p className="mt-3 text-xs text-slate-400">Active settings: {profile.name}. Changes update the preview and PDF immediately. Save/Load uses this browser only. Reset restores the selected profile; it does not erase saved preferences.</p>
      {message && <p role="status" className="mt-2 text-xs text-blue-200">{message}</p>}
    </div>
  );
}
