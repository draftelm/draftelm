import { generateFurnitureBOM, validateComponentGeometry } from "../furniture";
import type { FurnitureResult, PanelComponent } from "../furniture";
import { compareManufacturingText, manufacturingFingerprint } from "./canonical";

export const panelSourceSnapshot = (p: PanelComponent) => manufacturingFingerprint({ id: p.id, assemblyId: p.assemblyId, position: p.position, dimensions: p.dimensions, thickness: p.thickness, thicknessAxis: p.thicknessAxis, materialId: p.materialId, quantity: p.quantity });
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Independent domain validation; manufacturing never imports the drawing layer. */
export function assertManufacturingSource(source: FurnitureResult): void {
  if (!source.geometryValid || source.manufacturingReady !== false || !source.specificationRevision || !source.components.some(c => c.kind === "panel") || validateComponentGeometry(source.components).length) throw new Error("Manufacturing properties require validated preliminary geometry and reconciled source BOM.");
  const assemblies = source.assemblies;
  if (new Set(assemblies.map(a => a.id)).size !== assemblies.length || assemblies.some(a => a.parentId !== null && !assemblies.some(b => b.id === a.parentId))) throw new Error("Invalid source assembly identities.");
  for (const a of assemblies) {
    const seen = new Set<string>(); let current: typeof a | undefined = a;
    while (current) { if (seen.has(current.id)) throw new Error("Cyclic source assembly hierarchy."); seen.add(current.id); current = assemblies.find(b => b.id === current!.parentId); }
  }
  const membership = assemblies.flatMap(a => a.componentIds.map(id => [id, a.id]));
  if (membership.length !== source.components.length || source.components.some(c => membership.filter(([id, assembly]) => id === c.id && assembly === c.assemblyId).length !== 1) || new Set(membership.map(([id]) => id)).size !== membership.length) throw new Error("Source assembly ownership is missing, duplicated or inconsistent.");
  const bom = (lines: FurnitureResult["bom"]) => lines.map(b => ({ kind: b.kind, itemId: b.itemId, quantity: b.quantity, unit: b.unit, componentIds: [...b.componentIds].sort(), ...(b.cutSize ? { cutSize: b.cutSize } : {}) })).sort((a, b) => compareManufacturingText(manufacturingFingerprint(a), manufacturingFingerprint(b)));
  if (new Set(source.bom.map(b => b.id)).size !== source.bom.length || manufacturingFingerprint(bom(source.bom)) !== manufacturingFingerprint(bom(generateFurnitureBOM(source.components)))) throw new Error("Source BOM identities, dimensions or quantities disagree with physical components.");
}
export function manufacturingSourceSnapshot(source: FurnitureResult): string {
  return manufacturingFingerprint({ specificationRevision: source.specificationRevision,
    components: byId(source.components), assemblies: byId(source.assemblies).map(a => ({ ...a, componentIds: [...a.componentIds].sort() })),
    bom: byId(source.bom).map(b => ({ ...b, componentIds: [...b.componentIds].sort(), partNames: [...b.partNames].sort() })) });
}
