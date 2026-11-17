# Phase 5C.2 — functional assembly dimensions and geometric references

The drawing engine now resolves measured assembly relationships independently of layout. The default four-drawer chest has **46 relationship requests backed by 43 unique physical measurements**. Nine repeated-detail groups display all **26 core requests** on two additional A3 FD sheets; **20 supporting requests** remain explicitly deferred by the initial display policy. The clean GA, exploded/subassembly drawings, seven component groups, all 29 panel occurrences and 87 component measurements remain intact. Engineering geometry/BOM formulas are unchanged.

This implements the preliminary assembly-relationship slice of R02/R06/R07 in the [manufacturing specification](drawing-manufacturing-specification.md), extending the semantic/presentation separation in the [architecture roadmap](drawing-architecture-roadmap.md). It does not establish complete manufacturing/inspection coverage or approved datums/tolerances.

## Supported relationships

Values are distances between actual panel face coordinates along a declared model axis. The source adapter uses existing schema-v2 assembly membership and explicit semantic member roles, not a second engineering layout formula.

| Relationship | Default measured value | Source intent / display |
| --- | --- | --- |
| Adjacent decorative-front gaps | 3 mm, three occurrences | Exact `construction.fronts.verticalGap`; core repeated detail. One drawer has no adjacent-gap request. |
| Left/right outer front reveals | 2 mm per side/front | Measured carcass outer face to front edge; core. These are **not automatically the configured edge-gap inputs** when overlay changes. |
| Bottom/top outer reveals | 2 mm each | Actual lowest/highest front and outer base/top; core. |
| Box-to-carcass left/right space | 12.7 mm per side/drawer | Geometry compared to `hardware.runner.sideClearance`; core. This is an unverified nominal side space, not a supplier installation specification. |
| Actual box-rear to back-front space | **84 mm** per drawer | Source `construction.drawer.rearClearance` is a **minimum of 10 mm**, not the actual space; core. |
| Recessed back rear inset | 10 mm | Back rear face to carcass rear face; exact nominal `construction.back.rearInset`; core. |
| Box / usable front-cell space below | 8 mm lowest, 24 mm others | Existing front cell clipped by the carcass opening; compared to nominal minimum 8 mm; supporting. |
| Box / usable front-cell space above | 55.25 mm first three, 39.25 mm highest | Actual box upper extent to the lower front-cell/top-opening limit; compared to nominal minimum 8 mm; supporting. |
| Box bottom above decorative front bottom | 24 mm | Exact nominal `construction.drawer.frontBottomOffset`; supporting. |
| Decorative front rear face setback | 0 mm | Actual front rear plane relative to carcass front; supporting. |
| Back perimeter spaces, four edges | 0 mm | Actual back/carcass inner-face coordinates, compared to nominal `construction.back.edgeClearance`; supporting. No groove, rebate or fixing detail is inferred. |

The usable cell limits follow the existing engineering contract: choose the higher actual front-bottom/base-inner face and lower actual front-top/top-inner face. These are typed **usable-front-cell** relationships, not invented physical shelves or datum planes. Physical box-side/rear clearances and inter-front gaps additionally require positive overlapping physical face area. Reveals/setbacks use projected geometric references; they do not imply contact between components merely because two planes coincide.

Width, height, depth, count, overlays and nominal gap/inset edits re-resolve every affected coordinate. Tests include valid inset-front construction: a positive front setback with full overlay can create interference and is still rejected by the existing engine. Back rear inset must remain positive under existing engineering rules; zero-value presentation is tested using valid zero outer-reveal/back-edge geometry instead of bypassing those rules.

## Measured geometry, intent and assumptions

`FunctionalDimension` records `basis: measured-geometry`, true value/unit, normal-axis measurement, exact face/edge IDs, actual 3D witness points, source component/assembly/BOM references and an appropriate orthographic projection. Tolerance is `unspecified`; manufacturing datum assessment is `not-assessed`.

