# Contextual assembly sections and enlarged details — Phase 5C.2B

This increment adds one source-bound assembly section and one enlarged contextual detail to the existing rectangular chest adapter. It is a preliminary drawing capability, not a general CAD section editor or a manufacturing release. Engineering geometry, BOM formulas, component dimensions and existing functional measurements are unchanged.

## Semantic source and section selection

`planning/sectionTypes.ts` separates the section definition, true solid intersections, cropped detail, functional measurement bindings and paper presentation. `ContextualSectionPlan` schema 1 captures the engineering revision, canonical source snapshot, complete profile and `chest-contextual-sections-1` rule version. Plans are frozen and reconstructed at the shared render/PDF validation boundary. The existing GA reuse gate rejects a plan from an earlier live design; a captured snapshot alone does not prove that an external model is current.

The registered chest selection requires resolved drawer-rear/back and back-inset relationships from Phase 5C.2. It takes the **midpoint of the common interior X span** of the full-width top/base, back, decorative fronts and drawer box front/rear/bottom panels. It requires positive intersections with every intended panel. There is no drawing-space plane coordinate or copied engineering sizing formula. For the default 900 mm chest this is **X = 450 mm**, in the original X-right, Y-up, Z-rearward engine coordinates. The observer looks **−X** into retained material at **X ≤ 450 mm**. The view uses the existing RIGHT basis: paper model X = engine Z, paper model Y = engine Y. First/third-angle settings retain their existing projection metadata and GA arrangements; the explicit cutting arrows determine this auxiliary section's viewing direction in both conventions.

Stable IDs identify `section:chest-centre-width`, parent `context-section-parent`, section `context-section-A-A`, and `detail:lowest-drawer-rear-back-base` / `context-detail-B`. These are view/section identities, not new physical components or formal manufacturing datum designations. The plan retains source occurrence, owning assembly and BOM part-type membership.

Default four-drawer accounting is **19 cut panels, five retained uncut panels and five removed panels = all 29 occurrences**. Every drawer still has its six physical panels. Removed or hidden occurrences remain reconciled; section visibility cannot remove panels from schedules or purchasing data.

## Supported solid geometry and visibility

`sectionGeometry.ts` supports opaque, axis-aligned rectangular panel solids and a single orthographic axis-normal half-space cut. It:

1. Intersects the plane with actual solid interiors and records four engine-global intersection corners plus the exact projected rectangle.
2. Clips presentation copies of intersected solids to the retained half-space. Source positions, dimensions, cutting sizes and quantities are never changed.
3. Runs existing orthographic depth/occlusion clipping on those retained solids, including uncut components behind the section. Collinear fragments are split at source endpoints and keep all occurrence/BOM references. A visible segment is marked cut when it belongs to an intersected face; otherwise it is a thin projected edge.
4. Distinguishes strict interior intersections from tangent-retained/tangent-removed panels. Tangent, removed, non-intersecting panels and empty space receive no hatching. Positive overlap between cut-face interiors is ambiguous and withholds the section for review.

The existing 10⁻⁶ mm visibility epsilon is computational, not an engineering tolerance. The kernel accepts the existing RIGHT, TOP and FRONT orthographic camera directions, validates cutting direction against the selected projection and rejects unsupported directions. The chest adapter currently selects only the vertical X-normal section.

`sectionPlot.ts` analytically clips every hatch line to its genuinely intersected rectangle, at fixed paper spacing. Adjacent cut occurrences receive different slope patterns; these distinguish panels and do not specify material layers, grain or manufacturing processes. Cut outlines use 0.45 mm paper strokes, projected edges 0.18 mm and hatch strokes 0.10 mm. These presentation choices make no BS 8888/ISO compliance assertion. Pattern assignment uses the full section, so the crop retains its parent patterns.

## Detail B and reused functional measurements

