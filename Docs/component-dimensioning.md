# Phase 5C.1 — semantic rectangular component dimensioning

The component sheets now resolve **length, width and thickness from validated panel geometry**, with source-bound semantic identities and automatic paper-space placement. The reference chest retains **29 physical panel occurrences and seven nominal blank groups**. Seven grouped drawings display 14 geometric dimensions and seven linked thickness annotations, covering all **87 occurrence-level measurements**. No cutting sizes, geometry, quantities or engineering formulas change.

This is the rectangular-blank foundation of R05/R06 in the [Phase 5A specification](drawing-manufacturing-specification.md), using the presentation/semantic separation in the [architecture roadmap](drawing-architecture-roadmap.md). It is not the full functional, manufacturing-feature or inspection dimension engine described there.

## Semantic measurements and identities

`planning/componentTypes.ts` defines the typed contracts. `planning/componentDimensions.ts` resolves a frozen `ComponentDimensionPlan` (schema 1) independently of sheet layout:

- **Length:** the longer of the two actual panel face-axis extents.
- **Width:** the shorter face-axis extent.
- **Thickness:** the actual extent along the panel's explicit `thicknessAxis`, reconciled to its existing stock thickness and nominal BOM blank.

Values come from `PanelComponent.dimensions`, never a scaled image, label, specification duplicate or viewer/exploded display position. The existing shared formatter displays up to six decimal places; full source numeric values remain in the semantic plan. Display precision is not a manufacturing tolerance. Each measurement records its actual model axis and source corner endpoints, millimetres, component/assembly/BOM references and the source blank membership key. Its meaning is explicitly `nominal-rectangular-blank`; tolerances remain `unspecified`, manufacturing datums `not-assessed`. No approved finished-size relationship is inferred.

Stable IDs have the form `component-dimension:<encoded physical component ID>:length|width|thickness`. Every occurrence has its own three IDs, including members of a shared drawing. IDs survive parameter edits, source-array reordering, transient BOM-ID changes and drawer-count changes for surviving occurrences. A drawing group follows existing BOM membership (`panel:<canonical sorted membership>`), so genuine membership/regrouping changes may change its group identity. These identities do not constitute an assigned company part-number registry.

Physical face axes `u/v` follow the fixed model-axis order excluding the thickness axis. They stay fixed when the long/short extents exchange. Separate `displayAxes` rotate the longer edge horizontally on paper; equal-length ties use explicit model-axis order. The actual measured axis is retained on each length/width record. This display frame does not define grain, an inspection datum or a fabrication orientation.

Each group retains every occurrence's origin, physical/display axes and dimension IDs. A deterministic representative supplies the face illustration. `equivalentDimensionIds` links each displayed value to the corresponding measurements of all members. Existing reconciliation checks **every** member against the same nominal blank before grouping. A blank shared between top/base and a decorative front therefore keeps its original BOM identity while preserving the different physical panel orientations.

The plan binds the exact engineering revision, normalized panel/BOM source snapshot, complete parsed profile snapshot and `rectangular-panel-dimensions-1` resolver version. Source/profile inputs are not frozen or edited. `validateComponentDimensionPlan` compares the plan against current inputs; cached values and changed positions/dimensions/materials/quantities/profile settings are rejected. Snapshots establish consistency, not a signature, approval or historical revision registry.

## Geometric dimensions and linked thickness

`componentFaceViewport` adapts the plan into the existing vector viewport model. Length and width are ordinary geometric dimensions with actual face-corner extension anchors, dimension lines, arrows and values. `componentFacePoint` maps a displayed face corner back to its real source panel corner. The local face drawing uses nominal millimetres independent of global furniture placement.

Thickness is a typed `LinkedThicknessDimension`, displayed once as **“Thickness 18 mm (normal to face)”**, with the source semantic ID, every equivalent occurrence dimension ID and component/BOM references. It is a linked annotation, **not** a directly visible thickness-edge dimension. No fake side view, foreshortened thickness measurement or additional machining detail is drawn. The previous unlinked thickness string is removed; quantity/material and source schedule references remain.

`layout.ts` supplies shared wrapped note records, including their semantic references. Preview and PDF use the same thickness text, wrapping and paper position. SVG dimension lines, arrows, labels and thickness notes retain source IDs; the vector exporter consumes the same plotted geometry.

## Automatic placement

`componentDimensionLayout.ts` owns paper-space choices. Semantic values never depend on placement success.

1. Fit the existing component face into its existing sheet slot and scale. `viewports.ts` holds the previously shared fitting helpers, re-exported from `generate.ts` for compatibility.
2. Resolve extension anchors from the projected face bounds. Try length below/above and width left/right, using deterministic outward lanes.
3. Test every complete pair against the component outline, heading and wrapped note bands, view boundaries and any supplied additional reserved regions. Include extension/dimension lines, rotated text envelopes and arrowhead bounds. Different dimensions may not collide with one another.
4. Keep fixed readable dimension text. Use outside arrows when the projected span cannot contain the label and both inside arrows. A short paper span never changes the engineering value.
5. If needed, retry up to six fits using smaller conventional reductions. Geometry and IDs remain unchanged. If no complete pair fits, retain the best valid subset and mark the remaining requested displays explicitly `unplaced`.

