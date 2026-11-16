import type { BOMLine, Vector3 } from "../furniture";
export interface Point2 { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Bounds2 { min: Point2; max: Point2 }
export type Projection = "front" | "top" | "right" | "isometric";
export type ProjectionConvention = "first-angle" | "third-angle";
export type DrawingTemplate = "workshop" | "engineering";
export type SheetFormat = "A4" | "A3" | "A2" | "A1";
export interface TitleBlockField { label: string; value: string }
/** Presentation only. Reserved extension IDs are inert references, never markup or URLs. */
export interface DrawingProfile {
  schemaVersion: 1; id: string; name: string; template: DrawingTemplate;
  sheet: { format: SheetFormat; projectionConvention: ProjectionConvention };
  contents: {
    assemblyViews: Projection[]; componentDrawings: boolean;
    cuttingList: { include: boolean; placement: "before-components" | "after-components" };
    hardwareSchedule: boolean;
  };
  titleBlock: { projectName: string; companyName?: string; additionalFields: TitleBlockField[] };
  numbering: { prefix: string; revision: string; scheme: "by-sheet-kind" | "sequential"; startAt: number };
  /** No profile can turn demonstration allowances into approved purchasing quantities. */
  hardwarePurchasing: "approved-only";
  extensions: {
    branding?: { logoAssetId?: string; borderTemplateId?: string; importedTemplateId?: string };
    materials?: { annotationProfileId?: string };
    machining?: { annotationProfileId?: string };
  };
}
export interface ComponentReference { componentId: string; assemblyId: string; bomId?: string }
export interface DrawingLine {
  kind: "line"; id: string; from: Point2; to: Point2;
  references: ComponentReference[];
}
export interface DrawingDimension {
  id: string; from: Point2; to: Point2; axis: "horizontal" | "vertical";
  valueMm: number; prefix?: string; offsetPaperMm: number; references: ComponentReference[];
}
export interface DrawingViewport {
  id: string; label: string; projection: Projection | "panel-face";
  /** Exact projected model-space geometry, millimetres, +Y up. */
  entities: DrawingLine[]; dimensions: DrawingDimension[]; bounds: Bounds2;
  /** Sheet coordinates in mm, origin top-left, +Y down. */
  frame: Rect; origin: Point2; scale: number; scaleLabel: string;
  annotations: string[]; references: ComponentReference[];
}
export interface SheetMetadata {
  projectName: string; subject: string; drawingNumber: string; revision: string;
  units: "mm"; scale: string; number: number; total: number;
  status: "PRELIMINARY - NOT FOR MANUFACTURE";
  companyName?: string; additionalFields?: TitleBlockField[];
}
export interface DrawingSheet {
  id: string; format: SheetFormat; widthMm: number; heightMm: number;
  metadata: SheetMetadata; viewports: DrawingViewport[]; annotations: string[];
  table?: DrawingTable;
}
/** Copies existing BOM data; lengths are nominal blanks, without cutting allowances. */
export interface DrawingScheduleRow {
  bomId: string; kind: BOMLine["kind"]; description: string; partNames: string[];
  componentIds: string[]; quantity: number; itemId: string; cutSize?: BOMLine["cutSize"];
}
export interface DrawingTableRow {
  bomId: string; continuation: boolean; cells: string[][]; height: number;
}
export interface DrawingTable {
  frame: Rect; columns: { label: string; width: number }[];
  rows: DrawingTableRow[]; headerHeight: number; fontSize: number; lineHeight: number;
}
export interface DrawingReconciliationIssue {
  code: "missing" | "duplicate" | "mismatch"; message: string; componentIds: string[]; bomId?: string;
}
export interface DrawingReconciliation {
  valid: boolean; issues: DrawingReconciliationIssue[];
  componentCount: number; panelCount: number; panelQuantity: number;
}
export interface DrawingDocument {
  schemaVersion: 1; specificationRevision: string; template: DrawingTemplate;
  projectionConvention: ProjectionConvention; standardsCandidate: "BS 8888:2025";
  complianceVerified: false; manufacturingReady: false; sheets: DrawingSheet[];
  componentSchedule: DrawingScheduleRow[]; cuttingList: DrawingScheduleRow[];
  reconciliation: DrawingReconciliation;
  profile: DrawingProfile;
  output: {
    assemblyViews: Projection[]; componentDrawings: boolean; cuttingList: boolean;
    hardwareSchedule: boolean; omittedSections: string[];
  };
  hardware: {
    allowances: (DrawingScheduleRow & { verificationStatus: "unverified"; purchasingQuantity: 0; purchasingEligible: false })[];
    approvedPurchasingItems: []; policy: "approved-only";
  };
}
export interface DrawingOptions {
  template: DrawingTemplate; projectionConvention: ProjectionConvention; format: SheetFormat;
  projectName: string; drawingPrefix: string; revision: string;
}
export interface DrawingResult { document: DrawingDocument | null; issues: string[] }
export type PlotEntity =
  | { kind: "line"; from: Point2; to: Point2; width: number; role: "geometry" | "dimension" | "sheet"; sourceId?: string; references?: ComponentReference[] }
  | { kind: "polygon"; points: Point2[] }
  | { kind: "text"; at: Point2; text: string; size: number; rotation?: number; align?: "start" | "middle"; bold?: boolean };
export interface Bounds3 { min: Vector3; max: Vector3 }
