# Phase 4C.2 — item numbering, balloons and assembly parts list

The existing drawing generator now adds a reusable annotation foundation. Workshop and Engineering profiles can display component balloons and a compact assembly panel parts list. Both are enabled in the current defaults. The reference A3 package still has six sheets, with the parts list in reserved space at the upper right of the GA sheet. All 29 panels remain traceable to the existing engine components and validated BOM; no second engineering BOM is generated.

## Stable item identity and occurrence identity

`createDrawingAnnotations` in `src/drawings/annotations.ts` consumes a reconciled `FurnitureResult`. Each panel BOM group becomes one `DrawingAssemblyItem`, with current BOM ID, all component IDs and actual assembly references, description, quantity, material ID and a `cuttingListBomId` link. The full cutting-list rows also display the same short item label beside their BOM identity. Hardware allowances retain their separate existing schedule and purchasing exclusion policy.

The numbering policy is explicitly versioned as **`bom-membership-v1`**. A canonical key uses the sorted unique physical component IDs of a validated panel BOM group. Sorting those canonical keys assigns short numbers independently of BOM array order, `bom-N` identifiers, model dimensions, material descriptions or draw order. Reordering arrays, changing transient BOM IDs, and changing dimensions without changing group membership preserve the numbering. The source BOM grouping remains authoritative, including a blank shared between carcass and drawer roles.

This is deterministic document numbering, not an assigned company part-number registry. A real group split/merge, changed component IDs or changed group membership can renumber items. No historical numbering registry or cross-project identity is claimed. Future grouping rules, assembly scopes or fittings need a new explicit policy/resolver; current annotation scope is physical panels only.

The reference groups are:

| Item | Description | Quantity | Default balloon result |
| --- | --- | ---: | --- |
| 1 | Inset square-cut back | 1 | Unplaced: concealed |
| 2 | Carcass base / top | 2 | One visible representative |
| 3 | Carcass side | 2 | One visible representative |
| 4 | Drawer bottom | 4 | Unplaced: concealed |
| 5 | Drawer box front / rear | 8 | Unplaced: concealed |
| 6 | Separate decorative drawer front | 4 | One visible representative |
| 7 | Drawer side | 8 | Unplaced: concealed |

An item describes a group; a component ID describes a physical occurrence. **One representative per item** requests a balloon for each group and records the particular visible occurrence selected. **Each visible occurrence** requests all 29 individual panels, retaining shared item numbers for equal parts. The initial reference placement finds three group representatives or eight exterior occurrences. The remaining four groups / 21 concealed occurrences stay in the parts list and receive explicit diagnostics. Layout, dimensions, view selection and readability can affect these placement results for other configurations.

## Semantic entities and paper placements

The typed entities in `types.ts` separate meaning from rendering:

- `DrawingAssemblyItem`: stable group identity, numeric/display label and existing BOM/component links.
- `ComponentBalloonAnnotation`: an item reference and a representative-group or single-occurrence request.
- `DrawingAttachmentAnchor`: a model-space point on an actual panel edge, its exact edge endpoints, source projected-line ID, component/assembly/BOM reference and selected viewport.
- `DrawingLeaderAnnotation`: links the semantic balloon to its semantic anchor.
- `AssemblyPartsListAnnotation`: a panel scope and ordered references to the same numbered items.
- `PlacedComponentBalloon` and `PlacedAssemblyPartsList`: paper-space positions/paths/table fragments, held on sheets and referencing the semantic entities.
- `DrawingAnnotationDiagnostic`: unavailable visible geometry, layout capacity, hidden assembly views or relocated parts-list information.

`DrawingAnnotationModel` has `schemaVersion: 1` and is retained as `document.drawingAnnotations`. Styles such as circle radius, font size, line weight and anchor-dot size live in shared presentation code. The discriminated semantic-entity union and separate placement layer can be extended for notes, section/detail references and machining annotations later. Those additional annotation kinds are not implemented in this phase.

