import type { FurnitureResult } from "../furniture";
import { assertManufacturingSource } from "./source";

export interface ManufacturingComponentGroup { id: string; label: string; componentIds: string[]; quantity: number; description: string }
/** Registered drawer-chest identity adapter, not a size/name-based equivalence rule.
 * Unknown families/roles remain in an explicit unclassified group. */
export function manufacturingComponentGroups(source: FurnitureResult): ManufacturingComponentGroup[] {
  assertManufacturingSource(source);
  const root = source.assemblies.find(a => a.id === "chest" && a.parentId === null);
  const carcass = source.assemblies.find(a => a.id === "chest/carcass" && a.parentId === root?.id);
  const drawers = root ? source.assemblies.filter(a => a.parentId === root.id && /^chest\/drawer-[1-9]\d*$/.test(a.id)) : [];
  const panels = source.components.filter(c => c.kind === "panel");
  const owned = (id: string, assembly: typeof carcass) => !!assembly && assembly.componentIds.includes(id);
  const fronts: string[] = [], boxes: string[] = [], sides: string[] = [], other: string[] = [];
  for (const panel of panels) {
    const drawer = drawers.find(a => a.id === panel.assemblyId && owned(panel.id, a));
    if (drawer && panel.id === `${drawer.id}/front`) fronts.push(panel.id);
    else if (drawer && ["bottom", "left", "right", "box-front", "rear"].some(k => panel.id === `${drawer.id}/${k}`)) boxes.push(panel.id);
    else if (carcass && panel.assemblyId === carcass.id && owned(panel.id, carcass) && ["base", "top", "left", "right", "back"].some(k => panel.id === `${carcass.id}/${k}`)) sides.push(panel.id);
    else other.push(panel.id);
  }
  return ([
    ["drawer-fronts", "Drawer fronts", fronts, "Separate fronts, each with its own face and edge requirements."],
    ["carcass", "Carcass", sides, "Outer panels and back; stock and orientations can differ."],
    ["drawer-boxes", "Drawer boxes", boxes, "Box sides, front/rear and bottoms; review material and orientation differences."],
    ["other", "Other panels", other, "No registered role mapping. Review physical occurrences individually."],
  ] as const).filter(([, , ids]) => ids.length).map(([id, label, ids, description]) => ({ id, label, description, componentIds: [...ids].sort(), quantity: panels.filter(p => ids.includes(p.id)).reduce((n, p) => n + p.quantity, 0) }));
}
