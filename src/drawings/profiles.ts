import type { DrawingOptions, DrawingProfile } from "./types";

const workshop: DrawingProfile = {
  schemaVersion: 3, id: "furniture-workshop", name: "Furniture Workshop", template: "workshop",
  sheet: { format: "A3", projectionConvention: "third-angle" },
  contents: { assemblyViews: ["front", "top", "right", "isometric"], componentDrawings: true,
    cuttingList: { include: true, placement: "after-components" }, hardwareSchedule: true,
    assemblySheets: { exploded: true, drawers: true, carcass: true }, functionalDimensions: true, contextualSections: true },
  titleBlock: { projectName: "DRAFTELM", additionalFields: [] },
  numbering: { prefix: "DRF-CD", revision: "A", scheme: "by-sheet-kind", startAt: 1 },
  hardwarePurchasing: "approved-only", extensions: {},
  annotations: { balloons: true, assemblyPartsList: true, balloonDisplay: "one-per-item", itemNumberStyle: "numeric", gaLevel: "assemblies" },
};
const engineering: DrawingProfile = { ...structuredClone(workshop), id: "engineering", name: "Engineering — compliance not yet verified", template: "engineering" };

export const DRAWING_PROFILE_CHOICES = [
  { id: workshop.id, name: workshop.name }, { id: engineering.id, name: engineering.name },
] as const;
export function getDrawingProfile(id = workshop.id): DrawingProfile {
  const profile = [workshop, engineering].find(p => p.id === id);
  if (!profile) throw new Error(`Unknown drawing profile: ${id}.`);
  return structuredClone(profile);
}
export function profileFromOptions(options: DrawingOptions): DrawingProfile {
  const profile = getDrawingProfile(options.template === "engineering" ? engineering.id : workshop.id);
  profile.template = options.template;
  profile.sheet = { format: options.format, projectionConvention: options.projectionConvention };
  profile.titleBlock.projectName = options.projectName;
  profile.numbering.prefix = options.drawingPrefix; profile.numbering.revision = options.revision;
  // The legacy options API retains its annotation visibility.
  profile.annotations.balloons = false; profile.annotations.assemblyPartsList = false;
  profile.annotations.gaLevel = "panels";
  profile.contents.assemblySheets = { exploded: false, drawers: false, carcass: false };
  delete profile.contents.functionalDimensions;
  delete profile.contents.contextualSections;
  return profile;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, allowed: string[]) => record(v) && Object.keys(v).every(k => allowed.includes(k));
const text = (v: unknown, max = 60, blank = false): v is string => typeof v === "string" && v.length <= max && (blank || !!v.trim()) && !/[\x00-\x1f\x7f]/.test(v);
const token = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(v);
const choice = (v: unknown, values: string[]) => typeof v === "string" && values.includes(v);

