# Furniture drawing package — through Phase 5C.1

**Phase 5C.1 update:** [Semantic component dimensioning](component-dimensioning.md) now resolves length/width/thickness for every rectangular panel occurrence, with grouped traceability, collision-checked placement and linked normal-to-face thickness notes. GA/assembly semantics, profiles and source engineering/BOM remain unchanged.

**Phase 5B.2 update:** [Exploded assembly and subassembly drawings](assembly-drawings.md) now add EA/DS/CS sheets, scoped assembly callouts and profile-v3 migration. Current built-in A3 defaults have nine sheets; the six-sheet/panel-callout descriptions below document the earlier presentation, retained by migrated v1/v2 profiles and legacy options. Geometry, all 29 panels, four GA dimensions and false release/compliance flags are preserved.

The `/furniture` page provides a **2D drawings** section with a browser sheet preview and a complete vector PDF download. Phase 4B extends the Phase 4A foundation to every physical panel and adds a reconciled component schedule and nominal cutting list. The drawing module `src/drawings` is independent of React, Three.js and the UI. Its sole geometry input is the validated, closed `FurnitureResult`. Drawer opening, explosion, selection and visibility do not alter drawings. No furniture-engine formulas, BOM calculations, contact validation or approval logic were changed.

Phase 4C.1 adds [versioned drawing profiles and local Drawing Settings](drawing-profiles.md) around this same generator. The six-sheet package below remains the Workshop default. Profiles can hide/reorder optional output, select sheet size/projections, and add company/title-block metadata without weakening internal reconciliation. Hardware schedules now explicitly distinguish demonstration allowances from approved purchasing items; none are approved in this phase.

Phase 4C.2 adds [stable item numbers, visibility-checked balloons and a compact assembly parts list](drawing-annotations.md). Workshop/Engineering profile v2 defaults use those annotations; old profile v1 settings migrate with them off. Four concealed panel groups remain explicitly unballooned; all 29 panels remain listed. Small/overflowing layouts move the list to adjacent AP sheets.

Phase 5B adds a [revision-bound semantic GA plan](general-assembly-planning.md). Current A3 defaults use a large **1:10 isometric primary**, with aligned **1:20 supporting orthographic views** and a compact list in the spare supporting-grid region. Both projection conventions, templates and legacy settings remain supported. Plan validation guards shared preview/PDF rendering, and input changes during asynchronous export cancel the stale download. Hidden supporting views report missing nominal GA dimension coverage. Earlier equal-cell layout/scales are superseded; geometry, component sheets and schedules remain unchanged.

[Phase 5B.1](isometric-visibility.md) replaces the transparent isometric with analytic solid-panel edge clipping, shared by browser SVG and vector PDF. Clean edges are the default; Drawing diagnostics offers an explicitly labelled transparent wireframe. Visible drawer separations and panel seams remain, and balloon attachments are rechecked against clipped geometry.

## Generated sheets

The initial UI format is **A3 landscape, 420 × 297 mm**:

1. **DRF-CD-GA-001 — General assembly:** large labelled hidden-line-removed parallel isometric primary at **1:10**, with front, top and right-side supporting orthographic views sharing **1:20** for the reference model.
2. **DRF-CD-CP-001 — Carcass components:** face projections of the top/base blank (quantity 2, 900 × 500 × 18 mm), side blank (quantity 2, 814 × 500 × 18 mm), and recessed back (quantity 1, 864 × 814 × 6 mm).
3. **DRF-CD-CP-002 — Panel components:** drawer bottoms (quantity 4, 838.6 × 400 × 6 mm), drawer sides (quantity 8, 400 × 124 × 12 mm), and box fronts/rears (quantity 8, 814.6 × 124 × 12 mm).
4. **DRF-CD-CP-003 — Panel components:** all four decorative fronts (quantity 4, 896 × 209.25 × 18 mm).
5. **DRF-CD-CL-001 — Component schedule / nominal cutting list:** the seven panel blank groups, with descriptions, quantities, cut length/width/thickness, material IDs, BOM IDs and every unique component ID.
6. **DRF-CD-HW-001 — UNVERIFIED hardware allowances:** all existing hardware IDs, descriptions, quantities and component IDs, including 160 generic screws, eight brackets and eight single-side runner allowances. Hardware cut sizes are explicitly unspecified. These allowance quantities are excluded from approved purchasing totals.