Detail B crops actual section edges and cut faces around the **lowest drawer rear, drawer bottom, carcass back and base**, retaining neighbouring material and voids. Its source-derived bounds start before the drawer rear and below the base, extend behind the carcass, and include part of the rear wall above the base. Margins derive from adjacent panel thickness/extents and affect presentation only. The crop clips lines without adding a physical closing edge. Full true intersection corners remain in the source record; cropped bounds specify the displayed subset. The view explicitly states that crop limits are not physical edges. Rear/Back/Base leaders identify actual adjacent occurrences when reliable space is available.

Three existing measured requests are repeated with **REF** prefixes and unchanged functional semantic IDs:

| Context | Existing request | Default value | Reference meaning |
| --- | --- | --- | --- |
| Section A-A | First adjacent decorative-front gap | 3 mm | Actual source front faces at their intersection with the section. One-drawer configurations use the bottom outer reveal instead. |
| Detail B | Lowest drawer rear to back inner face | 84 mm | Actual source face intersections. This remains a measured space, distinct from the source **minimum 10 mm** design assumption. |
| Detail B | Back rear inset | 10 mm | Back rear face to actual carcass rear envelope. |

The inset's original measurement references the right side's rear face, which is removed in this section. The presentation explicitly records **`coplanar-carcass-rear-envelope`** mapping to the base's real rear face, only after checking the same carcass membership and exact Z coordinate. It preserves the original semantic/source-face ID and adds the actual section-face ID, component and real intersection point. It never hatches or falsely shows the removed right panel. The two mapped faces meet a real common station at the back/base boundary. Missing intersections, missing coplanarity, unsuitable axes or contradictory coordinates produce unsupported-anchor diagnostics; values are never independently recalculated or substituted.

Each repeat records its request ID, semantic dimension ID, original/section face IDs, real 3D witness points, projected anchors, role and occurrence/BOM links. Placement operates separately in paper millimetres using the existing extension/arrow/value renderer. A coincident reference is deferred explicitly in this contextual presentation; its existing linked zero-value note remains on the legacy functional sheet.

## Coverage retained

All **26 default core requests remain placed on the existing FD sheets**. The new section/detail repeats three of them, leaving 23 requests with dimensions only on legacy isolated-edge views:

- Two further adjacent front gaps.
- Eight left/right outer front reveals and the top/bottom outer reveals.
- Eight drawer-to-carcass side spaces.
- Three further drawer rear spaces.

No legacy dimension is silently removed and no repeated contextual dimension is counted as an additional independent measurement. Existing source-intent classifications and the 20 supporting deferred requests remain unchanged. This increment does not contextualise every relationship or turn nominal geometry coverage into manufacturing completeness.

## Placement, references and profiles

The TOP parent has an actual X-plane cutting marker, arrows pointing −X and stable **A-A** labels. The section has a dashed **B** crop boundary and associated leader/callout. Typed markers refer to target view IDs; every target must resolve. Notes cross-reference stable package sheet IDs, which are also printed at the beginning of SC sheet subjects, independently of configurable/sequential drawing numbers. Pagination and normal drawing-number/title-block generation remain shared with all other sheets.

The placer first tries unoccupied space below the carcass assembly list without moving its isometrics, balloons or list. It uses that slot only if views, dimensions, references and enlargement fit reliably. Default A1 places the three views on **CS-001**. A3/A2 use **SC-001**; A4 uses **SC-001** for parent/section and **SC-002** for the enlarged detail. The GA stays unchanged. Default A3 section/detail scales are **1:5 / 1:2**; reductions adapt deterministically to actual bounds, paper size and additional title-block fields. Enlarged detail means larger than its parent section, not necessarily larger than full size.

Image, heading/notes, view boundaries, reference markers, dimension lines/arrows/values, other dimension lanes and cut material under identification labels participate in placement checks. Witness extensions intentionally terminate on source references. Body frames avoid other view frames, actual parts-list ink and title-block/note bands. The placer tries alternative dimension sides and lanes. Unplaceable dimensions/labels and inability to enlarge are reported in `sectionPresentation.diagnostics` and the UI. Extreme geometry, small company layouts or unusual clearances may still defer labels or measurements; legacy FD coverage remains independent. This is a bounded deterministic layout policy, not a general annotation optimiser.

