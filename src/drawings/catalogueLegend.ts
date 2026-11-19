import { catalogueReferenceLabel, collectCatalogueReferences } from "../manufacturing";
import type { PanelManufacturingDocument } from "../manufacturing";

/** Printed once per referenced version, never a repeated full definition per occurrence. */
export function catalogueLegendRows(properties: PanelManufacturingDocument): { id: string; cells: string[] }[] {
  return collectCatalogueReferences(properties).map((ref, i) => {
    const e = ref.entry, s = e.specification;
    const identity = `L${i + 1}\n${e.name}\n${catalogueReferenceLabel(ref)}`;
    if (s.status === "unassigned") return { id: `catalogue:${ref.fingerprint}`, cells: [identity, "Not specified"] };
    const d = s.value, lines = [`${e.kind}; ${s.status.toUpperCase()}${e.syntheticExample ? "; SYNTHETIC EXAMPLE" : ""}`];
    if (d.kind === "material") lines.push(`Engineering stock: ${d.stockMaterialId}; grade: ${d.grade === undefined ? "Not specified" : d.grade === null ? "Not applicable" : d.grade}`, `Nominal stock thickness: ${d.nominalThicknessMm === undefined ? "Not specified" : `${d.nominalThicknessMm} mm`}`, `Stock orientation: ${!d.orientation ? "Not specified" : d.orientation.kind === "non-directional" ? "Non-directional" : `${d.orientation.along.toUpperCase()}; reversal ${d.orientation.reversalAllowed ? "permitted" : "not permitted"}`}`);
    if (d.kind === "edge-treatment") lines.push(`${d.treatmentKind}; specification: ${d.specificationId ?? "Not specified"}`, `Material: ${d.materialId ?? "Not specified"}; nominal treatment thickness: ${d.nominalThicknessMm === undefined ? "Not specified" : `${d.nominalThicknessMm} mm`}`);
    if (d.kind === "finish") lines.push(`Finish specification: ${d.specificationId}`);
    lines.push(`Appearance: ${d.appearance ?? "Not specified"}`, `Manufacturer codes: ${d.manufacturerCodes.map(c => `${c.manufacturerId}=${c.code}`).join("; ") || "Not specified"}`, `Supplier codes: ${d.supplierCodes.map(c => `${c.supplierId}=${c.code}`).join("; ") || "Not specified"}`);
    if (d.kind !== "material") lines.push(`Process: ${d.process ? `${d.process.specificationId}${d.process.notes.length ? `; ${d.process.notes.join("; ")}` : ""}` : "Not specified"}`);
    lines.push(s.status === "verified" ? `Supplied evidence: ${s.verification.evidenceRefs.join("; ")}; reviewer ${s.verification.reviewedBy}. Consistency record only.` : s.reason, "Applying this definition does not approve a panel, finished size or purchasing instruction.");
    return { id: `catalogue:${ref.fingerprint}`, cells: [identity, lines.join("\n")] };
  });
}
