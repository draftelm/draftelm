import type { FurnitureComponent, FurnitureIssue, FurnitureSpecification } from "./types";
import { calculateDrawerLayout } from "./layout";
import { getFurnitureRevision } from "./revision";

export const GEOMETRY_TOLERANCE_MM = 1e-6;
export const verificationAreas = ["materials", "carcassJoinery", "backFixing", "drawerConstruction", "runners", "frontFixing", "loadAndStability"] as const;

export function validateFurnitureSpecification(s: FurnitureSpecification): FurnitureIssue[] {
  const issues: FurnitureIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, severity: "error", message });
  function numeric(value: unknown, path: string) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) error("invalid-number", `${path} must be finite and non-negative.`);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) numeric(child, `${path}.${key}`);
  }
  numeric(s, "specification");
  const { width: w, height: h, depth: d } = s.dimensions;
  const t = s.panels.carcass.thickness;
  const b = s.construction.back, box = s.construction.drawer, f = s.construction.fronts, r = s.hardware.runner;
  const supported = s.schemaVersion === 2 && s.units === "mm" && s.family === "drawer-chest" &&
    s.construction.carcass === "full-width-top-base" && b.type === "square-cut-inset" && b.fixing === "surface-brackets" &&
    box.joint === "front-rear-between-sides" && box.bottom === "under-box" && box.bottomFixing === "screws-through-bottom" &&
    f.fixing === "screws-from-box" && r.type === "side-mounted-ball-bearing";
  if (!supported) error("unsupported-configuration", "Only schema v2, mm, direct-fixed fronts, butt-jointed boxes with screwed-under bottoms and a bracket-fixed inset back are supported.");
  // Old independent depth settings must not be silently ignored by migrated callers.
  if ("frontSetback" in box || "boxClearance" in f) error("unsupported-configuration", "Remove legacy frontSetback/boxClearance: box front depth is derived from the decorative front rear face.");
  for (const [name, value] of Object.entries({ width: w, height: h, depth: d, boxHeight: box.height, boxDepth: box.depth,
    runnerLength: r.length, runnerWidth: r.envelopeWidth, runnerHeight: r.envelopeHeight,
    attachmentEdgeMargin: f.attachmentEdgeMargin, backMountingEdgeOffset: b.mountingEdgeOffset, backRearInset: b.rearInset })) {
    if (!(value > 0)) error("non-positive-dimension", `${name} must be positive.`);
  }
  const materials = new Set<string>();
  for (const m of s.materials) {
    if (!m.id.trim() || materials.has(m.id) || m.kind !== "sheet") error("invalid-material", "Sheet material IDs must be unique and non-empty.");
    materials.add(m.id);
  }
  for (const [name, stock] of Object.entries(s.panels)) {
    if (!(stock.thickness > 0)) error("invalid-thickness", `${name} thickness must be positive.`);
    if (!materials.has(stock.materialId)) error("unknown-material", `${name} references an unknown material.`);
  }
  for (const [name, value] of Object.entries({ drawerCount: s.drawerCount, carcassScrewsPerJoint: s.construction.carcassScrewsPerJoint,
    bracketCount: b.bracketCount, screwsPerBracket: b.screwsPerBracket, screwsPerCorner: box.screwsPerCorner,
    bottomScrewCount: box.bottomScrewCount, screwsPerFront: f.screwsPerFront, screwsPerMember: r.screwsPerMember })) {
    if (!Number.isSafeInteger(value) || value < 1) error("invalid-count", `${name} must be a positive integer.`);
  }
  if (s.drawerCount > 64) error("unsupported-count", "Phase 1 supports at most 64 drawers in one column.");
  if (b.bracketCount < 4 || b.bracketCount > 64 || b.bracketCount % 4 !== 0 || b.screwsPerBracket < 2) {
    error("back-mounting", "Back brackets must be equally distributed on four edges (4–64, multiple of four), with at least one screw allowance per attachment face.");
  }
  if (box.bottomScrewCount < 4) error("bottom-fixing", "Screwed-under bottom requires at least one fixing allowance per wall (four total); strength and spacing still require approval.");
  for (const id of [r.definitionId, s.hardware.screwId, s.hardware.backBracketId]) if (!id.trim()) error("invalid-hardware", "Hardware identifiers must be non-empty.");
  if (new Set([r.definitionId, s.hardware.screwId, s.hardware.backBracketId]).size !== 3) error("invalid-hardware", "Runner, screw and bracket identifiers must be distinct.");
  if (w <= 2 * t || h <= 2 * t) error("carcass-opening", "Carcass must have positive internal width and height.");
  const backWidth = w - 2 * t - 2 * b.edgeClearance, backHeight = h - 2 * t - 2 * b.edgeClearance;
  if (backWidth <= 0 || backHeight <= 0 || d <= b.rearInset + s.panels.back.thickness) error("back-fit", "Inset back and edge clearances leave no positive panel or usable depth.");
  if (2 * b.mountingEdgeOffset >= Math.min(backWidth, backHeight)) error("back-mounting", "Bracket back-face anchors must fit inside the square-cut back.");
  const boxWidth = w - 2 * t - 2 * r.sideClearance;
  if (boxWidth <= 2 * s.panels.drawerWall.thickness || box.depth <= 2 * s.panels.drawerWall.thickness || box.height <= s.panels.drawerBottom.thickness) error("box-fit", "Drawer walls and bottom leave no positive box interior.");
  if (f.rearFaceSetback + box.depth + box.rearClearance > d - b.rearInset - s.panels.back.thickness + GEOMETRY_TOLERANCE_MM) error("drawer-depth", "Drawer box and rear clearance extend into or behind the back panel.");
  if (Math.abs(r.envelopeWidth - r.sideClearance) > GEOMETRY_TOLERANCE_MM || r.frontOffset + r.length > box.depth + GEOMETRY_TOLERANCE_MM ||
    r.bottomOffset + r.envelopeHeight > box.height + GEOMETRY_TOLERANCE_MM || r.bottomOffset < s.panels.drawerBottom.thickness) {
    error("runner-fit", "Direct side mounting requires runner width to equal side clearance and its envelope to fit the box wall. Packing/alternative mounting is unsupported.");
  }
  for (const [edge, overlay] of Object.entries(f.overlay)) if (overlay > t) error("unsupported-overlay", `${edge} overlay cannot extend beyond the carcass outer edge.`);
  if ((s.drawerCount > 1 && f.verticalGap <= 0) ||
    w - 2 * t + f.overlay.left + f.overlay.right - f.edgeGap.left - f.edgeGap.right <= 0 ||
    h - 2 * t + f.overlay.top + f.overlay.bottom - f.edgeGap.top - f.edgeGap.bottom - (s.drawerCount - 1) * f.verticalGap <= 0) {
    error("front-gap", "Fronts require positive dimensions and a positive gap between adjacent drawers.");
  }
  if (!issues.some(i => i.severity === "error")) {
    for (const row of calculateDrawerLayout(s)) {
      const p = row.box.position, size = row.box.dimensions, front = row.front;
      if (p.y < row.usableBottom + box.bottomClearance - GEOMETRY_TOLERANCE_MM ||
        p.y + size.y > row.usableTop - box.topClearance + GEOMETRY_TOLERANCE_MM) {
        error("slot-fit", `${row.id}: box and vertical clearances must fit its shared front cell and carcass opening.`);
      }
      if (p.x < front.position.x - GEOMETRY_TOLERANCE_MM || p.x + size.x > front.position.x + front.dimensions.x + GEOMETRY_TOLERANCE_MM ||
        p.y < front.position.y - GEOMETRY_TOLERANCE_MM || p.y + size.y > front.position.y + front.dimensions.y + GEOMETRY_TOLERANCE_MM ||
        2 * f.attachmentEdgeMargin >= Math.min(size.x - 2 * s.panels.drawerWall.thickness, size.y - s.panels.drawerBottom.thickness)) {
        error("front-attachment", `${row.id}: front must cover the entire box projection and retain a positive fixing area after attachment-edge margins.`);
      }
    }
  }
  const revision = getFurnitureRevision(s);
  for (const area of verificationAreas) {
    const v = s.verification[area];
    if (!v || v.status !== "verified" || !v.evidence?.trim() || !v.description?.trim() || v.specificationRevision !== revision) {
      issues.push({ code: `unverified:${area}`, severity: "warning", message: `${area}: evidence is missing or does not approve this exact specification/engine revision. ${v?.description || "Verification required"}` });
    }
  }
  return issues;
}

