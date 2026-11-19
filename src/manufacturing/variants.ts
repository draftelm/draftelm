import type { FurnitureResult, PanelComponent } from "../furniture";
import type { ManufacturingGroup, PanelManufacturingDocument, PanelManufacturingPlan, PanelManufacturingProperties } from "./types";
import { compareManufacturingText, manufacturingFingerprint } from "./canonical";
import { createPanelTopology, EDGE_KEYS, FACE_KEYS, panelEdgeId, panelFaceId } from "./topology";
import { assertPanelManufacturingDocument, validatePanelManufacturingDocument } from "./validation";
import { catalogueEntrySubject } from "./catalogue";
import type { CatalogueReference } from "./catalogue";

function fullyVerified(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(fullyVerified);
  if (!value || typeof value !== "object") return true;
  const v = value as Record<string, unknown>;
  if (["edge-band", "lipping", "other"].includes(String(v.kind)) && !v.specificationId) return false;
  if ("status" in v) return v.status === "verified" && fullyVerified(v.value);
  return Object.entries(v).filter(([key]) => key !== "verification").every(([, child]) => fullyVerified(child));
}
/** Keep manufacturing meaning; discard review attribution from equivalence.
 * Unknown/provisional states still remain in isolated occurrence fingerprints. */
function content(value: unknown): unknown {
  if (Array.isArray(value)) {
    const values = value.map(content);
    const sortKey = values.every(v => v && typeof v === "object" && "requirementId" in v) ? "requirementId" : values.every(v => v && typeof v === "object" && "manufacturerId" in v) ? "manufacturerId" : undefined;
    return sortKey ? values.sort((a, b) => compareManufacturingText(String((a as Record<string, unknown>)[sortKey]), String((b as Record<string, unknown>)[sortKey]))) : values;
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("catalogueId" in v && "fingerprint" in v && "entry" in v) {
      const ref = value as CatalogueReference, definition = ref.entry.specification;
      return { catalogueId: ref.catalogueId, definitionFingerprint: definition.status === "unassigned" ? null : catalogueEntrySubject(ref.entry, definition.value), entry: content(ref.entry) };
    }
    if ("status" in v) return { status: v.status, ...(v.status === "unassigned" ? {} : { value: content(v.value) }) };
    return Object.fromEntries(Object.entries(v).map(([key, child]) => [key, content(child)]));
  }
  return value;
}
function normalisedDocument(document: PanelManufacturingDocument) {
  return { ...document, panels: [...document.panels].sort((a, b) => compareManufacturingText(a.componentId, b.componentId)).map(p => ({ ...p, faces: [...p.faces].sort((a, b) => compareManufacturingText(a.faceId, b.faceId)), edges: [...p.edges].sort((a, b) => compareManufacturingText(a.edgeId, b.edgeId)) })) };
}
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

/** A derived partition of occurrences. Never rewrites engineering BOM blanks,
 * claims interchangeability, or produces approved purchasing/release records. */