`FunctionalRelationshipRequest` separately records meaning, physical/projected/cell scope and any directly defined source intent. Intent comparisons distinguish **exact** from **minimum**, retain the parameter path/value, and report `geometry-consistent` or `violated` under an explicit **geometry-check-only** assessment. The source parameter is read from the captured engineering revision; no sizing value is independently hardcoded or copied into a new furniture formula. Outer reveals have no directly specified scalar intent, so their measured values are not falsely matched to an edge-gap input.

Source `unverified:<area>` issues retain the classification `unverified-nominal-assumption`. If such evidence classification is absent, verification remains `not-assessed`; even a claimed `assumptionsVerified` flag cannot supply missing review/signature evidence. The canonical source revision does not carry the original verification records. Geometry consistency is not engineering approval or manufacturing readiness. Contradictory source intent is reported explicitly in the plan/UI/detail notes while measured geometry stays distinct for preliminary review.

One physical face pair is measured once. For example, an upper drawer's usable-cell bottom space and front-to-box bottom offset can share the same measurement while carrying separate minimum/exact intent records. This avoids contradictory independently calculated dimensions. Repeated displayed relationships are grouped only by the same relationship kind, axis, projection, displayed numeric value and intent state. All individual request/measurement IDs remain linked; this grouping makes no assertion of manufacturing interchangeability.

## Stable geometric reference edges and faces

`planning/geometryReferences.ts` supplies reusable rectangular-panel face references and a parallel-face measurement resolver. Face IDs encode physical component identity, model axis and min/max side. Edge IDs encode component identity, running axis and the two fixed min/max sides. Positions, outward normals, bounds and owning BOM/assembly links remain explicit, in engine-global millimetres. Multiple selected faces may share the same real edge; the edge registry retains all participating face IDs.

The default `parallel-panel-faces-1` preference uses FRONT for X/Y distances, RIGHT for Z, and the midpoint of the continuous overlapping projected edge interval. Witness points lie on actual source panel edges. Distance is measured **along the face normal axis**, not by Euclidean distance between witness points at possibly different view depths, and never by a foreshortened screen span.

Reference identities survive size edits, array reordering and transient BOM IDs. Relationship request IDs retain occurrence/scope meaning; physical measurement IDs identify the ordered source face pair. If a geometry edit changes which physical face supplies a usable-cell limit, the request remains identifiable and its resolved measurement/reference changes explicitly.

These geometric references are **not formal manufacturing datums**. No A/B/C datum symbols, tolerance frames or approved inspection origins are created. Typed reference policies expose future projection/station preferences. `FunctionalReferenceOverrideProposal` is a proposal-only contract with a required reason; there is no active user override or authority bypass. A future company selection/override resolver must be bound and independently validated before changing generated output. Alternative preferences which lack a continuous common station produce unsupported requests rather than fake anchors.

## Unsupported cases and revision binding

The current registered adapter accepts the existing `drawer-chest-contact-layout-3-zero-gap-back` revision, schema-v2 mm family and supported full-width carcass, square-cut inset back and existing six-panel drawer construction. Unknown engineering revisions/constructions are explicitly unsupported; invalid geometry or unreconciled BOM inputs are rejected. Missing/misoriented member roles, negative separation/interference, nonparallel reference faces, normal-to-camera measurements, absent physical overlap for a physical gap, and discontinuous projected witness stations do not receive substitute values. Diagnostics retain the affected request and source IDs. Unsupported source selection that would yield no sheets withholds the package with an explicit issue.

The frozen `FunctionalDimensionPlan` schema 1 binds the exact engineering revision, canonical source snapshot, parsed profile and `drawer-chest-functional-1` rule version. Source snapshots retain geometry, assembly/BOM membership and verification issue classifications. Render validation reconstructs the plan and details from the captured source/profile; changed source values, references, intent, crop, scale/origin, labels or coverage are rejected. External cache callers use `validateFunctionalDimensionPlan` with current inputs to assess live-model freshness. Internal snapshots prove consistency, not an approval signature or that an external design has not changed.

## Presentation, placement and profiles