/** All available solids/envelopes participate; schematic anchors have no claimed solid.
 * Required touching relationships are validated separately by validateFurnitureAssembly.
 */
export function validateComponentGeometry(components: FurnitureComponent[]): FurnitureIssue[] {
  const issues: FurnitureIssue[] = [];
  const ids = new Set<string>();
  for (const c of components) {
    if (ids.has(c.id)) issues.push({ code: "duplicate-id", severity: "error", message: `Duplicate component ID ${c.id}.` });
    ids.add(c.id);
    if (!Number.isSafeInteger(c.quantity) || c.quantity < 1 || Object.values(c.position).some(v => !Number.isFinite(v)) ||
      (c.dimensions && Object.values(c.dimensions).some(v => !Number.isFinite(v) || v <= 0)) ||
      (c.kind === "panel" && (!Number.isFinite(c.thickness) || c.thickness <= 0 ||
        Math.abs(c.dimensions[c.thicknessAxis] - c.thickness) > GEOMETRY_TOLERANCE_MM))) {
      issues.push({ code: "invalid-component", severity: "error", message: `Invalid geometry or quantity for ${c.id}.`, componentIds: [c.id] });
    }
  }
  const solids = components.filter(c => c.dimensions);
  for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
    const a = solids[i], b = solids[j];
    if ((["x", "y", "z"] as const).every(axis =>
      Math.min(a.position[axis] + a.dimensions![axis], b.position[axis] + b.dimensions![axis]) -
      Math.max(a.position[axis], b.position[axis]) > GEOMETRY_TOLERANCE_MM)) {
      const code = a.kind === "panel" && b.kind === "panel" ? "panel-overlap" : "hardware-interference";
      issues.push({ code, severity: "error", message: `${a.name} intersects ${b.name}.`, componentIds: [a.id, b.id] });
    }
  }
  return issues;
}