export function resolvePanelManufacturing(source: FurnitureResult, document: PanelManufacturingDocument): PanelManufacturingPlan {
  assertPanelManufacturingDocument(document, source);
  const variants = new Map<string, ManufacturingGroup>(), blanks = new Map<string, ManufacturingGroup>();
  const records = [...document.panels].sort((a, b) => compareManufacturingText(a.componentId, b.componentId));
  const panelsById = new Map(source.components.filter((c): c is PanelComponent => c.kind === "panel").map(p => [p.id, p]));
  const topology = records.map(p => createPanelTopology(panelsById.get(p.componentId)!, p.orientation));
  const add = (map: Map<string, ManufacturingGroup>, prefix: string, payload: unknown, verified: boolean, p: PanelManufacturingProperties) => {
    const fingerprint = manufacturingFingerprint({ policy: `${prefix}-1`, ...(!verified ? { unresolvedOccurrenceId: p.componentId } : {}), definition: payload });
    const id = `${prefix}:${fingerprint}`, group = map.get(id);
    const sourcePanel = source.components.find(c => c.id === p.componentId)!;
    const bomId = source.bom.find(b => b.kind === "panel" && b.componentIds.includes(p.componentId))!.id;
    if (group) { group.componentIds.push(p.componentId); group.quantity += sourcePanel.quantity; group.sourceBomIds = [...new Set([...group.sourceBomIds, bomId])].sort(); }
    else map.set(id, { id, fingerprint, componentIds: [p.componentId], sourceBomIds: [bomId], quantity: sourcePanel.quantity, equivalence: verified ? "verified-properties-only" : "unresolved-occurrence", manufacturingInterchangeability: "not-assessed" });
  };
  records.forEach((p, i) => {
    const size = topology[i].frame.size;
    const faces = Object.fromEntries(FACE_KEYS.map(key => { const f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, key))!; return [key, { requirements: content(f.requirements), finish: content(f.finish) }]; }));
    const edges = Object.fromEntries(EDGE_KEYS.map(key => [key, content(p.edges.find(e => e.edgeId === panelEdgeId(p.componentId, key))!.treatment)]));
    // Convert occurrence-specific matching face references to local topology keys.
    const matchContent = content(p.grainMatching) as { value?: Record<string, unknown> };
    if (matchContent.value?.kind === "specified") matchContent.value.faceId = FACE_KEYS.find(key => panelFaceId(p.componentId, key) === matchContent.value!.faceId);
    const definition = { topologyVersion: topology[i].version, size, material: content(p.material), stockOrientation: content(p.stockOrientation), grain: content(p.grain), grainMatching: matchContent, faces, edges, otherRequirements: content(p.otherRequirements) };
    add(variants, "manufacturing-variant", definition, fullyVerified(p), p);
    const stockKnown = [p.material, p.stockOrientation, p.grain, p.grainMatching].every(fullyVerified);
    const orientation = p.stockOrientation.status === "verified" ? p.stockOrientation.value : undefined;
    const dimensions = orientation?.kind === "directional" ? { alongMm: size[orientation.along], acrossMm: size[orientation.along === "u" ? "v" : "u"], thicknessMm: size.t } : { lengthMm: Math.max(size.u, size.v), widthMm: Math.min(size.u, size.v), thicknessMm: size.t };
    // U/V names differ across placements. Compare the actual stock-axis lengths,
    // retaining reversal constraints, rather than assembly/world directions.
    const stockConstraint = orientation?.kind === "directional" ? { kind: orientation.kind, reversalAllowed: orientation.reversalAllowed } : content(p.stockOrientation);
    const grain = p.grain.status === "verified" ? p.grain.value : undefined;
    const patternConstraint = grain && grain.direction !== "non-directional" ? { direction: "directional", alongMm: size[grain.direction === "longitudinal" ? "u" : "v"], acrossMm: size[grain.direction === "longitudinal" ? "v" : "u"], sense: grain.sense } : content(p.grain);
    add(blanks, "stock-blank", { material: content(p.material), dimensions, stockConstraint, patternConstraint, matching: matchContent }, stockKnown, p);
  });
  const sort = (map: Map<string, ManufacturingGroup>) => [...map.values()].sort((a, b) => compareManufacturingText(a.id, b.id));
  return freeze({ binding: { engineeringRevision: source.specificationRevision, propertiesSnapshot: manufacturingFingerprint(normalisedDocument(document)) }, topology, variants: sort(variants), stockBlankGroups: sort(blanks), validation: validatePanelManufacturingDocument(document, source), manufacturingReady: false, approvedManufacturingData: false });
}
export function validatePanelManufacturingPlan(plan: PanelManufacturingPlan, source: FurnitureResult, document: PanelManufacturingDocument): string[] {
  try { return manufacturingFingerprint(plan) === manufacturingFingerprint(resolvePanelManufacturing(source, document)) ? [] : ["Manufacturing plan is stale or inconsistent with the source/properties; resolve it again."]; }
  catch (e) { return [e instanceof Error ? e.message : "Invalid manufacturing plan source/properties."]; }
}
