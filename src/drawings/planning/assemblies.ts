import type { FurnitureResult, PanelComponent, Vector3 } from "../../furniture";
import type { DrawingProfile } from "../types";
import { bounds3 } from "../projections";
import { canonicalDrawingSnapshot } from "./gaPlan";

export interface DrawingAssemblyNode {
  id: string; parentId: string | null; name: string; childAssemblyIds: string[];
  /** Direct physical memberships, including unverified hardware; no quantities added. */
  componentIds: string[]; panelIds: string[]; descendantPanelIds: string[];
}
export interface AssemblyDrawingGroup {
  id: string; kind: "drawer" | "carcass"; assemblyIds: string[]; representativeId: string;
  /** Maps corresponding representative panels to each actual physical occurrence. */
  occurrenceMaps: { assemblyId: string; panels: Record<string, string> }[];
}
export interface AssemblyDrawingPlan {
  schemaVersion: 1; ruleVersion: "rectangular-assembly-layout-1"; rootId: string;
  nodes: DrawingAssemblyNode[]; groups: AssemblyDrawingGroup[];
  decisions: { kind: "exploded" | "drawer" | "carcass"; included: boolean; reason: string }[];
  equivalence: "existing-panel-layout-only; manufacturing-interchangeability-not-assessed";
}
const axes = ["x", "y", "z"] as const;
const sorted = (ids: string[]) => [...ids].sort();
const numeric = (n: number) => Number(n.toFixed(9)); // cancel global-coordinate subtraction noise only

/** Membership/parent traversal is independent of semantic path spelling. Reject
 * ambiguous, orphaned or cyclic ownership before making any scoped parts list. */