/** Local data is untrusted: reject unknown versions/keys and approval/geometry overrides. */
export function parseDrawingProfile(value: unknown): { profile: DrawingProfile | null; issues: string[] } {
  const issues: string[] = [];
  const legacy = record(value) && value.schemaVersion === 1;
  const current = record(value) && value.schemaVersion === 3;
  if (!keys(value, ["schemaVersion", "id", "name", "template", "sheet", "contents", "titleBlock", "numbering", "hardwarePurchasing", "extensions", ...(legacy ? [] : ["annotations"])])) {
    return { profile: null, issues: ["Drawing profile must contain only supported configuration fields."] };
  }
  const v = value as Record<string, unknown>;
  if (![1, 2, 3].includes(Number(v.schemaVersion)) || typeof v.schemaVersion !== "number") issues.push("Unsupported drawing profile version.");
  if (!token(v.id) || !text(v.name)) issues.push("Profile ID/name is invalid.");
  if (!choice(v.template, ["workshop", "engineering"])) issues.push("Unsupported drawing template.");
  const s = v.sheet;
  if (!keys(s, ["format", "projectionConvention", "isometricMode"]) || !record(s) || !choice(s.format, ["A4", "A3", "A2", "A1"]) || !choice(s.projectionConvention, ["first-angle", "third-angle"]) ||
    (s.isometricMode !== undefined && !choice(s.isometricMode, ["visible-edges", "diagnostic-wireframe"]))) issues.push("Unsupported sheet size, projection or isometric mode.");
  const c = v.contents;
  if (!keys(c, ["assemblyViews", "componentDrawings", "cuttingList", "hardwareSchedule", ...(current ? ["assemblySheets", "functionalDimensions", "contextualSections"] : [])]) || !record(c)) issues.push("Invalid drawing contents.");
  else {
    const assembly = c.assemblySheets;
    if (c.contextualSections !== undefined && typeof c.contextualSections !== "boolean") issues.push("Contextual section visibility must be boolean.");
    if (c.functionalDimensions !== undefined && typeof c.functionalDimensions !== "boolean") issues.push("Functional dimension visibility must be boolean.");
    if (current && (!keys(assembly, ["exploded", "drawers", "carcass"]) || !record(assembly) || ["exploded", "drawers", "carcass"].some(k => typeof assembly[k] !== "boolean"))) issues.push("Invalid assembly-sheet settings.");
    if (!Array.isArray(c.assemblyViews) || c.assemblyViews.length > 4 || new Set(c.assemblyViews).size !== c.assemblyViews.length || Array.from(c.assemblyViews).some(p => !choice(p, ["front", "top", "right", "isometric"]))) issues.push("Assembly views must be distinct supported projections.");
    if (typeof c.componentDrawings !== "boolean" || typeof c.hardwareSchedule !== "boolean") issues.push("Sheet visibility must be boolean.");
    const cut = c.cuttingList;
    if (!keys(cut, ["include", "placement"]) || !record(cut) || typeof cut.include !== "boolean" || !choice(cut.placement, ["before-components", "after-components"])) issues.push("Invalid cutting-list settings.");
    else if (Array.isArray(c.assemblyViews) && !c.assemblyViews.length && !c.componentDrawings && !cut.include && !c.hardwareSchedule && !c.functionalDimensions && !c.contextualSections && !(record(assembly) && Object.values(assembly).some(x => x === true))) issues.push("Select at least one drawing view or schedule; empty PDFs are not generated.");
  }
  const t = v.titleBlock;
  if (!keys(t, ["projectName", "companyName", "additionalFields"]) || !record(t) || !text(t.projectName) || (t.companyName !== undefined && !text(t.companyName, 60, true)) ||
    !Array.isArray(t.additionalFields) || t.additionalFields.length > 3 || Array.from(t.additionalFields).some(f => !keys(f, ["label", "value"]) || !record(f) || !text(f.label, 20) || !text(f.value))) issues.push("Title block requires a project, optional company and at most three labelled metadata fields.");
  const n = v.numbering;
  if (!keys(n, ["prefix", "revision", "scheme", "startAt"]) || !record(n) || !text(n.prefix) || !text(n.revision) || !choice(n.scheme, ["by-sheet-kind", "sequential"]) || !Number.isSafeInteger(n.startAt) || Number(n.startAt) < 1 || Number(n.startAt) > 999999) issues.push("Invalid drawing numbering or revision settings.");
  if (v.hardwarePurchasing !== "approved-only") issues.push("Unverified hardware must be excluded from approved purchasing quantities.");
  const a = v.annotations;
  if (!legacy && (!keys(a, ["balloons", "assemblyPartsList", "balloonDisplay", "itemNumberStyle", ...(current ? ["gaLevel"] : [])]) || !record(a) || typeof a.balloons !== "boolean" || typeof a.assemblyPartsList !== "boolean" ||
    !choice(a.balloonDisplay, ["one-per-item", "visible-occurrences"]) || !choice(a.itemNumberStyle, ["numeric", "prefixed"]) || (current && !choice(a.gaLevel, ["panels", "assemblies"])))) issues.push("Invalid assembly annotation settings.");
  const e = v.extensions;
  if (!keys(e, ["branding", "materials", "machining"]) || !record(e)) issues.push("Unsupported profile extensions.");
  else for (const [name, allowed] of [["branding", ["logoAssetId", "borderTemplateId", "importedTemplateId"]], ["materials", ["annotationProfileId"]], ["machining", ["annotationProfileId"]]] as const) {
    if (e[name] !== undefined && (!keys(e[name], [...allowed]) || !record(e[name]) || Object.values(e[name]).some(id => !token(id)))) issues.push(`Invalid reserved ${name} extension IDs; executable content and URLs are not supported.`);
  }
  if (issues.length) return { profile: null, issues };
  const migrated = current ? value : { ...v, schemaVersion: 3,
    contents: { ...(c as object), assemblySheets: { exploded: false, drawers: false, carcass: false } },
    annotations: { ...(legacy ? { balloons: false, assemblyPartsList: false, balloonDisplay: "one-per-item", itemNumberStyle: "numeric" } : a as object), gaLevel: "panels" } };
  return { profile: structuredClone(migrated as unknown as DrawingProfile), issues };
}
