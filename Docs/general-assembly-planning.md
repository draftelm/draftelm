# Phase 5B — revision-bound general assembly planning

**Phase 5B.2 update:** [Exploded assembly and subassembly drawings](assembly-drawings.md) now add EA/DS/CS sheets, scoped assembly callouts and profile-v3 migration. Current built-in A3 defaults have nine sheets; the six-sheet/panel-callout descriptions below document the earlier presentation, retained by migrated v1/v2 profiles and legacy options. Geometry, all 29 panels, four GA dimensions and false release/compliance flags are preserved.

The existing drawing generator now resolves a reusable semantic GA plan before arranging sheets. The reference chest uses a large parallel isometric primary view, with front, top and right supporting views. Browser SVG and vector PDF consume the same generated document and plan. This implements the small GA slice of the [architecture roadmap](drawing-architecture-roadmap.md#5-recommended-phase-5b-slice), not the complete [manufacturing specification](drawing-manufacturing-specification.md).

The default A3 Workshop package still has six sheets, seven panel items and all 29 physical panel IDs. The reference primary isometric fits at **1:10**, with aligned supporting orthographic views at **1:20**. Phase 5B originally used transparent wireframe. [Phase 5B.1](isometric-visibility.md) now defaults to solid-panel hidden-line removal and retains an explicitly labelled diagnostic wireframe option. No furniture geometry, engine formulas, component IDs or BOM calculations change.

## Model and modules

| Module | Responsibility |
| --- | --- |
| `src/drawings/planning/types.ts` | `GeneralAssemblyPlan`, semantic dimensions, extent references, physical corner anchors, view intents, source bindings and limited coverage diagnostics. |
| `planning/gaPlan.ts` | Source identity adapter, registered family policy, canonical input snapshots, geometry-based dimension resolution, plan validation and the adapter into existing 2D `DrawingDimension` objects. |
| `planning/gaLayout.ts` | Paper-space view regions and a reserved compact-list slot, selected by the plan's explicit layout strategy. |
| `planning/gaValidation.ts` | Plan/document consistency, source/BOM/annotation reconciliation and GA view/dimension/geometry validation at generation and rendering boundaries. |
| Existing `generate.ts`, projections, annotation/layout/plot modules | Retained facade, panel and schedule generation, visible balloon attachment, paper fitting and shared vector rendering. |

`GeneralAssemblyPlan.schemaVersion` is **1**. It contains engineering source identity/revision, versioned planning/resolver bindings, view intents, four semantic dimensions and links to existing balloon/item/parts-list entities. It has no sheet rectangles, text styling, paper offsets or plotted scale. Those remain downstream presentation data. The new plan is recursively frozen after creation without freezing or modifying the input result/profile.

Each dimension has a stable semantic ID, meaning, millimetre value, model-axis measurement, source envelope extrema, actual component-corner anchors, BOM/component/assembly references and relevant views. All panels attaining an extreme are retained, with deterministic representative corner selection independent of source array order. Reference context is engine-global millimetres; inspection datums are **not assessed**, tolerances are **unspecified**, and manufacturing variants are **not assessed**. These explicit states are extension points, not approved engineering decisions.

| Stable ID | Meaning / source | Display | Reference value |
| --- | --- | --- | ---: |
| `overall-width` | Closed assembly panel envelope, X | Front | 900 mm |
| `overall-height` | Closed assembly panel envelope, Y | Front | 850 mm |
| `carcass-depth` | Carcass panel envelope, Z | Top | 500 mm |
| `overall-depth` | Closed assembly panel envelope including decorative fronts, Z | Right | 518 mm |

Values use validated component positions and extents, not specification dimension duplicates, viewer transforms, projected isometric lengths or editable labels. The front projection at Z = −18 and carcass rear at Z = 500 explain 518 mm. The existing 2D adapter projects actual source corners for extension lines while retaining true model-axis measurement values.

## Revision binding and use

```ts
import {
  createGeneralAssemblyPlan, generateDrawingDocument,
  getDrawingProfile, validateGeneralAssemblyPlan,
} from "../src/drawings";

const profile = getDrawingProfile();
const planned = createGeneralAssemblyPlan(result, profile);
if (!planned.plan) throw new Error(planned.issues.join("; "));

// Optional cache/reuse: reject changed engineering, profile or annotation inputs.
const issues = validateGeneralAssemblyPlan(planned.plan, result, profile);
if (issues.length) throw new Error(issues.join("; "));
const generated = generateDrawingDocument(result, profile, planned.plan);

// Ordinary callers continue using this facade; it creates a fresh plan each time.
const regenerated = generateDrawingDocument(result, profile);
```

Bindings retain the existing `specificationRevision` verbatim and canonical JSON snapshots of the available engineering result, parsed profile, semantic annotation inputs, and planner/resolver versions. Snapshot normalization sorts source component/assembly/BOM records and membership IDs; incidental array reordering does not make a plan stale. Geometry positions, BOM quantities, settings/title-block revisions and semantic annotation changes do. Rendered placements are excluded from the semantic annotation binding. These are exact consistency snapshots, **not cryptographic hashes, signatures, trusted approval or a historical revision registry**.

Supplying a stale or altered plan returns no document and reports a regeneration requirement. A valid supplied plan is validated then freshly resolved, so subsequent mutation of the caller's cached object cannot alter the generated plan. Generation validates the finished document. Shared plotting and PDF export validate its captured source/plan/profile, semantic displays, projected geometry and annotation relationships again. Plotting rejects a sheet from a different document. Invalid preview data produces an alert instead of SVG output.

The drawing UI regenerates on engineering/profile changes. PDF export captures one document and its filename settings; a live drawing input change during the asynchronous export cancels the download with an explicit message. Viewer-only drawer/explosion transforms do not change the drawing plan. Plans are not stored in local preferences.

**Boundary:** validation against a captured snapshot proves internal consistency, not that it is the latest external design. External cache users must call `validateGeneralAssemblyPlan` with current inputs. The existing result does not expose every future manufacturing metadata/evidence dependency; those contracts and authorised release assessment remain deferred. No approval can be inferred from this binding.

## View policy, layout and profile compatibility

There is an explicit `drawer-chest` family policy and `drawer-chest-primary-and-supports-v1` layout strategy. `FurnitureResult` currently has no family discriminator, so the adapter reads identity from the documented canonical engine revision's schema-v2 specification parameters. It reads no engineering formulas. The carcass relationship is resolved through the known schema-v2 chest assembly contract and validated parent/membership relationships. A future engine revision format or furniture family requires a registered adapter/policy/layout strategy; unknown or malformed source identities are rejected with diagnostics rather than receiving an assumed chest layout.

For the chest, isometric is preferred and gets a larger individual region than any supporting view. Supporting front/top/right views retain shared scale and alignment. Third-angle places top above front and right to its right; first-angle places top below front and right to its left. The compact list uses the spare supporting-grid region (upper right in third-angle, lower left in first-angle); insufficient space moves it to numbered AP sheets. Existing readable font sizes and continuation behavior remain. A4/A3/A2/A1 and both built-in templates are covered by layout tests. The old `gaFrames` export remains available, but current generation uses the plan-specific layout.

Profile-v2 settings, local Save/Load/Reset, v1 migration, legacy `DrawingOptions`, sheet inclusion, numbering and metadata are preserved. No persisted configuration schema change is required. Legacy options still leave annotations off; they now use the new GA layout rather than preserving historical equal-cell scales.

Profile visibility is respected. Hiding isometric selects an available orthographic primary and records the fallback. Hiding a dimension's supporting view leaves its semantic value/source intact but records missing displayed coverage. The UI and GA footer report the incomplete nominal dimension subset. Hiding all GA views creates no empty GA/AP sheet. Preliminary subset export remains permitted; this does not satisfy manufacturing coverage or enable release. Current coverage measures **only these four nominal GA dimensions**, not functional, component manufacturing or inspection completeness.

## BOM, annotations and engineering limits

The existing membership-based item numbering and annotation model remain authoritative. The plan links their IDs without creating another BOM or merging parts by equal dimensions. All 29 occurrence IDs and seven existing blank groups remain reconciled even when output is hidden. No new manufacturing-variant equivalence is asserted; future feature/finish distinctions require validated metadata and a separate conserved variant partition.

The reference one-per-item setting still places three reliable exterior representative balloons. Back, drawer bottoms, drawer box fronts/rears and drawer sides (items 1, 4, 5 and 7) remain explicitly unplaced because they are concealed. Visible-occurrences mode places eight exterior occurrences, leaving 21 concealed. All remain internally traceable and included in the parts list/cutting list when enabled. No hidden panel is given a fabricated visible attachment.

Hardware remains **160 generic screws, 8 back brackets and 8 individual runners**, all unverified demonstration allowances with purchasing quantity zero and no approved purchasing items. `manufacturingReady` and `complianceVerified` remain false. There are no new tolerances, datums, functional manufacturing dimensions, holes, machining geometry, material/finish assumptions, supplier details, approvals, CAD editing, imported templates or DXF/DWG exports.

Engineering review is still needed to define functional dimension requirements, approved reference edges/datums, tolerance/evidence authority, manufacturing variants and release coverage. The clean box-edge isometric added in Phase 5B.1 does not replace sections, feature-aware views or detail capabilities needed by more complex furniture.

## Verification

Phase 5B: **306 automated tests pass** (274 existing plus 32 new tests), alongside TypeScript, lint and `npm run build -- --webpack`. Tests cover all four dimension values/source references, size and valid drawer-count edits, stale/tampered plans and presentations, reordered source arrays, both templates/conventions across four sheet formats, collisions, hidden settings, source/BOM identities, hardware exclusion and vector PDF content. Existing profile persistence, component and schedule regressions remain in the suite.

Chrome checked the hydrated production artifacts, dominant primary layout, four displayed values, existing balloons/list, geometry regeneration, profile/projection changes, hidden-view coverage, local preferences, A4 AP fallback, mobile overflow, viewer independence and six-page vector PDF download. A delayed export followed by a dimension change produced no download and reported cancellation. Browser inspection used local production artifacts fulfilled through Playwright routing because local listening ports are restricted. The default Turbopack build was attempted but its CSS worker could not bind a port; the Webpack build passed without dependency or configuration changes. These checks establish preliminary consistency, not standards compliance or manufacturing approval.