Schema-3 profiles add optional `contents.contextualSections`. Current Workshop/Engineering defaults enable it. Absent/false preserves older saved profiles' sheet selection; the legacy DrawingOptions API also omits it. Local Save/Load retains explicit settings and Reset adopts current defaults. It does not implicitly disable FD sheets. Future company rules can extend the versioned adapter, slot selection, reference mapping and paper style independently; unsupported furniture families gain no inferred section requirements.

## Validation and limitations

Automated checks cover exact cut rectangles/corners, tangent states, cut/projected ownership, partial/full occlusion, hatch containment, crop integrity, marker directions/targets, source-bound functional repeats, width 900/1000/1100 mm, supported counts 1/3/4/8, changed height/depth/inset/gap, stable/reordered IDs, revision/tamper rejection, unchanged BOM, both profiles/projections, A4/A3/A1 layout, expanded title blocks, persistence/numbering, explicit deferred placement and vector PDF path/text parity.

Chrome checks use hydrated production assets and a local request-routing harness because this environment restricts listening ports. Exported PDFs are checked for absence of image objects and vector coordinate parity, and rendered with native PDF/CoreGraphics for visual inspection. This is separate from merely inspecting an SVG screenshot.

Unsupported: rotated/shaped/nonrectangular solids, oblique/offset/stepped sections, arbitrary opposite camera directions, general CAD selection/editing, joints/grooves/rebates absent from the model, hardware sectioning and automatic contextual coverage of all functional requests. Cropped outlines are open at the crop limits and labelled accordingly. Identification leaders and reduced whole-section scales may be constrained on small or extensively branded sheets. No fixing, drilling, machining, material-layer, datum, tolerance or process specification is inferred.

Engineering review remains necessary for nominal gaps and minimum-clearance policies, runner supplier requirements, material/finish/grain, joint/back retention adequacy, tolerances, load/stability and any manufacturing/inspection references. `manufacturingReady=false` and `complianceVerified=false`; **160 screws, eight brackets and eight runners remain unverified allowances**, with purchasing quantities zero and no approved purchasing items. No DXF/DWG export or standards compliance claim is added. No commit or push is performed.

### Verification result — 17 November 2026

**509 automated tests pass** (464 previous plus 45 section/detail tests). `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build -- --webpack` and `git diff --check` pass. Final hydrated Chrome checks pass across both profiles/conventions, 900/1000/1100 mm width edits, depth/count regeneration, saved settings/reload, A4 continuation and A1 inline composition. The downloaded 12-page default A3 PDF contains no raster images; **537 source-linked section, hatch, marker, leader and dimension line coordinates** match the browser preview. Native PDF rendering and visual inspection confirm readable A3 section/detail and A4 enlarged detail, with the A4 whole section improved to 1:10 at the default geometry. Browser A1 composition is also visually checked. Local production-asset routing was used in place of a listening development server.

The default reference has **zero contextual placement diagnostics, three contextual reference measurements placed, all 26 legacy core requests placed, and no missing component dimensions**. New support remains limited to the geometry and adapter scopes documented above. No new engineering assumptions were approved, and no commit or push was made.

## Phase 5C.2C consolidation

[Contextual functional dimensions](contextual-functional-dimensions.md) now cover all 26 core requests in normal profiles using closed front crops D/E/F, true horizontal section C-C and enlarged I/J, plus existing A-A/B. B links all four verified equal rear spaces and retains the source minimum distinction. FD sheets are now an optional isolated-edge diagnostic presentation. The preceding coverage/layout results describe the 5C.2B milestone; see the new document for current package organisation and safe saved-profile behaviour.
