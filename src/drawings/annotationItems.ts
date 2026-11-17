import type { DrawingScopeItem } from "./types";

/** Shared list text; every value is resolved before plotting either format. */
export function itemReferenceText(item: DrawingScopeItem): string {
  return item.kind === "panel" ? item.scopeDetails ?? item.materialId : `Assembly (${item.componentIds.length / item.quantity} panels each)`;
}
