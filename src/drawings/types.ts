import type { BOMLine, Vector3 } from "../furniture";
import type { GADimensionId, GeneralAssemblyPlan } from "./planning/types";
import type { ComponentDimensionCoverage, ComponentDimensionId, ComponentDimensionLayout, ComponentDimensionPlan, DimensionPlacement, LinkedThicknessDimension } from "./planning/componentTypes";
import type { FunctionalDimensionCoverage, FunctionalDimensionId, FunctionalDimensionPlacement, FunctionalDimensionPlan } from "./planning/functionalTypes";
export interface Point2 { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Bounds2 { min: Point2; max: Point2 }
export type Projection = "front" | "top" | "right" | "isometric";
export type ProjectionConvention = "first-angle" | "third-angle";
export type DrawingTemplate = "workshop" | "engineering";
export type SheetFormat = "A4" | "A3" | "A2" | "A1";
export type IsometricMode = "visible-edges" | "diagnostic-wireframe";
export interface TitleBlockField { label: string; value: string }
/** Presentation only. Reserved extension IDs are inert references, never markup or URLs. */
export interface DrawingProfile {
  schemaVersion: 3; id: string; name: string; template: DrawingTemplate;
  sheet: { format: SheetFormat; projectionConvention: ProjectionConvention; isometricMode?: IsometricMode };
  contents: {
    assemblyViews: Projection[]; componentDrawings: boolean;
    cuttingList: { include: boolean; placement: "before-components" | "after-components" };
    hardwareSchedule: boolean;
    assemblySheets: { exploded: boolean; drawers: boolean; carcass: boolean };
    /** Omitted on saved older profiles: preserve their previous sheet selection. */
    functionalDimensions?: boolean;
    contextualSections?: boolean;
    /** Absent saved profiles preserve isolated-edge output; current defaults use context. */
    functionalPresentation?: "contextual" | "isolated-edges";
    /** Generated binding: a manufacturing input is required at render/export. */
    panelManufacturing?: boolean;
  };
  titleBlock: { projectName: string; companyName?: string; additionalFields: TitleBlockField[] };
  numbering: { prefix: string; revision: string; scheme: "by-sheet-kind" | "sequential"; startAt: number };
  /** No profile can turn demonstration allowances into approved purchasing quantities. */
  hardwarePurchasing: "approved-only";
  /** Bounded company presentation overrides; no engineering or approval data. */
  presentation?: { lineWeights?: Partial<Record<import("./style").StrokeRole, number>> };
  annotations: { balloons: boolean; assemblyPartsList: boolean;
    gaLevel: "panels" | "assemblies";
    balloonDisplay: "one-per-item" | "visible-occurrences"; itemNumberStyle: "numeric" | "prefixed" };
  extensions: {
    branding?: { logoAssetId?: string; borderTemplateId?: string; importedTemplateId?: string };
    materials?: { annotationProfileId?: string };
    machining?: { annotationProfileId?: string };
  };
}
export type DrawingProfileV2 = Omit<DrawingProfile, "schemaVersion" | "contents" | "annotations"> & {
  schemaVersion: 2; contents: Omit<DrawingProfile["contents"], "assemblySheets" | "functionalDimensions" | "contextualSections" | "functionalPresentation">;
  annotations: Omit<DrawingProfile["annotations"], "gaLevel">;
};
export type DrawingProfileV1 = Omit<DrawingProfileV2, "schemaVersion" | "annotations"> & { schemaVersion: 1 };
export interface ComponentReference { componentId: string; assemblyId: string; bomId?: string }
export interface DrawingLine {
  kind: "line"; id: string; from: Point2; to: Point2;
  references: ComponentReference[];
  sectionRole?: "cut" | "projected";
  strokeRole?: import("./style").StrokeRole;
}
export interface DrawingDimension {
  id: string; from: Point2; to: Point2; axis: "horizontal" | "vertical";
  valueMm: number; prefix?: string; offsetPaperMm: number; references: ComponentReference[];
  semanticDimensionId?: GADimensionId | ComponentDimensionId | FunctionalDimensionId;
  equivalentDimensionIds?: ComponentDimensionId[];
  equivalentFunctionalDimensionIds?: FunctionalDimensionId[];
  placement?: DimensionPlacement;
}
export interface DrawingViewport {
  id: string; label: string; projection: Projection | "panel-face";
  /** Exact projected model-space geometry, millimetres, +Y up. */
  entities: DrawingLine[]; dimensions: DrawingDimension[]; bounds: Bounds2;
  /** Sheet coordinates in mm, origin top-left, +Y down. */
  frame: Rect; origin: Point2; scale: number; scaleLabel: string;
  annotations: string[]; references: ComponentReference[];
  /** Paper margin reserved for balloon rails; independent of model dimensions. */
  balloonMargin?: number;
  semanticViewId?: string;
  /** Presentation translations in engine millimetres; source panels stay immutable. */
  presentationOffsets?: Record<string, Vector3>;
  role?: "primary" | "supporting";
  thicknessDimension?: LinkedThicknessDimension;
  componentDimensionLayout?: ComponentDimensionLayout;
  functionalDimension?: FunctionalDimensionPlacement;
  functionalContext?: import("./planning/functionalContextTypes").FunctionalContextViewportData;
  sectionData?: import("./planning/sectionTypes").SectionViewportData;
  sectionMarkers?: import("./planning/sectionTypes").SectionReferenceMarker[];
  manufacturingComponentId?: string;
  manufacturingInk?: PlotEntity[];
  referenceLabels?: { sourceId: string; text: string; at: Point2; references: ComponentReference[] }[];
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
  manufacturingComponentId?: string;
  manufacturingTable?: DrawingTable;
  balloons?: PlacedComponentBalloon[];
  assemblyPartsList?: PlacedAssemblyPartsList;
  annotationModel?: ScopedDrawingAnnotationModel;
  assemblyScope?: { kind: "general" | "exploded" | "drawer" | "carcass"; assemblyIds: string[]; representativeId: string };
  assemblyDiagnostics?: { code: "projected-overlap" | "concealed-panel"; componentIds: string[]; message: string }[];
}
/** Copies existing BOM data; lengths are nominal blanks, without cutting allowances. */
export interface DrawingScheduleRow {
  bomId: string; kind: BOMLine["kind"]; description: string; partNames: string[];
  componentIds: string[]; quantity: number; itemId: string; cutSize?: BOMLine["cutSize"];
  drawingItemLabel?: string;
}
/** Semantic identities and relationships, independent of paper layout or styling. */
export interface DrawingAssemblyItem {
  key: string; number: number; label: string; bomId: string; kind: "panel";
  componentIds: string[]; description: string; quantity: number; materialId: string;
  cuttingListBomId: string;
  references: ComponentReference[];
  /** Scoped list reference text, derived from the source BOM and nominal blank. */
  scopeDetails?: string;
}
/** A subassembly occurrence/group is never a manufactured panel or a BOM blank. */
export interface DrawingAssemblyGroupItem extends Omit<DrawingAssemblyItem, "kind" | "bomId" | "materialId" | "cuttingListBomId"> {
  kind: "assembly"; assemblyIds: string[]; bomIds: string[];
}
export type DrawingScopeItem = DrawingAssemblyItem | DrawingAssemblyGroupItem;
export interface ComponentBalloonAnnotation {
  kind: "component-balloon"; id: string; itemKey: string;
  componentIds: string[]; scope: "group-representative" | "occurrence" | "assembly-occurrence";
}
export interface DrawingAttachmentAnchor {
  kind: "panel-edge"; id: string; viewportId: string; sourceLineId: string;
  /** Points are in the viewport's presentation scene; invert its recorded
   * translation to recover engine coordinates. They are not machining anchors. */
  reference: ComponentReference; point: Vector3; edgeStart: Vector3; edgeEnd: Vector3;
  visibility: "verified-visible";
}
export interface DrawingLeaderAnnotation {
  kind: "leader"; id: string; balloonId: string; anchorId: string;
}
export interface AssemblyPartsListAnnotation {
  kind: "assembly-parts-list"; id: string; scope: "panels" | "assemblies" | "mixed"; itemKeys: string[];
}
export type DrawingSemanticAnnotation = ComponentBalloonAnnotation | DrawingLeaderAnnotation | AssemblyPartsListAnnotation;
export interface DrawingAnnotationDiagnostic {
  code: "no-visible-edge" | "layout-full" | "assembly-views-hidden" | "parts-list-moved";
  annotationId: string; itemKey?: string; componentIds: string[]; message: string;
}
export interface DrawingAnnotationModel {
  schemaVersion: 1; groupingPolicy: "bom-membership-v1";
  items: DrawingAssemblyItem[]; balloons: ComponentBalloonAnnotation[];
  anchors: DrawingAttachmentAnchor[]; leaders: DrawingLeaderAnnotation[];
  partsList: AssemblyPartsListAnnotation; diagnostics: DrawingAnnotationDiagnostic[];
}
export interface ScopedDrawingAnnotationModel extends Omit<DrawingAnnotationModel, "groupingPolicy" | "items"> {
  groupingPolicy: "assembly-scope-v1"; scopeId: string; items: DrawingScopeItem[];
}
export type AnyDrawingAnnotationModel = DrawingAnnotationModel | ScopedDrawingAnnotationModel;
/** Paper-space placements refer back to the semantic entities. */
export interface PlacedComponentBalloon {
  annotationId: string; anchorId: string; leaderId: string; viewportId: string;
  center: Point2; leaderPoints: Point2[];
}
export interface PlacedAssemblyPartsList {
  annotationId: string; frame: Rect; columns: { label: string; width: number }[];
  rows: { itemKey: string; continuation: boolean; cells: string[][]; height: number }[];
  fontSize: number; lineHeight: number; titleHeight: number; headerHeight: number;
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
  drawingAnnotations: DrawingAnnotationModel;
  gaPlan: GeneralAssemblyPlan;
  assemblyPlan: import("./planning/assemblies").AssemblyDrawingPlan;
  componentDimensionPlan: ComponentDimensionPlan;
  componentDimensionCoverage: ComponentDimensionCoverage;
  functionalDimensionPlan: FunctionalDimensionPlan;
  functionalDimensionCoverage: FunctionalDimensionCoverage;
  functionalContextPlan: import("./planning/functionalContextTypes").FunctionalContextPlan | null;
  functionalContextPresentation: import("./planning/functionalContextTypes").FunctionalContextPresentation | null;
  contextualSectionPlan: import("./planning/sectionTypes").ContextualSectionPlan;
  sectionPresentation: import("./planning/sectionTypes").SectionPresentation | null;
  manufacturing?: import("./manufacturing").ManufacturingDrawingBinding;
  profile: DrawingProfile;
  compositionReport: import("./composition").CompositionReport;
  output: {
    assemblyViews: Projection[]; componentDrawings: boolean; cuttingList: boolean;
    hardwareSchedule: boolean; omittedSections: string[];
    assemblySheets: DrawingProfile["contents"]["assemblySheets"];
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
  | { kind: "line"; from: Point2; to: Point2; width: number; role: "geometry" | "dimension" | "sheet" | "annotation" | "hatch"; strokeRole?: import("./style").StrokeRole; dash?: number[]; sourceId?: string; references?: ComponentReference[] }
  | { kind: "polygon"; points: Point2[]; sourceId?: string; references?: ComponentReference[] }
  | { kind: "circle"; center: Point2; radius: number; width: number; filled?: boolean; sourceId?: string; references?: ComponentReference[] }
  | { kind: "text"; at: Point2; text: string; size: number; rotation?: number; align?: "start" | "middle"; bold?: boolean; sourceId?: string; references?: ComponentReference[] };
export interface Bounds3 { min: Vector3; max: Vector3 }
