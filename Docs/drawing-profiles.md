# Phase 4C.1 — configurable drawing profiles

**Phase 5C.1 update:** [Semantic component dimensioning](component-dimensioning.md) now resolves length/width/thickness for every rectangular panel occurrence, with grouped traceability, collision-checked placement and linked normal-to-face thickness notes. GA/assembly semantics, profiles and source engineering/BOM remain unchanged.

**Phase 5B.2 update:** [Exploded assembly and subassembly drawings](assembly-drawings.md) now add EA/DS/CS sheets, scoped assembly callouts and profile-v3 migration. Current built-in A3 defaults have nine sheets; the six-sheet/panel-callout descriptions below document the earlier presentation, retained by migrated v1/v2 profiles and legacy options. Geometry, all 29 panels, four GA dimensions and false release/compliance flags are preserved.

The `/furniture` **Drawing Settings** panel configures the existing Phase 4B generator. Furniture Workshop remains the default six-sheet A3 package; Engineering selects the BS 8888 / ISO-style presentation with compliance explicitly unverified. Profiles change presentation and sheet inclusion only. Engine geometry, closed coordinates, quantities, BOM grouping, specification revisions and engineering approval evidence are unchanged.

Phase 5B adds a [revision-bound GA plan and dominant-primary layout](general-assembly-planning.md) behind the same profile API. Profile schema v2 and local persistence/migration/reset remain unchanged. Hidden supporting views now report missing nominal GA dimension coverage; hidden data stays internally resolved and reconciled. Changing drawing inputs invalidates the plan and cancels any in-progress PDF download from the old document.

Phase 5B.1 adds the optional `sheet.isometricMode` field (`visible-edges` by default when omitted, or `diagnostic-wireframe`). Existing v1/v2 profiles remain readable. Save/Load retains an explicit mode, Reset restores clean output, and Drawing diagnostics exposes the development toggle. See [visibility algorithm and limits](isometric-visibility.md).

## Profile contract and API

`DrawingProfile` in `src/drawings/types.ts` now has its own `schemaVersion: 2`, independent of the furniture and drawing-document schema versions. Phase 4C.2 adds [assembly annotation controls and v1 migration](drawing-annotations.md). `profiles.ts` supplies fresh defaults through `getDrawingProfile()` and `getDrawingProfile("engineering")`. Callers can assign their own profile ID/name and pass a typed profile to the existing `generateDrawingDocument`. The previous `DrawingOptions` argument remains supported through an adapter with new annotations off; the no-argument API uses current Workshop defaults. The generator is retained.

```ts
import { generateDrawingDocument, getDrawingProfile } from "../src/drawings";

const profile = getDrawingProfile();
profile.id = "example-joinery";
profile.name = "Example Joinery";
profile.titleBlock.companyName = "Example Joinery";
profile.titleBlock.additionalFields = [{ label: "Job reference", value: "J-042" }];
profile.sheet.projectionConvention = "first-angle";
profile.contents.cuttingList.placement = "before-components";
profile.contents.hardwareSchedule = false;
profile.numbering.prefix = "EJ";
profile.numbering.revision = "B";
// result is the current validated FurnitureResult from generateFurniture.
const drawings = generateDrawingDocument(result, profile);
```

| Configuration | Supported values / meaning |
| --- | --- |
| `id`, `name` | Stable profile identity and readable name; IDs use letters, digits, dots, underscores and hyphens. |
| `template` | `workshop` or `engineering`; neither verifies standards compliance. |
| `sheet` | Landscape A4/A3/A2/A1 and first-/third-angle placement. |
| `contents.assemblyViews` | Any distinct subset of `front`, `top`, `right`, `isometric`; an empty array omits the GA sheet. The established projection positions are retained. |
| `contents.componentDrawings` | Include or hide the grouped component-detail sheets. |
| `contents.cuttingList` | Include/hide the full nominal panel list; place its separate sheets before or after component sheets. The GA, if included, stays first. |
| `contents.hardwareSchedule` | Include/hide the separate unverified hardware allowance sheets, placed last. |
| `titleBlock` | Required project name, optional company name and up to three labelled text fields. |
| `numbering` | Prefix, explicit revision text, starting drawing number (1–999999), and `by-sheet-kind` or `sequential` numbering. |
| `hardwarePurchasing` | Fixed `approved-only` policy. Profiles cannot approve allowances. |
| `annotations` | Show/hide balloons and compact assembly list; representative/per-occurrence balloons; numeric/prefixed item labels. |
| `extensions` | Reserved branding, material-annotation and machining-annotation reference IDs; currently inert. |

`parseDrawingProfile(unknown)` validates profiles before generation and after reading local data. Unknown fields/versions, unsupported choices, duplicate projections, non-boolean visibility, invalid numbering, control characters, oversized metadata, geometry/approval overrides and executable extension content are rejected. At least one view or schedule must remain enabled. Invalid settings withhold the preview/export and display a correction; valid defaults are available through Reset.

Company/optional metadata uses extra title-block rows. Geometry viewports, notes and tables reserve that height before fitting or paginating. Mandatory units, revision, scale, projection, page numbers, preliminary status and unverified standards text remain present. Long values stay intact in the profile/document model and use the existing conservative abbreviation in title-block cells. Revision changes are explicit; choosing a profile does not stamp engineering approval or automatically increment revisions.

