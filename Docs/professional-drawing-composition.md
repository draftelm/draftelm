# Professional engineering drawing composition — Phase 5C.2D

Implemented 18 November 2026. Preliminary presentation only: `manufacturingReady` and `complianceVerified` remain false. No commits or pushes are part of this phase.

## Scope and source authority

The existing engineering result, revision, panel coordinates, dimensions, quantities and BOM remain authoritative. Only projected view regions, presentation translations, annotation positions and paper styles change. The reference chest retains 29 panel occurrences, 87 component measurements, 26 displayed core functional requests and 20 explicitly deferred supporting requests. The 160/8/8 hardware allowances remain unverified, with zero approved purchasing quantities. Existing source/profile bindings, stale plan validation and cancellation of exports when live inputs change remain active.

Read alongside the [manufacturing specification](drawing-manufacturing-specification.md), [architecture roadmap](drawing-architecture-roadmap.md), [assembly hierarchy](assembly-drawings.md), [contextual functional mapping](contextual-functional-dimensions.md) and [profiles](drawing-profiles.md).

## Problems corrected and package organisation

The previous composition used fixed 34%/66% assembled/exploded heights, globally expanded every exploded panel for the most difficult pair, placed balloons at viewport margins and packed functional views by their count. These decisions produced small subassembly views, unnecessary separation and long leaders, and separated the front elevation from D/E/F.

The default A3 package remains **12 sheets**. The same two FC sheets now preserve complete related view families:

| Sheet | Content |
| --- | --- |
| GA-001 | Clean closed isometric, aligned convention-specific orthographic views and scoped assembly list |
| EA-001 | Separated carcass panels and rigid drawer groups, with scoped list |
| DS-001 | Assembled and exploded six-panel drawer; quantities per drawer and reuse quantity four |
| CS-001 | Assembled and exploded five-panel carcass and scoped list |
| SC-001 | Top cutting-plane parent, vertical section A-A and enlarged B |
| FC-001 | Closed front with D/E/F; C-C cutting plane points to FC-002 |
| FC-002 | Horizontal section C-C and enlarged I/J |
| CP-001–003 | Existing seven blank groups and all 87 occurrence measurements |
| CL-001 | Existing nominal cutting list |
| HW-001 | Existing excluded, unverified allowances |

A3 D/E/F layouts compare columns with a two-row arrangement on the right of the parent. Actual dimension/marker/note collisions decide eligibility, then enlarged detail scale and projected area decide preference. For the reference width range, D is 1:2.5 and E/F are 1:2, with the closed front 1:10. The 1200 mm case avoids the 1:5 reveals that a narrow column layout would require. Section C-C and I/J are a separate complete family. No semantic dimension is cloned or independently recalculated.

A4 retains readable continuations (19 reference pages); A1 retains collision-tested use of vacant subassembly space. Other dimensions, metadata, visibility selections and sizes can require different compositions or continuations. Saved profiles which omit `functionalPresentation` retain their previous sheet selection, including FD sheets; existing migration does not rewrite preferences. Common fitting, line style and explosion improvements also apply to those older selections.

## Reusable paper composition

`layout.drawingRegion` reserves the 10 mm border, header, sheet notes, title block and all optional title-block rows. GA uses the same lower limit. `viewports.positionViewport` fits uniformly to exact projected bounds and rechecks rendered dimension arrows, rotated text and cutting/detail markers against the heading/note bands. It can move an annotation envelope back into its region or choose a smaller conventional scale. Heading wrapping is re-evaluated at the selected scale. Source/model coordinates are never rounded to fit or stretched.

The established candidate reduction series is retained: 1, 2, 2.5, 5 times powers of ten. These are application choices pending a scoped ISO 5455 review; the supplementary 2.5 series is not presented as a verified preferred-scale table. This phase does not introduce arbitrary scale stretching. The default GA is already limited to 1:10 by its allocated region, so it keeps that scale while becoming more evenly centred with balloons nearer the assembly.

Assembly composers compare stacked views, a full-height view alongside the list, and use of the actual vacant area below a list. Scoring considers both projected areas and penalises an assembled view more than twice the exploded scale. The reference drawer now uses **1:10 assembled / 1:10 exploded**, previously 1:20/1:20. The carcass uses **1:10 assembled / 1:20 exploded**, previously 1:25/1:25. Root explosion remains 1:20, the largest fitting scale from the current reduction series. Lettering stays at paper size; the table does not shrink to gain space. Large sheets preserve useful vacant slots for contextual views.

## Physical explosion and balloon placement

