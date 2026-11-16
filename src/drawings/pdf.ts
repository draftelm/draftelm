import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { DrawingDocument } from "./types";
import { plotSheet } from "./plot";
export const MM_TO_PT = 72 / 25.4;
/** Built-in fonts have limited character coverage; geometry and numeric values are unaffected. */
export const pdfText = (s: string) => s.replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014]/g, "?");

export async function exportDrawingPDF(document: DrawingDocument): Promise<Uint8Array> {
  if (!document.sheets.length || document.manufacturingReady || document.complianceVerified || !document.reconciliation.valid) throw new Error("Only reconciled preliminary, unverified drawing documents can be exported.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${document.sheets[0].metadata.projectName} - Preliminary furniture drawings`);
  pdf.setSubject("Nominal geometry; BS 8888 / ISO-style compliance not verified; not for manufacture");
  pdf.setCreator("DRAFTELM drawing foundation");
  if (document.profile.titleBlock.companyName) pdf.setAuthor(pdfText(document.profile.titleBlock.companyName));
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const sheet of document.sheets) {
    const page = pdf.addPage([sheet.widthMm * MM_TO_PT, sheet.heightMm * MM_TO_PT]);
    const y = (value: number) => (sheet.heightMm - value) * MM_TO_PT;
    const ink = rgb(0.08, 0.08, 0.08);
    for (const entity of plotSheet(document, sheet)) {
      if (entity.kind === "line") page.drawLine({ start: { x: entity.from.x * MM_TO_PT, y: y(entity.from.y) }, end: { x: entity.to.x * MM_TO_PT, y: y(entity.to.y) }, thickness: entity.width * MM_TO_PT, color: ink });
      else if (entity.kind === "polygon") {
        const path = entity.points.map((p, i) => `${i ? "L" : "M"} ${p.x * MM_TO_PT} ${p.y * MM_TO_PT}`).join(" ") + " Z";
        // drawSvgPath uses SVG's downward Y convention about the supplied PDF origin.
        page.drawSvgPath(path, { x: 0, y: sheet.heightMm * MM_TO_PT, color: ink });
      } else {
        const font = entity.bold ? bold : regular, value = pdfText(entity.text), size = entity.size * MM_TO_PT;
        const advance = entity.align === "middle" ? font.widthOfTextAtSize(value, size) / 2 : 0;
        const angle = -(entity.rotation ?? 0) * Math.PI / 180;
        page.drawText(value, { x: entity.at.x * MM_TO_PT - Math.cos(angle) * advance, y: y(entity.at.y) - Math.sin(angle) * advance, font, size, rotate: degrees(-(entity.rotation ?? 0)), color: ink });
      }
    }
  }
  return pdf.save({ useObjectStreams: false });
}