All **29 physical panels** are represented exactly once in component details and the cutting list. Identical blanks use the engine's existing BOM grouping, including a group shared across different assembly roles if the engine produces one. Each view retains all component/assembly/BOM references; full part IDs are printed in the schedule rather than shortened or crowded beneath a drawing. Ordinary material IDs appear beneath component views; identifiers longer than 40 characters are printed in full in the schedule. Face flattening does not specify grain direction, cutting orientation, edge banding, tolerances or cutting allowances. Long schedules continue across additional numbered sheets with repeated column headings and explicit continuation rows; quantities appear once per BOM row, not once per continuation.

The reference GA dimensions are **900 mm overall width, 850 mm overall height, 518 mm overall closed depth**, and **500 mm carcass depth**. The extra 18 mm in overall depth is the existing decorative-front projection from Z = −18 to 0; the carcass extends from Z = 0 to 500. The overall-depth dimension uses actual front/rear component corners for its extension-line anchors. Dimension values come from source bounding coordinates and stay independent of plotted scale.

## Models, projection and layout

`types.ts` defines a drawing document with source engineering revision, template/convention, sheet metadata, numbered sheets, viewport rectangles, exact model-space line entities, dimensions, annotations, component/assembly/BOM references, model-to-paper scale and origin. Phase 4B also exposes `componentSchedule`, its panel-only `cuttingList`, the `reconciliation` report, and paginated paper-space tables. Schedule records copy the engine BOM without changing dimensions, grouping or quantities. Drawing revision, drawing number and engineering source revision are separate fields. The engineering source revision is retained in the document model; it is not an approval, persistence system or release signature. Metadata fields are non-empty and limited to 60 characters. Full values stay in the model; long title-block values are abbreviated to protect field boundaries.

`projections.ts` uses the engine's global coordinates directly. For model point (X,Y,Z), the explicit 2D drawing bases are:

- Front: (X,Y), with X right and Y up.
- Top: (X,Z), with rearward +Z towards the top of the drawing.
- Right side: (Z,Y), with the front at the left and rear to the right.
- Parallel isometric: u = (X+Z)/√2, v = (−X+2Y+Z)/√6. This is linear, with equal √(2/3) axis foreshortening; there is no perspective division or screenshot substitution.

Orthographic visible outlines are computed from axis-aligned panel face rectangles. Foreground face depth is min Z for front, max Y for top and max X for right side. Interval clipping removes edge fragments behind a nearer projected face; coincident fragments retain their component references. Coplanar panel seams may remain visible. This is an axis-aligned rectangular-panel visibility method, not a general B-rep hidden-line solver. It does not draw hidden machining/fastener geometry.

The isometric viewport now uses **solid-panel hidden-line removal** for the current axis-aligned engineering boxes. It clips actual edges continuously against every opaque panel, retains visible component seams and uses a deterministic parallel camera. [Algorithm and limits](isometric-visibility.md) include numerical contact handling, supported solids and unresolved future geometry types. An optional diagnostic wireframe is explicitly labelled as including hidden edges.

`generate.ts` applies first-/third-angle placement consistently without changing each named view's geometry:

- Third-angle: top above front; right-side view to the right of front.
- First-angle: top below front; right-side view to the left of front.

Front/top share a horizontal model-to-paper alignment; front/right share a vertical alignment and plotted scale. Phase 5B gives isometric its own large primary region; the supporting grid's spare cell can hold the compact list. The chosen convention appears textually in the title block. A normative projection symbol is **not** asserted or invented.

Model-space entities remain in millimetres at **1:1 model coordinates**. Automatic fitting chooses a uniform reduction from a supported scale series (1:1, 1:2, 1:2.5, 1:5 and decimal reductions). The model-to-sheet mapping is paperX = originX + modelX × scale; paperY = originY − modelY × scale. There is no separate X/Y stretch, dimension rescaling or modification of the source parts. Numeric labels display up to six fractional digits, removing trailing zeros; underlying numeric values and coordinates are retained.

