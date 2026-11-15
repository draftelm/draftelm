import type { FurnitureSpecification } from "./types";

/** Bump when engineering formulas/constraints change, even if the input schema does not. */
const ENGINE_REVISION = "drawer-chest-contact-layout-3-zero-gap-back";

/** Collision-free canonical snapshot, not a security signature. Portable to browser/server.
 * Conservative policy: any non-verification specification change invalidates all approvals.
 * Verification text/evidence itself is excluded to avoid circular approval dependencies.
 */
export function getFurnitureRevision(specification: FurnitureSpecification): string {
  const { verification: _verification, ...parameters } = specification;
  void _verification;
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]),
    );
    return value;
  }
  return JSON.stringify(canonical({ engineRevision: ENGINE_REVISION, parameters }));
}
