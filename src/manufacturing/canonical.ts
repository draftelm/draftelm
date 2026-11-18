/** Portable, collision-free canonical JSON fingerprints, following the engine's
 * revision convention. Not compact hashes, part numbers or security signatures. */
export function manufacturingFingerprint(value: unknown): string {
  const visit = (v: unknown): unknown => {
    if (v && typeof v === "object" && Object.getOwnPropertySymbols(v).length) throw new Error("Symbol keys are not manufacturing JSON data.");
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return Object.is(v, -0) ? 0 : v;
    if (Array.isArray(v)) {
      if (Object.keys(v).length !== v.length || !Array.from({ length: v.length }, (_, i) => Object.prototype.hasOwnProperty.call(v, i)).every(Boolean)) throw new Error("Sparse or extended arrays are not manufacturing JSON data.");
      return v.map(visit);
    }
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, child]) => [k, visit(child)]));
    throw new Error("Manufacturing data must contain finite plain JSON values only.");
  };
  return JSON.stringify(visit(value));
}

export const compareManufacturingText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