export function createAssemblyDrawingPlan(result: FurnitureResult, profile: DrawingProfile, rootId: string, carcassId: string): AssemblyDrawingPlan {
  const nodes: DrawingAssemblyNode[] = [...result.assemblies].sort((a, b) => a.id.localeCompare(b.id)).map(a => ({
    id: a.id, parentId: a.parentId, name: a.name, childAssemblyIds: sorted(result.assemblies.filter(b => b.parentId === a.id).map(b => b.id)),
    componentIds: sorted(a.componentIds), panelIds: sorted(a.componentIds.filter(id => result.components.find(c => c.id === id)?.kind === "panel")), descendantPanelIds: [],
  }));
  if (new Set(nodes.map(n => n.id)).size !== nodes.length || nodes.filter(n => n.parentId === null).length !== 1 || !nodes.some(n => n.id === rootId && n.parentId === null)) throw new Error("Assembly hierarchy requires one unique root.");
  const memberships = nodes.flatMap(n => n.componentIds);
  if (memberships.length !== result.components.length || new Set(memberships).size !== memberships.length || result.components.some(c => !nodes.some(n => n.id === c.assemblyId && n.componentIds.includes(c.id)))) throw new Error("Assembly hierarchy has missing, duplicate or incorrect component ownership.");
  const descendants = (id: string, visited: string[]): string[] => {
    const node = nodes.find(n => n.id === id);
    if (!node || visited.includes(id)) throw new Error("Assembly hierarchy is orphaned or cyclic.");
    return sorted([...node.panelIds, ...node.childAssemblyIds.flatMap(child => descendants(child, [...visited, id]))]);
  };
  for (const node of nodes) {
    let current = node; const visited = new Set<string>();
    while (current.parentId) {
      if (visited.has(current.id)) throw new Error("Assembly hierarchy is cyclic.");
      visited.add(current.id);
      const parent = nodes.find(n => n.id === current.parentId);
      if (!parent) throw new Error("Assembly hierarchy is orphaned.");
      current = parent;
    }
    if (current.id !== rootId) throw new Error("Assembly is outside the drawing root.");
    node.descendantPanelIds = descendants(node.id, []);
  }
  // Registered drawer-chest policy: other families need their own sheet decisions.
  const revision = JSON.parse(result.specificationRevision);
  if (revision.parameters?.family !== "drawer-chest") throw new Error("No assembly drawing policy for this family.");
  const carcass = nodes.find(n => n.id === carcassId && n.parentId === rootId);
  if (!carcass) throw new Error("Assembly drawing policy cannot resolve the carcass.");
  if (nodes.find(n => n.id === rootId)!.panelIds.length) throw new Error("Drawer-chest assembly policy cannot leave root-owned panels outside its subassemblies.");
  const panels = result.components.filter(c => c.kind === "panel");
  const signaturePanels = (node: DrawingAssemblyNode) => {
    const members = panels.filter(p => node.descendantPanelIds.includes(p.id)), bounds = bounds3(members);
    return members.map(p => ({ panel: p, signature: canonicalDrawingSnapshot({
      name: p.name, materialId: p.materialId, dimensions: p.dimensions, thickness: p.thickness, thicknessAxis: p.thicknessAxis, quantity: p.quantity,
      position: Object.fromEntries(axes.map(axis => [axis, numeric(p.position[axis] - bounds.min[axis])])),
    }) })).sort((a, b) => a.signature.localeCompare(b.signature) || a.panel.id.localeCompare(b.panel.id));
  };
  const groups: AssemblyDrawingGroup[] = [];
  const signatures = new Map<string, AssemblyDrawingGroup>();
  for (const node of nodes.filter(n => n.parentId === rootId)) {
    const kind = node.id === carcassId ? "carcass" : "drawer";
    const members = signaturePanels(node);
    if (kind === "drawer" && (node.childAssemblyIds.length || members.length !== 6)) throw new Error("Drawer drawing policy requires six actual panels per drawer.");
    const origin = bounds3(members.map(m => m.panel)).min;
    const hardware = result.components.filter(c => c.kind === "hardware" && node.componentIds.includes(c.id)).map(c => ({
      ...c, id: undefined, assemblyId: undefined,
      position: Object.fromEntries(axes.map(axis => [axis, numeric(c.position[axis] - origin[axis])])),
    })).map(c => canonicalDrawingSnapshot(c)).sort();
    const signature = `${kind}:${canonicalDrawingSnapshot({ panels: members.map(m => m.signature), hardware })}`;
    let group = signatures.get(signature);
    if (!group) {
      group = { id: `${kind}:${node.id}`, kind, assemblyIds: [], representativeId: node.id, occurrenceMaps: [] };
      groups.push(group); signatures.set(signature, group);
    }
    const representative = signaturePanels(nodes.find(n => n.id === group!.representativeId)!);
    group.assemblyIds.push(node.id);
    group.occurrenceMaps.push({ assemblyId: node.id, panels: Object.fromEntries(representative.map((m, i) => [m.panel.id, members[i].panel.id])) });
  }
  return { schemaVersion: 1, ruleVersion: "rectangular-assembly-layout-1", rootId, nodes, groups,
    decisions: [
      { kind: "exploded", included: profile.contents.assemblySheets.exploded, reason: "Drawer-chest policy separates carcass panels and rigid drawer groups for preliminary relationship review." },
      { kind: "drawer", included: profile.contents.assemblySheets.drawers, reason: "Drawer-chest policy exposes the six panels concealed in the GA; one sheet per existing panel-layout group." },
      { kind: "carcass", included: profile.contents.assemblySheets.carcass, reason: "Drawer-chest policy exposes the recessed back and full-width top/base relationships." },
    ], equivalence: "existing-panel-layout-only; manufacturing-interchangeability-not-assessed" };
}

export const assemblyPanels = (result: FurnitureResult, plan: AssemblyDrawingPlan, id: string): PanelComponent[] => {
  const node = plan.nodes.find(n => n.id === id);
  if (!node) throw new Error(`Unknown drawing assembly ${id}.`);
  return result.components.filter((p): p is PanelComponent => p.kind === "panel" && node.descendantPanelIds.includes(p.id)).sort((a, b) => a.id.localeCompare(b.id));
};

/** A cloned presentation scene. Geometry sizes, IDs, quantities and original
 * positions are never edited; assembly.position is already included by the engine. */
export function translateDrawingPanels(panels: PanelComponent[], offsets: Record<string, Vector3>): PanelComponent[] {
  return panels.map(p => ({ ...p, position: Object.fromEntries(axes.map(axis => [axis, p.position[axis] + (offsets[p.id]?.[axis] ?? 0)])) as unknown as Vector3 }));
}