Sheet catalogue entries and layout functions also cover landscape A4 (297 × 210), A2 (594 × 420) and A1 (841 × 594). Both projection placements are tested for fitting those formats. A3 remains the default; Phase 4C.1 exposes all four formats in Drawing Settings. Catalogue support is not a claim that the borders, title block or layout satisfy a sheet-layout standard.

`layout.ts` reserves heading and annotation bands before fitting geometry and dimensions. Component sheets use at most three columns, reduced to two for A4; additional groups paginate. Text wraps using a conservative one-em character width shared by the SVG/PDF presentation. Annotation lines are retained in full. Schedule cells wrap independently, including unbroken material identifiers; rows taller than a page split into continuation fragments. This is deterministic layout for the supported rectangular-panel drawings, not a general annotation-placement solver for arbitrary future machining features.

## SVG and vector PDF

`plot.ts` converts the model into reusable **paper-mm** primitives: geometry lines, extension lines, dimension lines, filled arrowheads, text, borders and title-block cells. Dimensions retain exact values/references; their line offsets, arrowhead sizes, font sizes and stroke weights are paper-space presentation defaults. Font/line/arrow choices are not verified BS/ISO requirements.

The browser SVG and `pdf.ts` use those same primitives. PDF pages use **72/25.4 points per millimetre** with the PDF Y-axis conversion handled only in the exporter. Lines, arrowheads and labels remain vector graphics/text; no canvas or screenshot is embedded. `pdf-lib` is loaded only when export is requested. Standard Helvetica fonts support the normal drawing labels and Latin/WinAnsi text; unsupported non-Latin metadata characters are replaced with `?` in PDF. Browser SVG can display broader text, so this font limitation must be resolved before multilingual production documentation.

Every title block includes project, assembly/component subject, drawing number, revision, units, scale, projection convention, sheet number/total, sheet format and **PRELIMINARY — NOT FOR MANUFACTURE** status. The project name and revision are editable; template and convention selectors do not change engineering geometry. The exported PDF contains all generated sheets, regardless of the currently previewed sheet.

Printing must use **Actual size / 100% on the stated sheet size**. Browser display scaling and print-dialog “fit to page” do not preserve physical plotted scale. Software tests verify PDF MediaBoxes and decoded vector coordinates, not a particular printer's mechanical accuracy.

## Templates and standards position

- **Furniture Workshop** is the default preliminary workshop presentation.
- **BS 8888 / ISO-style — compliance not yet verified** is a formal monochrome presentation. It uses the same geometry/dimension model, with different presentation defaults and explicit unverified labelling.

The applicable candidate is **BS 8888:2025**. BSI's public catalogue identifies that edition, but the licensed standard and its referenced ISO requirements have **not** been individually verified. These templates do not certify full compliance, prescribe a jurisdictional projection preference, or make the design manufacturing-ready. `complianceVerified` and `manufacturingReady` are literal false in the drawing model. No unverified tolerances, finishes, datum systems, GD&T, hole patterns, joints, surface requirements or manufacturing annotations are introduced.

Public orientation references used for implementation context (not substitutes for licensed requirements):