Internal sheet IDs (`GA-001`, `CP-001`, `CL-001`, etc.) remain stable by kind. Printed drawing numbers apply the profile prefix/start/scheme after visibility and ordering are resolved. Page positions remain `1/N` through `N/N` irrespective of the first drawing number. Schedule-only and component-only output are supported; no empty placeholder sheets are created. Scale declarations mention only included GA projections. PDF export uses the exact currently configured visible sheets and their physical sizes; lines, tables and lettering remain vector content. Company name is also included as PDF author metadata.

## Drawing Settings and browser persistence

Choose a base profile, adjust its template/size/projection and optional sheets, then inspect the live preview. Front, top, right and isometric views have independent checkboxes. Title block and numbering controls are under a compact disclosure, including company name and editable label/value metadata. The sheet selector recovers to an available sheet if the current sheet is hidden.

**Save preferences locally** stores one custom preference set in `localStorage` under `draftelm.drawing-preferences.v1`. **Load saved preferences** explicitly restores it and its base profile; there is no automatic load during server rendering or hydration. Reloading the page starts with Workshop until Load is selected. Save replaces the previous local preference set. **Reset to profile defaults** restores a fresh copy of the selected base profile without deleting the saved set. Selecting another base profile applies that profile's defaults immediately. Local changes remain usable if storage is denied, full, missing, malformed or from an unsupported version; failed loads leave active settings unchanged.

The saved envelope is now `{ schemaVersion: 2, baseProfileId, profile }`, under the same existing storage key. Validated v1 envelopes/profiles remain loadable; v1 profiles migrate with the new annotation visibility off, and Reset enables current defaults. Loads do not rewrite storage. It stores settings and metadata only: no furniture specification, geometry, component IDs, BOM, approval evidence, account, database or network request. Save assigns a custom identity derived from the selected built-in base. The local UI stores one preference set; a multi-profile company library, JSON import/export and cross-device synchronisation are future work.

## Reconciliation, omissions and hardware purchasing

Generation still checks all engineering components, BOM rows, the full component schedule and all conceptual panel details **before** applying output visibility. `document.componentSchedule`, `cuttingList`, `reconciliation` and hardware allowance traceability retain the complete internal data even when their printed sheets are hidden. Bad drawer or hardware data still withholds a GA-only document. `document.output` records included categories and omitted sections. The UI reports internal reconciliation separately from visible output; sheets with omissions carry a configured-subset note. Hiding the cutting list removes component annotations that would otherwise point to an absent schedule. Long identifiers remain internally available if their schedule is hidden.

For the reference chest, the BOM still contains **160 generic screws, eight back brackets and eight individual runners**. No engine count has been changed. These are demonstration allowances, with no approved purchasing selections. `document.hardware.allowances` retains each BOM quantity/ID and component membership alongside `verificationStatus: "unverified"`, `purchasingEligible: false` and `purchasingQuantity: 0`. The zero is an exclusion from purchasing totals; the engineering allowance quantity remains in `quantity`. `document.hardware.approvedPurchasingItems` is empty. This phase provides no approval workflow or purchasing document generator.

Included hardware sheets are headed **UNVERIFIED hardware allowances**, use **Allowance qty** as their quantity column, and state that allowances are excluded from purchasing totals. Hiding the hardware schedule preserves the same internal allowance records and exclusion policy. A profile, company label, metadata field, saved preference or engineering assumption record cannot make these allowances approved hardware. `manufacturingReady` and `complianceVerified` remain literal false in every configured output.

## Reserved company-template extensions and limits

`extensions.branding` accepts optional `logoAssetId`, `borderTemplateId` and `importedTemplateId`; `extensions.materials` and `extensions.machining` accept `annotationProfileId`. These are bounded identifier strings, with no URL, executable markup, uploaded file or raw template bytes. They round-trip through validation/storage but do not change output yet. Future support must resolve and validate those references through an explicit renderer; the current generator does not fetch or interpret them.

No logo rendering, imported drawing border, DWG/DXF upload/parser/export, supplier drilling patterns, material grades, machining instructions, accounts, database or cloud storage is implemented. Current PDF font coverage and wireframe-isometric limitations remain as documented in [the drawing foundation](drawing-foundation.md). Profiles provide preliminary presentation preferences, not company standards certification, BS 8888 compliance or a manufacturing release.

## Regression coverage

`tests/drawingProfiles.test.ts` covers default/Engineering selection, legacy API compatibility, all 127 nonempty visibility combinations, empty-output rejection, hidden-part reconciliation, both numbering schemes and placement orders, exact allowance quantities and purchasing exclusion, local preference round-trips, reset defaults, corrupt/blocked/quota-limited storage, hostile profile fields, reserved extension handling, metadata spacing across every sheet size, and configured vector-PDF pagination/text/page sizes. The existing engineering/viewer/drawing regressions remain enabled.

Verification on 16 November 2026: **234 tests passed** (199 existing tests plus 35 profile regressions), TypeScript and lint passed, and the production build passed with `npm run build -- --webpack`. The default Turbopack build was attempted, including an escalated retry, but its CSS worker could not bind a local port (`Operation not permitted`). No build configuration or dependency changes were made.

Chrome checks passed against the hydrated production app using local build-artifact request interception, without a listening server. They exercised profile/template selection, sheet toggles and placement, A4/A3 preview updates, company metadata and numbering, Save/Reset/Load and persistence across reloads, a configured two-page PDF download, empty-output recovery, exact 160-screw presentation, viewer-explosion independence, corrupt-preference recovery and mobile overflow. Browser launch required execution permission; ordinary local-server startup remains restricted. These checks verify application behaviour, not standards or manufacturing approval.
