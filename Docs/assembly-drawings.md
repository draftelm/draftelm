# Phase 5B.2 — exploded assembly and subassembly drawings

**Phase 5C.1 update:** [Semantic component dimensioning](component-dimensioning.md) now resolves length/width/thickness for every rectangular panel occurrence, with grouped traceability, collision-checked placement and linked normal-to-face thickness notes. GA/assembly semantics, profiles and source engineering/BOM remain unchanged.

The default A3 Workshop and Engineering packages now contain **nine sheets**: GA, exploded assembly (EA), reusable drawer subassembly (DS), carcass subassembly (CS), three component sheets, cutting list and unverified hardware schedule. Existing component drawings, seven blank groups, all **29 physical panel occurrences**, geometry/BOM formulas and the four GA measurements remain unchanged. First-/third-angle supporting-view placement and the clean closed GA isometric remain as established in [Phase 5B.1](isometric-visibility.md).

## Identity and hierarchy

`planning/assemblies.ts` builds a read-only documentation index from actual `Assembly.parentId`, `Assembly.componentIds` and component ownership. It reuses the engine's semantic IDs: `chest`, `chest/carcass`, and `chest/drawer-1` through `chest/drawer-4`. Membership is not inferred by splitting ID paths. Cycles, orphans, duplicate ownership, missing components and unsupported chest structures are rejected.

Three identities remain separate:

- A component occurrence is one physical panel, such as `chest/drawer-1/left`.
- Its reusable nominal blank type is the existing source panel BOM line. Two side occurrences may link to the same blank. This is not an approved finished-part registry.
- An assembly is a parent/group of components, never a manufactured panel or an extra cutting-list quantity.

The reference parent has one carcass and four drawer children. The carcass has five panels; every drawer has its actual **six** panels: decorative front, two sides, box front/rear and bottom. Hardware memberships remain indexed separately; they do not become approved geometry or purchasing data.

`AssemblyDrawingPlan` schema 1 records the hierarchy, deterministic equivalent-layout groups, representative IDs, occurrence-to-representative panel maps, and sheet decisions under `rectangular-assembly-layout-1`. The current registered drawer-chest policy explains why these sheets add visibility. Profile switches select its output; they do not impose a universal sheet requirement on future furniture families. Unknown families need an explicit engineering-source adapter and drawing policy, as in the existing GA planner.

## Scoped callouts and quantities

The global `document.drawingAnnotations` remains the seven-group panel identity used by cutting/component schedules and the GA semantic binding. Sheets may have a separate `annotationModel` with `assembly-scope-v1` semantics:

| Sheet | Reference list / balloon scope | Reference quantities |
| --- | --- | --- |
| GA | Top-level equivalent assemblies | Carcass 1; drawer assembly 4 |
| EA | Five individual carcass panels plus the drawer assembly group | Five panel occurrences at 1 each; drawer assembly 4 |
| DS | Six actual panels of one representative drawer | Each local occurrence 1; drawing applies to 4 mapped assemblies |
| CS | Five actual carcass panels | Each local occurrence 1 |

These lists partition the relevant leaf membership. Assembly summary quantities are never added to panel cutting quantities. A source blank shared between carcass/drawer roles retains its original BOM identity and gets only the local occurrence quantity. Local panel rows distinguish left/right, top/bottom and front/rear using panel orientation and position in the actual scope envelope; names are copied from the source. Nominal L × W × T and material text comes from the source blank. No drilling, joint, clearance, tolerance or fixing detail is derived from the drawing layout.

GA callout level can be switched to the older panel-BOM grouping. Item numbers are local deterministic labels, not company part numbers. Prefixed labels use `A` for assemblies and `P` for panels. In visible-occurrences mode, a root assembly balloon request refers to all panels of one assembly occurrence; it does not treat those panels as individual root items.

The default GA has **two** reliably placed assembly balloons. EA has **six**, DS **six**, CS **five**, with no unplaced default requests. Four box-front panels remain completely concealed inside the rigid drawers on EA and are explicitly reported. DS exposes all six constituents, including the box front. Reference EA/DS/CS have no residual overlaps between independently exploded panel silhouettes. Normal occlusion within each deliberately rigid drawer group is retained.

## Equivalent drawer drawings

Grouping compares the complete existing panel layout relative to its envelope: source name/material, dimensions, quantity, thickness/orientation and relative positions. Existing hardware allowance definitions, quantities and relative positions also participate. Coordinate subtraction is normalized to nine decimal places only to cancel floating-point translation noise. A change in panel geometry, material, orientation, relative placement or hardware allowance splits the group and creates another DS sheet. Source array order has no effect.

Every group retains a bijective panel occurrence map for each assembly, including all 24 drawer panels in the reference. Equivalent source panel layouts justify reuse of this preliminary illustration only. **Manufacturing interchangeability is not assessed.** There are no approved machining, finish, grain or installation definitions to compare. Future metadata/features must extend the equivalence contract before such differences can be considered interchangeable.

## Presentation scenes and visibility

`planning/explosion.ts` supplies deterministic translations in engine millimetres. It never edits source coordinates, sizes, quantities or assembly positions. Engine component positions are already global; `Assembly.position` is not added again. The Three.js viewer's metre-based animation plan stays independent.