`planning/explosion` constructs convex silhouettes from all eight physical corners of every panel box. For each outward thickness-axis direction, separating-axis tests determine forbidden translation intervals against previously placed panels. The solver jumps to the nearest clear interval instead of uniformly increasing every displacement. Twelve deterministic orderings are compared for a compact, balanced projected envelope. A 25 model-mm illustrative separation is a display parameter, not a manufacturing gap. It is not a fixed paper clearance across all scales.

Front, rear and side panels move outward along their thickness axes; bottom panels move down. The decorative front and drawer box front remain distinct. Geometry is neither rotated nor resized. The root uses the assembly hierarchy: carcass panels separate, while all six panels in each drawer share one rigid translation. Drawer order follows physical height. IDs, references, reuse mappings and per-scope quantities are retained.

The four existing root diagnostics were investigated: each is the box-front panel concealed behind the separate decorative front within one rigid drawer. There are no residual separated-panel overlap diagnostics in the reference subassemblies. The four concealment diagnostics remain explicit; the drawer sheet exposes all six constituents. Separating those fronts in the root would change the intentional rigid-group representation. More general assembly movement directions and arbitrary-solid visibility remain outside this solver.

Balloons try geometry-relative rails and short radial candidates near verified visible edges, with consistent 7 mm circles and 9.5 mm rail spacing. Candidate centre-to-anchor lengths are capped at 40 paper mm. Placement rejects dimension collisions, component-edge crossings, centres inside physical projected panel silhouettes, other balloons and crossing leaders. Balloon outlines stay at least 3 mm inside the sheet border in the tested range. If no honest visible, clear placement exists, the existing unplaced diagnostic remains; a source anchor is never fabricated. Placement remains deterministic and greedy, so it is not a proof of a globally optimal route.

## Semantic style and company profiles

`style.ts` resolves strokes and principal text/symbol sizes centrally in paper millimetres. `plotSheet` resolves styles once for the same vector primitives consumed by browser SVG and `pdf-lib`. Dash arrays are carried as paper lengths in SVG and converted to points for PDF; viewport scale does not scale the lineweight or dash pattern.

| Semantic role | Workshop / Engineering paper width | Candidate pattern |
| --- | --- | --- |
| Visible outline | 0.30 / 0.35 mm | Continuous |
| Visible internal / retained section edges | 0.18 mm | Continuous |
| Section cut | 0.45 mm | Continuous |
| Hidden, when explicitly requested by geometry | 0.18 mm | 3 / 1.5 mm dashed |
| Centre, when explicitly requested by geometry | 0.18 mm | 8 / 1.5 / 1 / 1.5 mm chain |
| Cutting plane | 0.35 mm | 10 / 2 / 1 / 2 mm chain, with direction arrows |
| Dimensions / extensions / leaders | 0.18 mm | Continuous |
| Balloons | 0.25 mm | Continuous |
| Section hatching | 0.13 mm | Clipped vector segments; adjacent cut panels distinguished |
| Sheet border / title block / tables | 0.35 / 0.25 / 0.18 mm | Continuous |
| Detail crop boundary | 0.18 mm | 2.5 / 1.5 mm dashed |

Dimension text is 2.5 mm, balloon text 3 mm, headings/section symbols 2.6 mm and view notes 2 mm. Existing schedule and title-block lettering remains at its established paper sizes. Hidden/centre styles are registered capabilities; the clean opaque isometric does not add fictional hidden or centre geometry. Sections continue to hatch only actual intersected material.

Schema-3 profiles optionally accept `presentation.lineWeights`, keyed by the semantic roles. Widths must be finite 0.13–0.70 paper mm; unknown roles, executable content and engineering/approval overrides are rejected. Example:

```ts
profile.presentation = {
  lineWeights: { "visible-outline": 0.35, dimension: 0.18, leader: 0.18 },
};
```

These native overrides round-trip through the existing profile parser and preference envelope. They do not add an editor, external assets or normative tolerance settings. Workshop/Engineering source geometry, measured values, tables' source identities and purchasing policy remain identical; their existing table/detail conventions and visual emphasis are preserved.

## Diagnostics and limits

`compositionReport` records each view's projected paper envelope, full annotation bounds, selected scale and envelope/frame utilisation. Nonblocking diagnostics identify clipping, overlapping view/table allocations, low isometric utilisation, balloon border clearance, leader crossings and component collisions. The report is regenerated and compared at the shared render/export validation boundary so stale diagnostics cannot silently describe changed sheets. The UI exposes sheet-specific evidence.

Utilisation means projected bounding-envelope area divided by allocated frame area. It is not occupied ink, an optimality proof or a standards score. The 14% low-utilisation threshold and 3 mm balloon-to-border margin are application review criteria. Paper annotation checks use conservative one-em text envelopes; full arbitrary glyph shaping, PDF font substitution and printer dot gain are not modelled. Component collision diagnostics consider projected visible ink and its per-component convex hulls; they do not prove physical assembly access or a manufacturing process.

