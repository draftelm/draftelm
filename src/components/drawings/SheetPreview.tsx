import type { DrawingDocument, DrawingSheet } from "../../drawings";
import { plotSheet } from "../../drawings";

export default function SheetPreview({ document, sheet }: { document: DrawingDocument; sheet: DrawingSheet }) {
  let primitives;
  try { primitives = plotSheet(document, sheet); }
  catch { return <p role="alert" className="p-4 text-sm text-red-900">Drawing preview withheld: its drawing plans or source references are stale or inconsistent. Regenerate the drawing package.</p>; }
  return (
    <svg role="img" aria-label={`${sheet.metadata.drawingNumber}: ${sheet.metadata.subject}`} data-ga-plan-id={document.gaPlan.id} data-ga-primary={document.gaPlan.policy.selectedPrimary ?? "hidden"} data-component-dimension-plan={document.componentDimensionPlan.id} data-component-dimensions-missing={document.componentDimensionCoverage.missingDimensionIds.length} data-section-plan={document.contextualSectionPlan.id} data-functional-context-placed={document.functionalContextPresentation?.assignments.filter(a => a.state === "placed").length ?? 0} data-context-diagnostics={document.sectionPresentation?.diagnostics.length ?? 0} data-functional-displayed={document.functionalDimensionCoverage.displayedRequestIds.length} data-functional-unplaced={document.functionalDimensionCoverage.unplacedRequestIds.length} viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full bg-white text-black">
      <title>{`${sheet.metadata.subject} — preliminary, not for manufacture`}</title>
      {primitives.map((e, i) => e.kind === "line" ? (
        <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="currentColor" strokeWidth={e.width} strokeDasharray={e.dash?.join(" ")} data-source-id={e.sourceId} />
      ) : e.kind === "polygon" ? (
        <polygon key={i} points={e.points.map(p => `${p.x},${p.y}`).join(" ")} fill="currentColor" data-source-id={e.sourceId} />
      ) : e.kind === "circle" ? (
        <circle key={i} cx={e.center.x} cy={e.center.y} r={e.radius} stroke="currentColor" strokeWidth={e.width} fill={e.filled ? "currentColor" : "none"} data-source-id={e.sourceId} data-component-id={e.references?.[0]?.componentId} />
      ) : (
        <text key={i} x={e.at.x} y={e.at.y} fontFamily="Arial, Helvetica, sans-serif" fontSize={e.size} fontWeight={e.bold ? 700 : 400} textAnchor={e.align === "middle" ? "middle" : "start"} transform={e.rotation ? `rotate(${e.rotation} ${e.at.x} ${e.at.y})` : undefined} fill="currentColor" data-source-id={e.sourceId}>{e.text}</text>
      ))}
    </svg>
  );
}