- [BSI: current BS 8888 edition](https://landingpage.bsigroup.com/LandingPage/Undated?UPI=000000000030384746)
- [Autodesk: first-/third-angle top-view placement](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-Core/files/GUID-78FCF96E-2FB2-4A5C-88C8-264647D980C5.htm)
- [Autodesk example: first-angle front, side and top placement](https://files.upskill-dev.autodesk.com/public/aex/HaasF360/C1-Blueprints_CAD_CAM_CNC/pdf/221215_SbS_S1-M1-01_Blueprint-view-proj.pdf)
- [MIT: orthographic and multiview drawing](https://ocw.mit.edu/courses/2-007-design-and-manufacturing-i-spring-2009/pages/related-resources/drawing_and_sketching/)

Before any compliance claim, an authorised review must check individual applicable requirements against licensed standards: view conventions/symbols, dimension presentation, scales, lettering, line conventions, sheet/title-block requirements and documentation/revision controls. No clause numbers or verified symbols are fabricated here.

## Validation, tests and limits

Invalid source geometry, non-finite panel bounds, unsupported drawing settings or invalid metadata withhold the document and disable export without disrupting the 3D interface. `reconcileDrawingParts` in `reconcile.ts` additionally checks every engine component against its BOM membership, kind, material/hardware ID, quantity and description. For every panel member, including nonrepresentative members of a grouped blank, it checks both face edges and thickness against the BOM and verifies the thickness-axis extent. It detects missing/unknown IDs, repeated membership and duplicate component/BOM IDs. The generated schedule and component-view coverage/dimensions are independently checked against that BOM before returning the document. All detected reconciliation issues are reported with implicated IDs; missing, duplicate or mismatched parts withhold the whole package. This checks the supplied engine result rather than regenerating an assembly or validating a new manufacturing specification.

No stale valid sheet is substituted beside invalid parameters. Every sheet derives from the current engine result, so parameter/count changes regenerate drawer and carcass details, schedule IDs, quantities and pagination. The UI reports reconciled panel/blank/component counts. `manufacturingReady` and `complianceVerified` remain false; PDF export also requires a valid reconciliation report.

Tests cover exact reference dimensions; asymmetric orientation markers; parallel isometric behaviour; first-/third-angle placement/alignment; full/partial orthographic occlusion; panel/BOM identity and quantities; common-scale fitting; dimension/extension lines and arrowheads; page/viewport boundaries across A4/A3/A2/A1; source immutability; dimension changes; template compliance labels; and PDF page sizes plus a decoded vector dimension-line length. Phase 4B regressions in `tests/drawingPackage.test.ts` cover all drawer roles and 29 unique panel IDs, all seven blank sizes, complete hardware coverage, nonrepresentative-member corruption, missing/duplicate/mismatched parts, independent schedule/view reconciliation, counts of 1/3/8/12/64 drawers, changed stock thicknesses and back gap, groups shared across assembly roles, continuation quantities and full IDs, long material identifiers, and conservative text/dimension extents versus reserved bands/cells across both templates and all formats. PDF tests also check that unique drawer IDs are present as selectable vector text. The existing test runner discovers the additional test file automatically and uses temporary CJS output; no dependencies or runner changes are needed.

Historical Phase 4A Chrome verification covered its two SVG sheets, formal/workshop and first-/third-angle selection, unchanged drawings during exploded 3D poses, parameter updates, invalid withholding, mobile overflow, and a downloaded two-page A3 PDF. Those historical checks do not represent browser verification of the expanded Phase 4B package. The 3D viewer, movements, explosion, inspector and BOM retain their own state and functionality.

Phase 4B verification (16 November 2026): **199 tests passed** (the original 164 plus 35 package regressions), `npx tsc --noEmit` passed, `npm run lint` passed, and `npm run build -- --webpack` passed with both `/` and `/furniture` prerendered. The default `npm run build` was attempted but Turbopack's CSS worker could not bind a local port under the execution restrictions, including after an escalated retry. The Webpack production build required no configuration or dependency changes. Starting a local preview server was also denied (`listen EPERM`); Phase 4B browser interaction checks remain outstanding. Automated SVG/PDF primitive bounds, schedule completeness and vector PDF content were verified by the tests.

Phase 4C.1 extends verification to **234 tests** plus Chrome interaction checks of the configured drawing UI, local preferences and PDF download. See [profile verification and limitations](drawing-profiles.md#regression-coverage). The default Turbopack port restriction remains; Webpack production builds pass.

Phase 4B completes preliminary rectangular panel coverage and the nominal parts schedules. Sections, arbitrary-solid hidden-line support, fixation/drilling geometry, supplier-specific hardware, material grades, edge treatments, grain decisions, nesting, tolerancing, manufacturing instructions/approval and authenticated document control remain outside this package. It is not a production release. **DXF/DWG, STEP and CNC export have not been implemented.** Resolve the known drawing/standards limitations before extending export formats or claiming compliance.
