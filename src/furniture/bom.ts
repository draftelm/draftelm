import type { BOMLine, FurnitureComponent } from "./types";

/** Group interchangeable rectangular blanks by stock and cut size; retain traceability. */
export function generateFurnitureBOM(components: FurnitureComponent[]): BOMLine[] {
  const lines = new Map<string, BOMLine>();
  for (const c of components) {
    const cutSize = c.kind === "panel" ? (() => {
      const face = (["x", "y", "z"] as const).filter(a => a !== c.thicknessAxis).map(a => c.dimensions[a]);
      return { length: Math.max(...face), width: Math.min(...face), thickness: c.thickness };
    })() : undefined;
    const itemId = c.kind === "panel" ? c.materialId : c.hardwareId;
    const key = JSON.stringify([c.kind, itemId, cutSize]);
    const existing = lines.get(key);
    if (existing) {
      existing.quantity += c.quantity;
      existing.componentIds.push(c.id);
      if (!existing.partNames.includes(c.name)) {
        existing.partNames.push(c.name);
        existing.name = c.kind === "panel" ? "Shared panel blank" : "Shared hardware allowance";
      }
    } else lines.set(key, { id: `bom-${lines.size + 1}`, kind: c.kind, name: c.name, itemId,
      partNames: [c.name], quantity: c.quantity, unit: "piece", componentIds: [c.id], ...(cutSize ? { cutSize } : {}) });
  }
  return [...lines.values()];
}
