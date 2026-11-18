import type { FunctionalDimensionPlan, FunctionalDisplayGroup } from "./functionalTypes";
import { VISIBILITY_EPSILON_MM as EPS } from "../edgeVisibility";

/** Recheck full precision against actual source face coordinates before sharing a
 * display. EPS is numerical geometry stability, never a manufacturing tolerance. */
export function verifiedFunctionalGroups(plan: FunctionalDimensionPlan): FunctionalDisplayGroup[] {
  return plan.displayGroups.flatMap(group => {
    const splits: FunctionalDisplayGroup[] = [];
    for (const requestId of group.requestIds) {
      const request = plan.requests.find(r => r.id === requestId)!;
      const d = plan.dimensions.find(d => d.id === request.dimensionId)!;
      const from = plan.faces.find(f => f.id === d.measurement.fromFaceId)!, to = plan.faces.find(f => f.id === d.measurement.toFaceId)!;
      if (from.axis !== to.axis || from.axis !== d.measurement.axis || Math.abs(to.coordinateMm - from.coordinateMm - d.valueMm) > EPS) throw new Error(`Functional grouping contradicts source faces: ${requestId}.`);
      let split = splits.find(s => {
        const representative = plan.dimensions.find(d => d.id === s.dimensionIds[0])!;
        return Math.abs(representative.valueMm - d.valueMm) <= EPS;
      });
      if (!split) { split = { ...group, id: `verified-group:${requestId}`, representativeRequestId: requestId, requestIds: [], dimensionIds: [] }; splits.push(split); }
      split.requestIds.push(requestId); if (!split.dimensionIds.includes(d.id)) split.dimensionIds.push(d.id);
    }
    return splits;
  });
}
