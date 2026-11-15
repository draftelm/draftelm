# Phase 4A — automatic drawing foundation

The `/furniture` page now provides a **2D drawings** section with a browser sheet preview and a two-page vector PDF download. The drawing module `src/drawings` is independent of React, Three.js and the UI. Its sole geometry input is the validated, closed `FurnitureResult`. Drawer opening, explosion, selection and visibility do not alter drawings. No furniture-engine formulas, BOM calculations, contact validation or approval logic were changed.

## Generated sheets

The initial UI format is **A3 landscape, 420 × 297 mm**:

1. **DRF-CD-GA-001 — General assembly:** front, top and right-side orthographic views, plus a labelled parallel isometric wireframe illustration. The orthographic views share scale **1:10** for the reference model; the wireframe fits at **1:20**.
2. **DRF-CD-CP-001 — Carcass components:** face projections of the top/base blank (quantity 2, 900 × 500 × 18 mm), side blank (quantity 2, 814 × 500 × 18 mm), and recessed back (quantity 1, 864 × 814 × 6 mm). Thickness, material identifiers, source component IDs, and BOM references remain attached to each viewport. Face flattening does not specify grain direction, cutting orientation or edge banding. Future carcasses with more than three unique blanks paginate to additional sheets.

The reference GA dimensions are **900 mm overall width, 850 mm overall height, 518 mm overall closed depth**, and **500 mm carcass depth**. The extra 18 mm in overall depth is the existing decorative-front projection from Z = −18 to 0; the carcass extends from Z = 0 to 500. The overall-depth dimension uses actual front/rear component corners for its extension-line anchors. Dimension values come from source bounding coordinates and stay independent of plotted scale.

## Models, projection and layout

`types.ts` defines a drawing document with source engineering revision, template/convention, sheet metadata, numbered sheets, viewport rectangles, exact model-space line entities, dimensions, annotations, component/assembly/BOM references, model-to-paper scale and origin. Drawing revision, drawing number and engineering source revision are separate fields. The engineering source revision is retained in the document model; it is not an approval, persistence system or release signature. Metadata fields are non-empty and limited to 60 characters. Full values stay in the model; long title-block values are abbreviated to protect field boundaries.

`projections.ts` uses the engine's global coordinates directly. For model point (X,Y,Z), the explicit 2D drawing bases are:

- Front: (X,Y), with X right and Y up.
- Top: (X,Z), with rearward +Z towards the top of the drawing.
- Right side: (Z,Y), with the front at the left and rear to the right.
- Parallel isometric: u = (X+Z)/√2, v = (−X+2Y+Z)/√6. This is linear, with equal √(2/3) axis foreshortening; there is no perspective division or screenshot substitution.

Orthographic visible outlines are computed from axis-aligned panel face rectangles. Foreground face depth is min Z for front, max Y for top and max X for right side. Interval clipping removes edge fragments behind a nearer projected face; coincident fragments retain their component references. Coplanar panel seams may remain visible. This is an axis-aligned rectangular-panel visibility method, not a general B-rep hidden-line solver. It does not draw hidden machining/fastener geometry.

The isometric viewport deliberately shows **all panel edges as wireframe** and is labelled **hidden edges not removed**. It is an explanatory projection, not an occlusion-correct isometric manufacturing view. This avoids presenting a perspective render or an approximate painter-sorted image as an engineering projection.

`generate.ts` applies first-/third-angle placement consistently without changing each named view's geometry:

- Third-angle: top above front; right-side view to the right of front.
- First-angle: top below front; right-side view to the left of front.

Front/top share a horizontal model-to-paper alignment; front/right share a vertical alignment and plotted scale. Isometric sits in the remaining cell at its own declared scale. The chosen convention appears textually in the title block. A normative projection symbol is **not** asserted or invented.

Model-space entities remain in millimetres at **1:1 model coordinates**. Automatic fitting chooses a uniform reduction from a supported scale series (1:1, 1:2, 1:2.5, 1:5 and decimal reductions). The model-to-sheet mapping is paperX = originX + modelX × scale; paperY = originY − modelY × scale. There is no separate X/Y stretch, dimension rescaling or modification of the source parts. Numeric labels display up to six fractional digits, removing trailing zeros; underlying numeric values and coordinates are retained.

Sheet catalogue entries and layout functions also cover landscape A4 (297 × 210), A2 (594 × 420) and A1 (841 × 594). Both projection placements are tested for fitting those formats. Only A3 is exposed as the initial working UI format. Catalogue support is not a claim that the borders, title block or layout satisfy a sheet-layout standard.

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

Invalid source geometry, non-finite panel bounds, missing carcass/BOM coverage, contradictory BOM cut sizes/materials, unsupported drawing settings or invalid metadata withhold the document and disable export without disrupting the 3D interface. No stale valid sheet is substituted beside invalid parameters. All sheets derive from the current engine result, so carcass changes regenerate dimensions and the component sheet automatically.

Tests cover exact reference dimensions; asymmetric orientation markers; parallel isometric behaviour; first-/third-angle placement/alignment; full/partial orthographic occlusion; panel/BOM identity and quantities; common-scale fitting; dimension/extension lines and arrowheads; page/viewport boundaries across A4/A3/A2/A1; source immutability; dimension changes; template compliance labels; and PDF page sizes plus a decoded vector dimension-line length. The test runner adds the project's node_modules to its temporary CJS module resolution so exported-PDF tests can use the installed library without copying dependencies.

Chrome verification covers both SVG sheets, formal/workshop and first-/third-angle selection, unchanged drawings during exploded 3D poses, parameter updates, invalid withholding, mobile overflow, and a downloaded two-page A3 PDF. The 3D viewer, movements, explosion, inspector and BOM retain their own state and functionality.

This foundation omits sections, comprehensive part detailing, hidden-line isometrics, fixation/drilling geometry, nesting, tolerancing, manufacturing approval, and authenticated document control. It is not a complete production drawing pack. **DXF/DWG, STEP, CNC and manufacturing drawings beyond these preliminary sheets have not been implemented.** Resolve the known drawing/standards limitations before extending export formats or claiming compliance.
