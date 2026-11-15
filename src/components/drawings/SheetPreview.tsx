import type { DrawingDocument, DrawingSheet } from "../../drawings";
import { plotSheet } from "../../drawings";

export default function SheetPreview({ document, sheet }: { document: DrawingDocument; sheet: DrawingSheet }) {
  return (
    <svg role="img" aria-label={`${sheet.metadata.drawingNumber}: ${sheet.metadata.subject}`} viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full bg-white text-black">
      <title>{`${sheet.metadata.subject} — preliminary, not for manufacture`}</title>
      {plotSheet(document, sheet).map((e, i) => e.kind === "line" ? (
        <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke="currentColor" strokeWidth={e.width} data-source-id={e.sourceId} />
      ) : e.kind === "polygon" ? (
        <polygon key={i} points={e.points.map(p => `${p.x},${p.y}`).join(" ")} fill="currentColor" />
      ) : (
        <text key={i} x={e.at.x} y={e.at.y} fontFamily="Arial, Helvetica, sans-serif" fontSize={e.size} fontWeight={e.bold ? 700 : 400} textAnchor={e.align === "middle" ? "middle" : "start"} transform={e.rotation ? `rotate(${e.rotation} ${e.at.x} ${e.at.y})` : undefined} fill="currentColor">{e.text}</text>
      ))}
    </svg>
  );
}
