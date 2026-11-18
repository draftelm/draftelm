import { generateFurnitureBOM, validateComponentGeometry } from "../src/furniture";
import type { FurnitureResult, PanelComponent } from "../src/furniture";
import { createPanelManufacturingDocument, manufacturingFingerprint, verifiedProperty } from "../src/manufacturing";
import type { EdgeTreatment, FaceRequirements, MaterialSpecification, PanelManufacturingProperties, SurfaceFinish } from "../src/manufacturing";

/** Synthetic only: none of these specifications is assigned to the reference chest. */
export function syntheticPanel(id: string, x = 0): PanelComponent {
  return { id, assemblyId: "synthetic", kind: "panel", name: "Synthetic test panel", quantity: 1, position: { x, y: 0, z: 0 }, dimensions: { x: 500, y: 300, z: 18 }, thickness: 18, thicknessAxis: "z", materialId: "synthetic-stock" };
}
export function syntheticSource(panels = [syntheticPanel("synthetic/a"), syntheticPanel("synthetic/b", 1000)]): FurnitureResult {
  return { specificationRevision: manufacturingFingerprint({ syntheticTestOnly: true, panels }), components: panels, bom: generateFurnitureBOM(panels), assemblies: [{ id: "synthetic", name: "Synthetic tests only", parentId: null, position: { x: 0, y: 0, z: 0 }, componentIds: panels.map(p => p.id) }], issues: [], geometryValid: !validateComponentGeometry(panels).length, assumptionsVerified: false, manufacturingReady: false };
}
export function verify<T>(p: PanelManufacturingProperties, path: string, value: T) {
  return verifiedProperty(p, path, value, { evidenceRefs: ["synthetic-test-evidence-only"], verifiedBy: "synthetic-test-reviewer" });
}
export function syntheticMaterial(p: PanelManufacturingProperties, path: string, stockMaterialId: string): MaterialSpecification {
  return { stockMaterialId, manufacturerCodes: [{ manufacturerId: "synthetic-maker", code: "synthetic-code" }], grade: verify(p, `${path}/grade`, "Synthetic test specification") };
}
export function syntheticFinish(p: PanelManufacturingProperties, faceId: string, specificationId: string): SurfaceFinish {
  const path = `faces/${faceId}/finish`;
  return { kind: "specified", specificationId, manufacturerCodes: [], appearance: verify(p, `${path}/appearance`, "Synthetic appearance only"), process: verify(p, `${path}/process`, null) };
}
export function syntheticTreatment(p: PanelManufacturingProperties, edgeId: string, kind: "edge-band" | "lipping" | "other" = "edge-band"): EdgeTreatment {
  const path = `edges/${edgeId}/treatment`;
  return { kind, specificationId: "synthetic-treatment", material: verify(p, `${path}/material`, syntheticMaterial(p, `${path}/material`, "synthetic-treatment-stock")), nominalThicknessMm: verify(p, `${path}/nominalThicknessMm`, 1), appearance: verify(p, `${path}/appearance`, "Synthetic edge appearance"), process: verify(p, `${path}/process`, { specificationId: "synthetic-process", notes: ["Synthetic fixture only; not a production instruction."] }) };
}
export function verifySyntheticPanel(p: PanelManufacturingProperties) {
  const stockMaterialId = p.material.status === "unassigned" ? "synthetic-stock" : p.material.value.stockMaterialId;
  p.material = verify(p, "material", syntheticMaterial(p, "material", stockMaterialId));
  p.stockOrientation = verify(p, "stockOrientation", { kind: "non-directional" });
  p.grain = verify(p, "grain", { direction: "non-directional" });
  p.grainMatching = verify(p, "grainMatching", { kind: "independent" });
  p.otherRequirements = verify(p, "otherRequirements", []);
  for (const [i, f] of p.faces.entries()) {
    const requirements: FaceRequirements = { decorative: i === 0, reverse: i === 1, visibleInService: i === 0, goodFaceRequirements: [] };
    f.requirements = verify(p, `faces/${f.faceId}/requirements`, requirements);
    f.finish = verify<SurfaceFinish>(p, `faces/${f.faceId}/finish`, { kind: "none" });
  }
  for (const e of p.edges) e.treatment = verify<EdgeTreatment>(p, `edges/${e.edgeId}/treatment`, { kind: "none" });
}
export function fullySpecifiedFixture() {
  const source = syntheticSource(), document = createPanelManufacturingDocument(source); document.panels.forEach(verifySyntheticPanel);
  return { source, document };
}
