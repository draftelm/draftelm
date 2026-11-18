# Contextual functional dimensions and consolidation — Phase 5C.2C

Normal Workshop and Engineering defaults now use closed assembly elevations, true sections and enlarged contextual crops for **all 26 core functional relationship requests**. FD-001/FD-002 isolated-edge sheets are excluded from those defaults. They remain available through the explicitly labelled **Isolated edges (diagnostic)** presentation. The original measured geometry, 46 relationship requests, 43 unique measurements, 20 supporting deferrals, 29 panels and 87 nominal component measurements remain unchanged.

This extends [functional dimensions](functional-assembly-dimensions.md) and [A-A / Detail B](contextual-assembly-sections.md), implementing a bounded preliminary presentation slice of R02/R06/R07 in the [manufacturing specification](drawing-manufacturing-specification.md). It does not approve engineering assumptions or provide a manufacturing release.

## Audit and primary coverage map

The previous milestone placed 26 core requests on isolated-edge sheets and repeated three in contextual A-A/B geometry. The 23 requests relying on legacy views were two further front gaps, ten outer reveals, eight lateral spaces and three further rear spaces. All now have primary contextual presentations:

| Source relationship | Occurrences | Default measurement | Primary contextual view |
| --- | ---: | ---: | --- |
| Adjacent front gaps | 3 | 3 mm | D — crop near the fronts' left edges and real carcass outline |
| Left outer front reveals | 4 | 2 mm | E — lower-left corner of the closed assembly |
| Bottom outer front reveal | 1 | 2 mm | E — same real corner; distinct semantic measurement and dimension |
| Right outer front reveals | 4 | 2 mm | F — upper-right corner of the closed assembly |
| Top outer front reveal | 1 | 2 mm | F — same real corner; distinct semantic measurement and dimension |
| Drawer/carcass left side spaces | 4 | 12.7 mm | I — enlarged crop of horizontal section C-C |
| Drawer/carcass right side spaces | 4 | 12.7 mm | J — enlarged crop of horizontal section C-C |
| Drawer rear/back actual spaces | 4 | **84 mm** | Existing Detail B, with grouped occurrence references |
| Back rear inset | 1 | 10 mm | Existing Detail B and its explicit coplanar carcass-envelope mapping |
| **Total** | **26** | | **Nine semantic display groups in six contextual details** |

A-A retains its first-gap REF repeat. It is not counted as another independent measurement or another primary coverage assignment. A one-drawer chest has no adjacent-gap request or D detail; its eight core requests remain covered by E/F/I/J/B. Four drawers have 26 requests; three have 20; eight have 50. Supporting cell clearances, offsets, setback and back-perimeter relationships retain their previous explicit deferred policy, without being silently counted as manufacturing complete.

`FunctionalContextPlan.displays` records every request ID, semantic dimension ID, representative, exact per-occurrence face IDs/witness points, view ID, grouped identities and source references. `functionalContextPresentation.assignments` maps **each required source request ID** to its display, actual view and sheet, or to an explicit unplaced/unsupported reason. The browser's **Contextual functional coverage** disclosure exposes all 26 exact IDs and destinations. The stored request IDs retain the existing `functional-request:<encoded scope>:<kind>` syntax; dimensions retain their original `functional-dimension:<face pair>` identities. No new engineering measurement ID or BOM item is manufactured by grouping.

## Closed front context and enlarged crops

`planning/functionalContext.ts` uses the actual opaque closed-panel FRONT projection. The overview is separate from the clean GA. D/E/F have labelled boundaries and associated callouts on that overview, plus reciprocal parent-sheet references in their notes.

D includes the carcass side and the corners of adjacent decorative fronts, rather than two floating gap lines. E combines the left reveal and bottom reveal at the actual lower-left corner. F combines the right reveal and top reveal at the actual upper-right corner. Witness stations lie on the real overlapping source-face interval, near the corresponding corner. Crops derive from source panel positions, thicknesses and existing face coordinates. The amount of surrounding context is a paper-presentation rule; it does not alter physical sizes.

`cropSectionGeometry` clips either projected outline geometry or section geometry. It accepts only edges/cut regions, so a front elevation does not need a fictitious section definition. Clipping never creates a closing physical edge at the crop boundary. Front crops are unhatched and explicitly labelled **“Crop limits are not physical edges.”** No joint, material layer or machining feature is inferred from an apparent intersection.

`verifiedFunctionalGroups` rechecks full-precision measured values against actual source face coordinates before sharing a display. It splits unequal source values, retaining request/measurement links. The existing geometry epsilon is numerical stability only, not a manufacturing tolerance. Groups remain specific to the same relationship kind and source intent; a left reveal is not merged with a bottom reveal merely because both measure 2 mm. Shared presentations use a quantity prefix such as **4x REF 2**; this means four verified equal measured relationships, not four interchangeable manufactured parts.