1. Explode panels along their existing thickness axes, on the side of their assembly-envelope centre. Multiple parallel front/rear panels get deterministic separation ranks.
2. Increase spacing in a bounded search. Convex projected box silhouettes and a separating-axis test avoid the excessive gaps caused by rectangular projected bounds. The 25 mm model-space display gap is an illustration preference, not a physical clearance/tolerance.
3. On EA, retain each drawer rigidly, arrange drawers in their physical bottom-to-top order to the left of the exploded carcass, and translate those groups into disjoint projected bounding regions. This packing is explicitly presentational; it is not a disassembly motion or process sequence.
4. Clone panels at their translated positions, then run the same visible-edge projection and vector solid-panel hidden-line removal as the GA. Hardware allowances are not projected or used as approved fitting solids.

`DrawingViewport.presentationOffsets` records translations by physical component ID. Balloon points/edge endpoints belong to that viewport scene, with source occurrence/assembly/BOM links retained. Independent validation reconstructs translated panels, checks physical visible edges and leader attachment, and rejects mismatched BOM references. Inverting the recorded translation recovers the source point; these attachment points are not machining anchors.

Sheet diagnostics list unresolved silhouette pairs when the bounded search cannot separate them, and every panel with no exposed edge in the exploded scene. Balloon requests have a placed result or explicit no-visible-edge/layout diagnostic when enabled. Browser disclosures identify IDs; sheet footers print counts, including zero. Preview visibility uses the same clipped fragments as export. Short fragments/readability or very crowded/small sheets can still leave a request unplaced; no fabricated attachment is supplied.

## Layout, profiles and revision integrity

`assemblySheets.ts` arranges the exploded cabinet view and assembled/exploded subassembly views. Parts lists keep fixed readable lettering. Overflow moves to EAL/DSL/CSL continuation sheets; the view then reclaims the available sheet width. Continuation quantities print only once. GA keeps its original reserved list slot/AP fallback. Stable EA/DS/CS sheet-kind IDs participate in existing numbering, prefix, revision, projection symbol and title-block handling; sequential numbering follows the selected package order. References in scoped assembly rows explicitly name stable **sheet IDs**, independent of the configured drawing-number prefix/start/scheme.

Profile schema **3** adds:

```ts
profile.contents.assemblySheets = { exploded: true, drawers: true, carcass: true };
profile.annotations.gaLevel = "assemblies"; // or "panels"
```

Both built-ins enable the new sheets and use assembly-level GA callouts. Saved v1/v2 profiles migrate to v3 with the new sheets off and panel-level GA callouts, preserving previous output; v1 also retains annotations off. Legacy `DrawingOptions` keeps that previous presentation. Save writes a v3 preference envelope under the existing local storage key; load accepts envelopes 1–3 without rewriting them. Unknown future versions/fields, invalid enums and non-boolean switches remain rejected. Reset adopts the current built-in defaults.

The engineering source/profile snapshot in the existing immutable GA plan binds the new decisions. `validateGADocument` reconstructs the hierarchy, equivalence, scenes, scoped identities/quantities, translations, visible geometry and visibility diagnostics at generation and both render/export boundaries. Stale reusable GA plans remain rejected. PDF downloads still cancel when inputs change during export. `plotSheet` supplies identical paper-mm vector primitives to SVG and PDF; no raster screenshot is used.

## Verification and engineering limits

Verification on 17 November 2026: **366 automated tests pass** (323 prior regressions plus 43 assembly regressions), TypeScript, lint and `npm run build -- --webpack` pass. The old panel-level regression matrix remains explicit alongside the new default assembly matrix. Coverage includes 900/1000 mm widths; 1/3/4/6/12 supported drawers; both profiles/projection conventions; A4/A3/A2/A1 bounds; differing layouts; hierarchy faults; conservation/immutability; numbering, inclusion, migration/persistence; readable continuation tables; tampered/stale source data; explicit hidden/unplaced results; and per-page decoded PDF/preview vector equality.

Hydrated production Chrome checks pass for hierarchical/panel GA callouts, all three new previews and sheet switches, 900/1000 mm and 4/3-drawer regeneration, both profiles/conventions, saved preferences across reload, viewer independence, stale-export cancellation, A4 fallback, hardware exclusions and mobile overflow. The downloaded nine-page vector PDF matches browser assembly segment coordinates. Native PDF renders of the GA/EA/DS/CS layouts and the A4 browser layout were visually inspected. Local artifact routing was used because this environment restricts listening ports; Chrome required execution permission, and the established Webpack build avoids the blocked Turbopack worker-port path.

`manufacturingReady` and `complianceVerified` remain **false**. Hardware stays at **160 screws, 8 brackets, 8 runners**, all unverified allowances, purchasing quantity zero, no approved purchasing items. Engineering review is still required for joints/fixings, installation, machining, tolerances, materials/finish/grain, loads/stability, manufacturing equivalence and release criteria. These drawings cover existing opaque axis-aligned rectangular panels, with one deterministic isometric camera; rotated/shaped parts, general hierarchy-family policies and dense arbitrary assemblies need additional reviewed rules. There is no full dimensioning engine, DXF/DWG export, assembly process specification or BS 8888/ISO compliance claim.

No automatic commit or push is performed.

## Contextual section extension (5C.2B)

[Section A-A and detail B](contextual-assembly-sections.md) use real assembled panel intersections, preserving all assembly/occurrence/BOM identities. They fit below the carcass list on A1 or use cross-referenced SC continuation pages on smaller formats. Existing isometrics, balloons, parts lists and GA remain unchanged; functional FD coverage is retained.