The default `rectangular-component-paper-mm-1` style uses 2.5 mm dimension text, 2.4 mm arrow length, 1 mm extension gap, 1.5 mm extension overrun and a 7 mm initial outward lane with 3 mm lane spacing across four lanes. These are **paper presentation choices**, not design clearances, tolerances or verified standards rules. Thickness and other component notes retain the shared 2 mm note lettering. Collision tests use conservative one-em text envelopes and a 0.5 mm paper gap, including rotated lettering. They do not implement a general font/shaping or arbitrary geometry layout engine.

`placeComponentDimensions` accepts a typed style and additional reserved rectangles as an extension seam for future company policies. `fitComponentDimensions` applies the default shared fitter and bounded scale fallback. The current generator selects the built-in style, and render validation reconstructs that selection. A future persisted company style must gain an explicit profile resolver/binding before it can alter document output; editing placed values/styles is not a supported approval or override mechanism.

## Coverage, diagnostics and render validation

`componentDimensionCoverage` keeps required/displayed/missing occurrence IDs and placement diagnostics under the explicit scope `nominal-rectangular-blanks-only`. Shared displays account for each member once. A complete reference package reports **87/87**; it does not claim functional, machining or manufacturing completeness.

An unplaced dimension retains its ID, value, source links and diagnostic; `plotDimension` emits no misleading substitute. A linked thickness annotation that cannot fit its reserved band is also reported unplaced. Component sheet footers report placement problems, and the browser coverage disclosure lists the affected view/reason and occurrence counts. Hiding component drawings preserves all semantic measurements but reports missing display coverage. If the view itself cannot fit, generation returns an explicit component-specific issue and withholds the package.

`planning/componentValidation.ts`, invoked by the existing shared document validator, re-resolves the captured semantic plan, source/BOM/occurrence coverage, geometry, thickness link and deterministic placement. It independently checks collisions and sheet reserved regions, including other view frames and tables. Altered values, attachment corners, offsets, scales/origins, diagnostic state or coverage cannot silently reach preview/PDF. As with the GA plan, validation against a captured source verifies internal consistency; callers need current external inputs to assess live-design freshness.

Workshop/Engineering profiles remain schema 3, with no new persisted settings or migration. First-/third-angle GA placement, assembly sheets, numbering, component grouping/order and existing pagination remain. A single component face with a normal-to-face thickness note does not require an end-view projection arrangement. The default A3 package remains nine sheets; the default A4 package remains thirteen. Profile changes invalidate bindings and input changes still cancel an in-progress stale PDF download.

## Verification and remaining limits

On 17 November 2026, **414 automated tests pass** (366 prior regressions plus 48 component-dimension regressions), alongside TypeScript, lint and `npm run build -- --webpack`. Tests cover 900/1000/1100 mm configurations, supported drawer counts, every panel/BOM identity, stable occurrence IDs/physical axes, shared blanks with different orientations, thickness edits, immutable/stale/tampered plans, forced alternative lanes, outside arrows, outline/dimension/label/reserved-region/clipping collisions, bounded scale fallback and explicit impossible-placement diagnostics. Both profiles/conventions and A4/A3/A2/A1, including expanded title blocks, have complete nominal coverage. Per-page decoded PDF paths/text match browser plots without raster image objects. Existing GA, exploded and subassembly regressions remain enabled.

Hydrated production Chrome checks pass for component previews, 900/1000/1100 mm regeneration with stable displayed IDs, 1/3/4-drawer coverage, hidden component coverage, both profiles/conventions, preference reload, stale-export cancellation, viewer independence, A4 and mobile overflow. The downloaded nine-page vector PDF matches browser component-dimension coordinates and linked thickness text. Native component PDF pages and A4/Engineering/first-angle browser sheets were visually inspected for readability and clipping. Existing GA/EA/DS/CS browser and PDF checks also pass. Local build-artifact routing avoids this environment's listening-port restriction; Chrome required execution permission. The default reference, 900/1000/1100 mm configurations and tested supported count/format/profile cases have **no unplaced component dimensions**. Additional generated 12- and 64-drawer checks cover 231 and 1,167 occurrence measurements respectively, also with zero missing placements. Deliberately blocked test fixtures report unplaced length, width and thickness rather than fabricate attachments.

Supported scope is reconciled opaque axis-aligned rectangular panel blanks and their existing BOM grouping. Hardware runner envelopes/schematic anchors are not approved component machining geometry. There are no sections, shaped/rotated parts, functional feature chains, tolerance/datums, grain/finish/edge deductions, finished-size assumptions, CAD editing, machining, DXF/DWG export or BS 8888/ISO compliance claims. Dense arbitrary drawings and future company styles need additional reviewed policies.

`manufacturingReady` and `complianceVerified` remain **false**. The reference **160 screws, eight brackets and eight runners** remain unverified allowances, purchasing quantity zero and no approved purchasing items. Engineering review of manufacturing dimensions, materials, fixings, tolerances, construction and release criteria is still required. No automatic commit or push is performed.