Core details are **isolated, cropped real reference edges**, with unrelated context explicitly omitted. They are orthographic reference illustrations, not new physical sections, a solid assembly hidden-line view or machining geometry. `R1/R2` identify the exact source edges/faces described in each view's notes, including printed representative component occurrence IDs. Existing GA/assembly hidden-line output stays unchanged. Cropping only clips source vector edges; it never adds model geometry or cuts stock.

Small details use a labelled uniform **2:1** enlargement when space permits; other details use conventional reductions. Measured engineering values remain independent of paper scale. Dimensions use the shared vector line/extension/arrow/value renderer. A zero value gets an explicitly linked **“Measured 0 mm (coincident reference planes)”** note, never a fictitious zero-length edge dimension or an inferred joint specification.

Placement searches outward lanes around the cropped image, choosing outside arrows for short paper spans. Dimension lines/arrows/labels stay clear of image, R1/R2 labels, heading/notes and sheet bounds. Witness extensions may coincide with their own referenced edges, as intentional reference continuations. Additional reserved-region inputs provide a future layout seam; blocked placement remains `unplaced` with occurrence links and diagnostics. Expanded title blocks and both projection conventions are tested. Core display coverage partitions requests into displayed, hidden/unplaced and unsupported; supporting relationships remain explicitly deferred. These policy requirements are preliminary display choices, not approved manufacturing-release requirements.

`functionalDetailFrames` selects up to three columns with two rows, using readable slots. Default A3/A2/A1 use two FD sheets for the reference; A4 uses three. The default A3 package is now **11 sheets** and A4 **16**, while original CP/GA/assembly kind IDs remain stable. Existing numbering/prefix/revision and sequential pagination include the added sheets consistently.

Profile schema remains **3** with an additive optional boolean:

```ts
profile.contents.functionalDimensions = true; // current built-in defaults
```

Workshop and Engineering enable details by default. Missing/false preserves earlier saved-profile and legacy-options sheet selection; source relationships still remain resolved with hidden coverage reported. Save/Load retains an explicit choice and Reset adopts current defaults. There is no approval or purchasing override. Existing 414 regressions retain their pre-functional presentation matrix alongside tests of the new defaults.

## Verification and engineering review

Verification on 17 November 2026: **464 tests pass** (414 prior plus 50 functional regressions), TypeScript, lint and `npm run build -- --webpack` pass. Coverage includes source-plane/edge geometry, 900/1000/1100 mm widths, changed height/depth/counts, overlay/gap/inset/clearance edits, zero values, source intent/minimum distinction, stable identities, shared-measurement deduplication, unknown/unsupported cases, stale/tampered plans, view-specific placement, deferred diagnostics, both profiles/conventions, four paper formats with expanded title blocks, persistence/numbering, purchasing safeguards and per-page vector PDF/browser coordinate/text parity.

Hydrated production Chrome checks pass for both FD sheets, R1/R2 labels, 26/26 core coverage, depth/count regeneration, the measured 84 mm versus nominal minimum 10 mm distinction, saved detail inclusion across reload, both profiles/conventions, A4, component/assembly regressions, viewer independence, mobile overflow and stale-export cancellation. The downloaded 11-page vector PDF matches preview reference/dimension coordinates. Native FD PDF pages and A4/Engineering/first-angle browser output are visually checked for clipping and readability. Local build-artifact routing avoids environment listening-port restrictions; Chrome required execution permission. The default source has **no unresolved core relationships and no unplaced core detail dimensions**. Its 20 supporting requests are deliberately deferred, not silently counted as complete manufacturing coverage.

Engineering review remains required for approved minimum/functional clearance policies, supplier runner requirements, construction/fixing adequacy, tolerances, materials/finish/grain, loading/stability and manufacturing/inspection reference preferences. Supporting cell/offset/back-edge relationships need a later reviewed display-priority policy if they must become mandatory sheets. Signed/interfering offsets, rotated/shaped parts and arbitrary assembly families are outside this registered adapter. No drilling, machining, fixing geometry, hardware specification, DXF/DWG or CAD editor is added. `manufacturingReady` and `complianceVerified` remain **false**; **160 screws, 8 brackets and 8 runners** remain unverified allowances with purchasing quantity zero and no approved purchasing items. No commit or push is performed automatically.