## Standards-oriented baseline and verification gaps

The following **official public catalogue descriptions** were checked on 18 November 2026. They establish relevant scope, not clause-level conformance. No complete licensed set or formal verification was available for this work.

| Reference | Relevant scope / candidate implementation | Verification still required |
| --- | --- | --- |
| [BS 8888:2025, BSI](https://knowledge.bsigroup.com/products/technical-product-specification-and-documentation) | Technical product specification/documentation framework; explicit preliminary status and controlled source identity | Applicable referenced requirements and an evidenced, scoped review of the complete documentation |
| [ISO 128-2:2022](https://www.iso.org/standard/83355.html), [ISO 128-3:2022](https://www.iso.org/standard/83356.html) | Semantic line distinctions, leaders, views, sections/cuts and cut-material hatching | Exact configurations, line groups, arrow/symbol geometry, isometric internal-edge classification and reproduction requirements |
| [ISO 129-1:2018](https://www.iso.org/standard/64007.html), [2020 amendment](https://www.iso.org/standard/75971.html) | Source-bound nominal dimensions, extension gaps, separated dimension lanes, readable text and explicit reference repeats | Applicable dimension/reference notation, arrow/text sizes and small-gap presentation; no dimensional tolerance is authored here |
| [ISO 5457:1999](https://www.iso.org/standard/29017.html), including its listed amendment | Physical A-series landscape pages and reserved drawing/title-block regions | Exact margins, binding edge, zones, centring/trimming marks and title-block placement; current symmetric border is a candidate company layout |
| [ISO 5455:1979](https://www.iso.org/standard/11500.html) | Uniform scales and explicit view ratios | Preferred/supplementary scale selection and exact designation; current application series is not certified |
| [ISO 7200:2004](https://www.iso.org/standard/35446.html) | Drawing number, revision, subject/project, units, scale, projection, sheet index, optional company fields | Required/optional field classification, field lengths and issuer/checker/document-control semantics; no authorised sign-off is fabricated |

First-/third-angle orthographic view positions and alignment remain tested; section arrows communicate their explicit viewing direction independently. There is no new projection symbol, datum, GD&T, tolerance class, process, machining instruction, edge treatment, DXF/DWG output or CAD editor. Standards-oriented appearance does not change readiness, hardware approval or compliance status.

## Verification

Automated coverage includes widths 900/1000/1100/1200 mm; representative heights 600/850/1000/1600/2200, depths 450/500/550/600/650 and drawer counts 1/3/4/8/12; both profiles/conventions; existing A4–A1/metadata/legacy-profile regressions; physical exploded separation; complete fitted bounds; balloon border, leader and component collisions; family colocation; source and BOM conservation; and matching PDF stroke/dash/text/vector output. These combinations sample the supported parametric range; they are not an exhaustive proof over every continuous parameter value.

Final verification: **594 tests passed** (555 retained regressions plus 39 composition/style regressions). `npx tsc --noEmit`, `npm run lint` and `npm run build -- --webpack` passed. `git diff --check` passed. No runtime dependencies or source furniture files changed.

Production Chrome checks passed using the existing locally installed Playwright/Chrome and static-build request interception: all four requested widths, drawer/depth regeneration, both profiles and projection conventions, functional mode preference round-trips, A4 continuations, A1 inline details, hidden coverage, mobile overflow and cancellation of a stale in-flight export. The final 12-page A3 download contains no image XObjects; 951 contextual SVG line segments were compared with PDF coordinates. Automated tests additionally compare paper line widths, dash arrays and text sizes for both profiles/conventions.

Actual PDF pages were rendered with macOS CoreGraphics at 108 dpi from their 420 × 297 mm media boxes and visually inspected, including GA, root explosion, drawer, carcass, A-A/B, front/D/E/F and C-C/I/J. Workshop at 900 mm and Engineering/first-angle at 1200 mm were reviewed; SVG compositions were also inspected in Chrome. The final wide-cabinet front details use D 1:2.5 and E/F 1:2. Review found no clipping, crossings or balloon collisions in those A3 outputs; the default and 1200 mm composition reports contain zero diagnostics. Four root concealed-panel diagnostics remain separately visible for the reasons above. This is screen-based review of actual-size A3 PDF content, not a physical-printer reproduction trial or formal standards audit.

Review PDFs/screenshots and command logs are local temporary artifacts named `/private/tmp/draftelm-5c2d-*`; they are not committed product/source assets.
