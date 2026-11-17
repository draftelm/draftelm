# Phase 5B.1 — clean vector general assembly isometric

**Phase 5B.2 update:** [Exploded assembly and subassembly drawings](assembly-drawings.md) now add EA/DS/CS sheets, scoped assembly callouts and profile-v3 migration. Current built-in A3 defaults have nine sheets; the six-sheet/panel-callout descriptions below document the earlier presentation, retained by migrated v1/v2 profiles and legacy options. Geometry, all 29 panels, four GA dimensions and false release/compliance flags are preserved.

The GA isometric now defaults to **visible panel edges with solid-panel hidden-line removal**. The reference chest produces 53 visible vector fragments instead of the previous 348 transparent wireframe edges. All four decorative fronts, their separation boundaries, exposed top/right/base edges and visible component seams remain. Concealed back and drawer-box edges are removed by actual solid occlusion, not by a component-role filter or replacement cabinet outline.

The existing dominant-primary layout, front/top/right projections, four semantic dimensions, six-sheet A3 package, source revision, BOM, numbering, parts list and component sheets remain. Source geometry and the Three.js viewer are unchanged. The viewer still has its own interactive camera/poses; drawings use the closed engineering result.

## Geometry and visibility algorithm

`src/drawings/edgeVisibility.ts` operates on the existing axis-aligned `PanelComponent` boxes, in engine millimetres. It supplies their twelve actual edges, a shared camera direction and an analytic visibility test. `projections.ts` projects the resulting fragments into the existing drawing-line model.

1. **Deterministic camera:** the existing isometric image basis remains `u = (X+Z)/sqrt(2)`, `v = (-X+2Y+Z)/sqrt(6)`. Rays towards the camera use `(1, 1, -1)`, showing front, top and right. First-/third-angle conventions change supporting-view placement, not camera or geometry.
2. **All solids occlude:** inspect every physical panel, including the source panel itself. Self-occlusion removes back-facing box edges. Hardware anchors/envelopes are unverified, are not panel solids and create no occlusion or invented fitting geometry.
3. **Continuous interval clipping:** a source edge is `p(t) = a + t*(b-a)`, `0 <= t <= 1`. It is hidden wherever `p(t) + s*camera` enters a solid for positive `s`. Each axis gives linear lower/upper bounds on `s`. Eliminating `s` by requiring every lower bound to be less than every upper bound yields one convex hidden interval in `t` per occluder. Subtract that interval from the remaining visible edge intervals. Partial coverage can split one edge into multiple visible fragments. This is not a painter sort, midpoint visibility guess or raster depth buffer.
4. **Broad phase:** bounds of camera-invariant `X+Z` and `Y+Z` reject solids whose projected bounds cannot cover an edge. This is conservative; the analytic ray/box inequalities decide actual occlusion. Stop testing an edge once no visible intervals remain.
5. **Projection and overlap handling:** project visible interval endpoints, group collinear edges by their known model-axis direction and line offset, then split overlapping spans at their endpoints. Each span retains exactly the visible component memberships that cover it. Merge adjacent spans only when their memberships match. Coincident visible panel seams stay visible, with both component IDs where appropriate; hidden components do not acquire references merely because an unrelated edge projects to the same location.

Source iteration and output grouping are deterministic under input component-array reordering. Fragment IDs identify generated presentation geometry, not permanent topology or new part numbers. Original component and assembly IDs remain on each line; the complete viewport/plan references still include all 29 panels, including those with no visible line.

### Numerical handling

The shared **0.000001 mm** epsilon is computational only, never a manufacturing clearance or tolerance. Ray tests use open box interiors inset by this epsilon, preventing exact face contact from falsely hiding a visible seam. A positive ray-distance threshold avoids self-contact at the start point. Fragments at or below four epsilon lengths are discarded to remove numerical endpoint slivers; projected collinearity/endpoints are merged within one epsilon.

Coplanar contact, identical overlapping boxes, partially overlapping solids and sub-epsilon near-coplanar fixtures are covered by tests. Surfaces/gaps within the computational epsilon are intentionally indistinguishable; this method is not a precision claim at arbitrary scales. The validated engine's panel dimensions are many orders larger. Degenerate/non-finite/nonpositive panel extents are rejected by the existing bounds checks. Future physical geometry at epsilon scale requires a reviewed numerical policy; it must not be assumed supported.

## Shared rendering, annotations and revision integrity

`isometricLines(panels)` now defaults to clean output. The optional second argument `"diagnostic-wireframe"` retains all twelve edges per panel. `generateDrawingDocument` remains the facade; both browser SVG and PDF consume its same clipped line entities through `plotSheet`. No raster screenshot/image is embedded. PDF tests match every isometric browser-plot segment to decoded vector path coordinates and reject image objects.

The GA plan records effective isometric mode, camera direction, numerical epsilon and visibility algorithm version (`solid-panel-edge-intervals-1`), with a bumped planner version. The profile snapshot binds the optional diagnostic setting. Old/inconsistent cached plans are rejected, and geometry/profile changes regenerate visible fragments alongside dimensions. Shared document validation recomputes the expected visible representation before rendering/export. The existing input-change export cancellation remains active.