`validateDrawingAnnotations` independently checks source BOM quantities/materials/membership, all-panel coverage, parts-list links, balloon/group membership, actual panel-edge anchors, projected line attachment and visibility, leader relationships, duplicate/orphan placements and table content. It also checks relevant viewport/table/dimension/annotation collisions. Source engineering/BOM reconciliation still runs before output inclusion, so hiding annotations or schedules cannot conceal corrupt source data.

## Visibility, leaders and placement

`annotationGeometry.ts` derives all twelve panel edges directly from engine global minimum corners and extents. Candidate anchor points are fixed fractions along those actual edges; they are presentation attachment points, not drilling or fixing positions. Candidates must lie on a projected line already carrying the correct occurrence reference and span at least 3 paper mm for readable identification.

Candidates are checked against rays towards the camera for the selected parallel projection: front, top, right or the existing isometric basis. The ray test includes every physical panel and the target itself, rejecting foreground occlusion and self-hidden geometry. The candidate and two nearby edge samples must be visible, avoiding isolated contact-point visibility; this sampling is not a continuous visibility proof. The 0.000001 mm comparison epsilon handles computation only; no manufacturing tolerance is introduced. The `verified-visible` anchor label describes this drawing visibility check, not engineering/manufacturing or standards verification.

The preferred view is the selected isometric, followed by available front, top and right views. The isometric itself remains the existing **wireframe with hidden edges not removed**; a line appearing in that wireframe does not make it eligible for a balloon. Visibility checks treat panels as opaque. The reference back and internal drawer parts therefore receive no misleading attachment through the carcass/fronts. No transparent, open-drawer or exploded engineering geometry is substituted to force a balloon.

Balloon circles use reserved left/right rails inside each viewport. Leaders end in a small vector dot on the actual projected anchor. Fixed paper sizes, wrapped heading/note bands, dimensions, other circles and leader paths participate in placement checks. A candidate that cannot fit clearly is omitted with `layout-full` or `no-visible-edge`; no displaced/floating anchor is invented. The UI expands diagnostics to show item descriptions and affected component IDs, and the GA footer reports unplaced requests. Hidden assembly views are reported explicitly.

This is a deterministic conservative solver for current axis-aligned rectangular panels and parallel views, not a general CAD visibility or annotation optimiser. Occlusion tests include panels; unmodelled hardware and future fittings have no certified visibility. Discrete candidate sampling can leave a genuinely visible edge unannotated. Arbitrary curved geometry, sections, hidden-line isometrics and manual anchor editing remain outside this phase.

## Compact list, readable overflow and vector rendering

`assemblyPartsList.ts` lays out a presentation of the numbered BOM references with **Item, Description, Qty and Material ID** columns. It does not calculate stock or hardware quantities. Lettering stays at 2.5 paper mm; overflowing content wraps and paginates rather than shrinking type.

The list uses the upper-right GA region when it fits and leaves at least 230 mm for the existing multiview layout. Orthographic first-/third-angle relationships, common scale and alignment are preserved in the remaining region. In the reference A3 profile this changes the main views to **1:20**, with isometric **1:20**. The table and view frames are disjoint. Turning off the compact list restores the ordinary full-width view layout; the legacy `DrawingOptions` API leaves both new annotation options off.

When the compact table cannot fit readably, it moves to adjacent numbered **AP** sheets. A4 normally uses this fallback. Very long descriptions/material IDs split into continuation fragments with the item label repeated, full text retained and quantity printed once per item. GA footnotes identify the AP fallback. If the complete cutting list is hidden, AP footnotes say that full cut sizes/IDs remain internal instead of pointing to an absent printed list. If assembly views are hidden, neither a placeholder GA nor an unattached AP sheet is added; the semantic list remains available internally.