Zero reveals use linked **“Measured 0 mm (coincident reference planes)”** notes and retain their semantic IDs/coverage. They do not produce fake zero-length dimensions. Notes are reserved before fitting the remaining dimensions, keeping the geometry and other annotation placements consistent.

## Horizontal section C-C and details I/J

The registered chest adapter derives a common interior **Y interval** from the actual current drawer's decorative front, box front/rear and side panels, plus the carcass sides and back. The plane is its midpoint: **Y = 94 mm** in the default reference, inside the real 32–156 mm wall interval. It looks **−Y**, retains **Y ≤ 94 mm** and projects with the existing TOP basis: paper model X = engine X, paper model Y = engine Z. The original X-right/Y-up/Z-rearward engineering convention is unchanged.

A cutting line, directional arrows and **C-C** labels appear at that real Y coordinate on the closed FRONT parent. Arrow labels sit outward of the cut line ends. Detail E's callout can attach below its lower-right boundary to keep small-sheet references distinct. These are source-bound section/detail labels, not formal manufacturing datums. First-/third-angle GA arrangements remain unchanged; explicit section arrows determine the auxiliary cut direction in both conventions.

The default C-C cut intersects **eight real panels**: two carcass sides, back, decorative front, two drawer sides and box front/rear. The reusable rectangular half-space kernel retains all 29 panel states, removes material above the plane and depth-clips the retained projection. Only true intersected material receives hatching. Projected lower panels remain unhatched, and hidden edges remain occluded. I/J crop the actual front corners of this section, including decorative front, box-front/side and carcass-side context. They show the measured **12.7 mm** spaces between real inner carcass faces and outer drawer-side faces.

Each grouped drawer keeps real per-occurrence witness points and its own source section station. Only rendered section definitions get target section IDs; equivalent unrendered stations are recorded as `sourceSectionPlane` values, not dangling view references. A slice is shared only after comparing the relevant drawer panels' X/Z arrangement as well as the source values. Different arrangements split the presentation and may require additional sections/details. The current validated chest engine generates a uniform one-column drawer family; this is not a generic CAD section-selection system.

## Reusing A-A / B and source intent

A-A, its TOP parent, Detail B's source-derived crop and back/base mapping are preserved. The rear-space display now links all four verified equal source rear-clearance requests and prints **4x REF 84**. Its value remains actual measured geometry. Detail B separately states the source **minimum 10 mm (unverified)**, derived from the existing request's intent record. It never substitutes that minimum for the actual 84 mm measurement.

The inset keeps its original semantic face-pair reference and the explicitly verified **coplanar-carcass-rear-envelope** mapping to the real base rear face. This does not imply that the removed right carcass side is cut or visible in A-A. Grouped references include all corresponding occurrence/BOM links; each rear-space member also retains actual witnesses in A-A's plane.

## Layout and package organisation

A deterministic placer first tries genuinely vacant space below a related drawer parts list. It rejects slots overlapping existing view frames, balloon/leader/table ink or reserved sheet regions. Default A1 fits I/J on **DS-001**, while A-A/B remain in the existing carcass-sheet slot. The remaining overview/front details fit on one FC continuation sheet. Smaller formats use bounded continuation layouts without adding content to the clean GA:

| Default format | Contextual organisation | Total package sheets |
| --- | --- | ---: |
| A3 | SC-001: A-A/B; FC-001: front overview, C-C and I/J; FC-002: D/E/F | **12** |
| A4 | SC-001/002: A-A/B; FC-001: overview/C-C; FC-002–004: readable pairs of enlarged details | **19** |
| A2 | SC-001 plus FC-001/002 | **12** |
| A1 | A-A/B on CS-001; I/J on DS-001; overview/C-C/D/E/F on FC-001 | **10** |

Current default A3 scales are 1:10 for the new overview/C-C and 1:2 for enlarged D/E/F/I/J. Scales adapt to actual geometry, sheet size and additional title-block fields. Parent and child notes resolve actual stable package sheet IDs after placement. FC subjects print those IDs, independently of configurable drawing numbers. Existing numbering prefixes, revisions, sequential schemes, title blocks, GA, assembly and component IDs remain intact.

Dimension lines, arrows and value text use the existing shared vector renderer and fixed paper lettering. Placement searches alternative sides and lanes, testing view boundaries, geometry image, heading/notes, other dimensions and reference labels/callouts. Witness extensions intentionally terminate on the actual referenced edges. Unplaceable displays retain their IDs and explicit reasons in coverage; FC sheet footers report deferred placement counts. Structurally invalid or colliding views withhold the package with diagnostics instead of exporting misleading geometry. This remains a bounded layout policy, not a general annotation editor/optimiser.

## Profiles, persistence and diagnostic mode

Schema 3 adds optional:

