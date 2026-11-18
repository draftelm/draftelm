import type { FurnitureResult } from "../furniture";
import type { ManufacturingProperty, PanelManufacturingDocument, PanelManufacturingPlan, PanelManufacturingProperties } from "./types";
import { resolvePanelManufacturing } from "./variants";
import { EDGE_KEYS, FACE_KEYS, panelEdgeId, panelFaceId } from "./topology";

export const MANUFACTURING_COLUMNS = ["Part number", "Description / occurrence", "Quantity", "L x W x T (mm)", "Material / code", "Grain direction", "Edge banding / treatments", "Finished dimensions", "Surface finish", "Manufacturing notes"] as const;
export interface ManufacturingScheduleRow {
  id: string; componentId: string; sourceBomId: string; variantId: string; quantity: number;
  /** Ten business fields; identities/technical references remain separate. */
  cells: string[];
}
export function propertyText<T>(p: ManufacturingProperty<T>, format: (value: T) => string): string {
  return p.status === "unassigned" ? "Not specified" : `${format(p.value)} [${p.status === "provisional" ? "P" : "V"}]`;
}
export function panelPropertyNotes(p: PanelManufacturingProperties): { label: string; text: string; sourceId?: string }[] {
  return [
    { label: "Material / code", text: propertyText(p.material, m => `${m.stockMaterialId}; ${m.manufacturerCodes.map(c => `${c.manufacturerId}=${c.code}`).join("; ") || "Code: Not specified"}; Grade: ${propertyText(m.grade, g => g ?? "Not applicable")}`) },
    { label: "Grain (local axes)", text: propertyText(p.grain, g => g.direction === "non-directional" ? "Non-directional" : `${g.direction === "longitudinal" ? "Along U" : "Along V"}; ${g.sense} sense`) },
    ...FACE_KEYS.flatMap(key => { const f = p.faces.find(f => f.faceId === panelFaceId(p.componentId, key))!; return [
      { label: `Face ${key.toUpperCase()} requirements`, sourceId: f.faceId, text: propertyText(f.requirements, r => `${r.decorative ? "Decorative" : r.reverse ? "Reverse" : "No decorative/reverse role"}; ${r.visibleInService ? "visible required" : "visibility not required"}; Good face: ${r.goodFaceRequirements.map(g => g.description).join("; ") || "Not specified"}`) },
      { label: `Face ${key.toUpperCase()} finish`, sourceId: f.faceId, text: propertyText(f.finish, f => f.kind === "none" ? "No applied finish" : `${f.specificationId}; appearance ${propertyText(f.appearance, a => a ?? "Not applicable")}; process ${propertyText(f.process, p => p?.specificationId ?? "Not applicable")}`) },
    ]; }),
    ...EDGE_KEYS.map(key => { const e = p.edges.find(e => e.edgeId === panelEdgeId(p.componentId, key))!; return { label: key, sourceId: e.edgeId, text: propertyText(e.treatment, t => t.kind === "none" ? "No treatment" : `${t.kind}: ${t.specificationId}; thickness ${propertyText(t.nominalThicknessMm, n => n === null ? "Not applicable" : `${n} mm`)}; material ${propertyText(t.material, m => m?.stockMaterialId ?? "Not applicable")}; appearance ${propertyText(t.appearance, a => a ?? "Not applicable")}; process ${propertyText(t.process, p => p?.specificationId ?? "Not applicable")}`) }; }),
    { label: "Other manufacturing notes", text: propertyText(p.otherRequirements, rs => rs.map(r => `${r.requirementId}: ${r.specification}`).join("; ") || "No additional requirements") },
    { label: "Finished dimensions", text: "Not specified" },
    { label: "Status", text: "P = provisional / unverified; V = supplied verification record only. Not approved for manufacture or purchasing." },
  ];
}
export function createManufacturingSchedule(source: FurnitureResult, properties: PanelManufacturingDocument, plan: PanelManufacturingPlan = resolvePanelManufacturing(source, properties)): ManufacturingScheduleRow[] {
  return properties.panels.map(p => {
    const panel = source.components.find(c => c.kind === "panel" && c.id === p.componentId)!;
    const bom = source.bom.find(b => b.kind === "panel" && b.componentIds.includes(p.componentId))!, size = bom.cutSize!;
    const variant = plan.variants.find(v => v.componentIds.includes(p.componentId))!;
    const material = panelPropertyNotes(p)[0].text;
    const assignedEdges = p.edges.filter(e => e.treatment.status !== "unassigned");
    const edges = assignedEdges.length ? [...assignedEdges.map(e => `${EDGE_KEYS.find(k => panelEdgeId(p.componentId, k) === e.edgeId)}: ${propertyText(e.treatment, t => t.kind === "none" ? "None" : `${t.kind} ${t.specificationId}${t.nominalThicknessMm.status === "unassigned" ? "" : ` ${t.nominalThicknessMm.value ?? "N/A"} mm`}`)}`), ...(assignedEdges.length < 4 ? ["Other edges: Not specified"] : [])].join("\n") : "Not specified";
    const finish = p.faces.every(f => f.finish.status === "unassigned") ? "Not specified" : p.faces.map(f => `${f.faceId.endsWith(":a") ? "A" : "B"}: ${propertyText(f.finish, f => f.kind === "none" ? "No applied finish" : `${f.specificationId}${f.appearance.status === "unassigned" ? "" : `; ${f.appearance.value ?? "Not applicable"}`}`)}`).join("\n");
    const good = p.faces.filter(f => f.requirements.status !== "unassigned").map(f => `${f.faceId.endsWith(":a") ? "A" : "B"}: ${propertyText(f.requirements, r => [r.decorative ? "decorative" : r.reverse ? "reverse" : "ordinary", ...(r.visibleInService ? ["visible"] : []), ...r.goodFaceRequirements.map(g => g.description)].join(", "))}`).join("\n");
    return { id: `manufacturing-row:${encodeURIComponent(p.componentId)}`, componentId: p.componentId, sourceBomId: bom.id, variantId: variant.id, quantity: panel.quantity,
      cells: ["Not specified", `${panel.name}\n${p.componentId}\nBOM ${bom.id}`, String(panel.quantity), `${size.length} x ${size.width} x ${size.thickness}`, material,
        propertyText(p.grain, g => g.direction === "non-directional" ? "Non-directional" : `${g.direction === "longitudinal" ? "U" : "V"} (${g.sense})`), edges, "Not specified", finish, `${good || "Good face: Not specified"}${p.otherRequirements.status === "unassigned" ? "" : `\n${propertyText(p.otherRequirements, rs => rs.map(r => `${r.requirementId}: ${r.specification}`).join("; ") || "No additional requirements")}`}\nUnverified / preliminary`] };
  }).sort((a, b) => a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0);
}