`annotationPlot.ts` produces shared vector circle, leader, anchor-dot, text and table primitives. Browser SVG renders those circles directly; PDF renders them as vector ellipses/curves. The existing dimension plotting is extracted without style/formula changes into `dimensionPlot.ts`, and the old `plot.ts` exports remain compatible. Sheet numbering and totals include any AP continuations before PDF export. The complete cutting list, component details, hardware schedule and standard title blocks remain available through the existing generator.

## Profile v2 and local migration

`DrawingProfile.schemaVersion` is now **2**. It adds:

```ts
annotations: {
  balloons: true,
  assemblyPartsList: true,
  balloonDisplay: "one-per-item", // or "visible-occurrences"
  itemNumberStyle: "numeric",    // or "prefixed" => P1, P2, ...
}
```

Both built-in profiles expose these controls in Drawing Settings. The original numeric item identity remains the same for numeric/prefixed labels. Changing annotation visibility preserves internal numbering and full BOM reconciliation. No annotation option can approve hardware or manufacturing output.

`parseDrawingProfile` supports validated v1 profiles and migrates them to v2 with balloons and compact list **off**, preserving their prior annotation visibility and GA layout. `DrawingProfileV1` remains an accepted generator input. Reset applies current built-in defaults with both features on. Unknown future versions/settings are rejected. Existing local preferences remain readable under the same `draftelm.drawing-preferences.v1` storage key; the saved envelope/profile now use schema version 2. Load accepts supported v1/v2 envelopes and does not rewrite storage; the next explicit Save writes v2. New settings and display choices survive Save/Load and reload, with the existing explicit-load behaviour.

## Integrity, checks and limits

No furniture geometry, panel size, engine component position, BOM grouping formula, engineering approval evidence or mechanical workflow is changed. The reference **160 screws, eight back brackets and eight single-side runners** remain unverified allowances and are excluded from approved purchasing quantities. They do not receive fabricated geometric balloons or mounting details. `manufacturingReady` and `complianceVerified` stay false. No BS 8888 compliance, tolerance, drilling pattern, machining instruction, supplier fitting, DWG/DXF export or imported company template is added.

`tests/drawingAnnotations.test.ts` covers stable membership-based numbering, BOM/component reorder and transient-ID changes, all 29 panels, genuine shared-role grouping, width/height/depth edits, valid drawer counts, exact edge/leader relationships, self/foreground occlusion, individual occurrences, hidden annotations/GA, semantic/rendered parts-list reconciliation, long-identifier continuations, v1/v2 local migration, hardware exclusion, and vector PDFs. Layout tests span both profiles, both projection conventions and all four sheet formats, checking primitive extents, readable table cells, viewport/title-block clearance, dimensions and intersecting annotation paths. Earlier drawing/profile tests retain legacy layout coverage and account for new circle primitives.

Verification on 16 November 2026: **274 tests passed** (234 existing tests plus 40 annotation regressions), `npx tsc --noEmit` passed, lint passed without warnings, and `npm run build -- --webpack` passed with `/` and `/furniture` prerendered. The default Turbopack build was attempted but its CSS worker could not bind a local port (`Operation not permitted`). No dependency or build configuration changes were made; the final build artifacts are from the successful Webpack build.

Chrome checks passed against the hydrated production artifacts using request interception without a listening server. They verified three linked default representative balloons, the seven-item GA list, eight visible-occurrence balloons, hidden settings, prefixed labels, local persistence across reloads, v1 migration/reset, stable item labels after a 1000 mm width edit, independence from viewer explosion, both profile presentations, first-/third-angle UI changes, A4 AP relocation, unchanged 160-screw display and mobile layout. A configured A4 package downloaded with ten correctly numbered vector PDF pages, including balloon curves and the parts-list sheet, with no raster images. The reference A3 package remains six sheets. Browser launch required execution permission. The four unplaced reference groups remain **1, 4, 5 and 7**, comprising **21 concealed occurrences**, as explicitly reported in the UI/model.