Balloon placement still derives anchors from actual model edges. It now requires a matching **clipped visible line fragment** and uses the same ray/solid visibility kernel as edge removal. Independent annotation validation checks membership, attachment, visibility and layout. Candidate anchor sampling remains conservative; a short or awkward visible fragment can receive an explicit unplaced diagnostic rather than a fabricated attachment.

For the reference default there are still three representative balloons. Item groups **1 (back), 4 (bottoms), 5 (box fronts/rears), and 7 (drawer sides)** remain concealed/unplaced. Visible-occurrence mode retains the existing exterior-occurrence coverage; all concealed occurrences remain in the reconciled item/parts/cutting lists. Hidden-line removal does not claim every panel has an exterior view or manufacturing drawing coverage.

## Profiles and diagnostic mode

Both Workshop and Engineering use clean output by default. An additive optional profile-v2 setting is accepted:

```ts
profile.sheet.isometricMode = "visible-edges";        // default when omitted
profile.sheet.isometricMode = "diagnostic-wireframe"; // development inspection
```

No profile-version/storage-key bump is needed: existing v1/v2 profiles omit this optional field and generate clean output. New saved preferences retain an explicitly selected mode. Invalid enum values remain rejected. Reset returns to clean built-in defaults. The compact **Drawing diagnostics** disclosure in Drawing Settings exposes the wireframe toggle. Diagnostic output is labelled **DIAGNOSTIC WIREFRAME** and explicitly says hidden edges are not removed, in SVG and PDF. It cannot approve hardware, standards compliance or manufacturing release.

## Supported cases and limits

Supported: opaque axis-aligned rectangular panels at existing global engineering positions; front/top/right-facing isometric edges, silhouette and component boundaries; complete/partial/self occlusion; coplanar seams and coincident/overlapping edge spans; different validated dimensions and drawer counts. All occluders participate regardless of name/role. If an internal panel has a genuinely exposed edge, the same algorithm can retain it.

Not supported: rotated/curved panels, arbitrary triangle meshes/B-reps, holes, rebates, transparency/material-dependent visibility, perspective/arbitrary drawing cameras, dashed hidden-line output, shaded surfaces or new intersection curves created by a Boolean solid union. This renderer clips existing engineering box edges and preserves component seams; it does not invent intersection features. Exact-contact/near-epsilon cases follow the stated numerical policy. No unresolved visual defects were found in the tested closed chest, resized chest, drawer-count fixtures or contact/overlap cases; this is not a general CAD hidden-line certification. Exploded and drawer subassembly drawings remain reserved for Phase 5B.2.

Hardware remains **160 screws, 8 brackets and 8 single-side runners**, all unverified allowances with zero purchasing quantities. Manufacturing readiness and compliance verification stay false. No dimensions, tolerances, machining, approved material/hardware claims, imports or DXF/DWG functionality are added.

## Performance and verification

The basic bound is quadratic in panel count (12 source edges per panel against all panel boxes), plus collinear span subdivision. Broad-phase rejection and early termination reduce typical work. There is no new library, GPU/canvas dependency or rasterization stage. Shared validation intentionally recomputes geometry at output boundaries, so large packages have additional cost per plotted/exported sheet. A spatial index/cached immutable resolver may be appropriate if later models grow substantially; stale-source checks must survive any cache.

Local non-gating timing samples after warmup were about **4 ms** for a 29-panel projection, **9 ms** for 77 panels and **30 ms** for 389 panels; whole-document generation was approximately **50 / 75 / 550 ms** respectively. The larger fixtures used 12/64 drawers with sufficient cabinet height. These are development-machine observations, not guarantees or performance acceptance thresholds.

**323 tests pass** (306 prior plus 17 new), TypeScript and lint pass, and the Webpack production build passes. New tests cover nine visible edges of a single box; full/partial/narrow occlusion; coplanar/overlapping/near-coplanar geometry; all four reference drawer-front rims; no concealed rear/interior references; independent Three.js ray-intersection checks on source and resulting edges for 1/4/8 drawers; profiles/conventions; deterministic IDs; persisted diagnostic preferences; stale regeneration; semantic dimensions/BOM/hardware integrity; and shared vector PDF paths. Existing large-count, component/schedule and page-layout tests also pass.

Chrome inspection used the actual hydrated production artifacts via Playwright routing (local listening ports are restricted). Checks covered 53 clean versus 348 diagnostic edges, three balloons/list, mode Save/Load/Reset, both profiles/projections, resized dimensions, unchanged drawings during viewer explosion, hidden supporting views, A4 AP overflow, mobile bounds, stale-export cancellation and six-page PDF download. Isometric PDF vectors matched browser SVG coordinates. The exported Engineering PDF was additionally rendered with macOS Core Graphics and visually inspected alongside Workshop/first-angle/resized browser captures: opaque surfaces, drawer separations, readable tables/dimensions and no visible transparent interior edges. The default Turbopack build was attempted but still fails when its CSS worker binds a restricted local port; the Webpack production build succeeds without configuration/dependency changes.