```ts
profile.contents.functionalPresentation = "contextual"; // current built-in defaults
// "isolated-edges" selects the optional legacy diagnostic presentation.
```

`functionalDimensions` still controls functional sheet inclusion. `contextualSections` retains its existing A-A/B visibility setting. If A-A/B is hidden, five default rear/inset requests are explicitly unplaced; the remaining 21 contextual requests remain covered. Hiding functional dimensions retains all semantic data and reports required display coverage as missing.

Older saved profiles **without this presentation field retain their previous isolated-edge output**, preserving company sheet selections, numbering and metadata. The UI explicitly identifies that as diagnostic presentation and provides the contextual selector; Reset adopts new defaults. Save/Load retains either explicit choice. The legacy DrawingOptions API also retains previous output. No profile choice approves assumptions, hardware or manufacturing readiness. Future company rules can extend crop selection, grouping, available slots and presentation style through the bound planner/placement seams.

## Integrity, validation and limits

`FunctionalContextPlan` schema 1 binds the engineering revision, canonical source snapshot, complete profile and `chest-functional-context-1` rule version. Shared render validation re-resolves source measurement groups, true section solids, crops, witness/membership mappings, labels, origins/scales, placement and coverage. Missing/wrong target sheets, altered values, stale source/revision/profile and incomplete mappings are rejected. Existing live-document identity checks still cancel an export if inputs change during generation.

The browser and vector PDF use exactly the same plotted outlines, cut hatches, markers, leaders, dimension primitives and linked notes. No raster drawing objects are introduced. Engineering positions/dimensions, BOM calculations, 29 occurrence IDs, seven blank groups and 87 component measurements are unchanged. Presentation geometry never feeds manufacturing coordinates or quantities.

Supported scope is the registered opaque axis-aligned rectangular chest adapter. Oblique/stepped sections, shaped/rotated parts, arbitrary furniture families, hardware sectioning, a full dimensioning editor and DXF/DWG remain unsupported. Dense or unusual geometry/company layouts can require additional pages or explicit deferral. The existing 20 supporting requests remain deferred; no assertion of complete manufacturing/inspection coverage is made.

Engineering review is still required for nominal reveals, minimum clearances, runner supplier requirements, materials, joinery/back retention, fixings, loading/stability, tolerances and inspection references. No new geometry, fixings, drilling, machining, tolerance, formal datum or process instruction is invented. **manufacturingReady=false**, **complianceVerified=false**. The default **160 screws, eight brackets and eight individual runners** remain unverified allowances, purchasing quantity zero and no approved purchasing items. No automatic commit/push is performed.

### Verification result — 18 November 2026

**555 automated tests pass**: the previous 509 plus 46 contextual-consolidation tests. `npx tsc --noEmit`, `npm run lint` (no warnings), `npm test`, `npm run build -- --webpack` and `git diff --check` pass. Tests cover all 26 primary mappings and former 23 legacy-only requests, cut/uncut geometry and hatch containment, 900/1000/1100 mm widths, 1/3/4/8 drawers, height/depth/overlay/gap/inset/side-space edits, actual witness/reference identities, unequal-value splitting, zero notes, expanded company title blocks, both profiles/projections, four formats, persistence/migration, hidden/deferred coverage, stale/tampered plans, unchanged BOM/readiness and per-page PDF vector parity.

Hydrated production Chrome checks pass for the new details and existing GA/assembly/component output, both profiles/conventions, width/depth/count regeneration, diagnostic mode and saved reload, A4 pagination, A1 drawer-sheet placement, explicit hidden coverage, mobile overflow and **stale PDF export cancellation during an input change**. Listening-port restrictions are handled with a local production-asset routing harness. The downloaded 12-page A3 vector PDF has no raster image objects; **975 source-linked line vectors** across SC/FC geometry, hatches, references and dimensions match preview coordinates. Native PDF/CoreGraphics renders of A3 overview/front details and A4 overview were visually inspected, alongside Chrome A1/A4 views, for readability and clipping.

The default reference has **26/26 core relationships contextually placed, zero required placement failures, zero missing component dimensions and no unresolved geometric/annotation collisions**. Signed/negative or interfering relationships remain subject to the original functional adapter's unsupported diagnostics; this increment does not add signed-distance engineering semantics. The 20 supporting deferred requests and existing unverified engineering assumptions remain outstanding. No commit or push was made.

## Phase 5C.2D composition update

A3 FC-001 now keeps the closed front with D/E/F, while FC-002 keeps C-C with I/J. Candidate column/two-row layouts are evaluated using actual marker, dimension and annotation bounds. SC-001 still keeps A-A/B together. The package remains 12 pages and all 26 core / 20 deferred relationships retain their previous semantic identities. See [professional composition](professional-drawing-composition.md) for scale/readability decisions and current verification.
