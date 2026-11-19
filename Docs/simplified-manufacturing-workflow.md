# Simplified manufacturing workflow — Phase 5D.3

Implemented 19 November 2026. This builds on [panel properties](panel-manufacturing-properties.md) and [their visible integration](visible-panel-manufacturing-properties.md). It changes the workshop editing/presentation workflow, without changing furniture geometry, engineering BOM formulas, release authority or nominal blank dimensions.

## Basic workflow

Open `/furniture` and select a **Physical panel occurrence**. The selector shows the source component name and stable occurrence ID; selection remains linked to the existing 3D inspector. New sessions start in **Basic** mode.

1. Enter an optional material description, select grain direction, and specify the displayed face's decorative/visible role and good-face requirement. Material description refines the existing engineering stock; it cannot replace that stock. Both faces retain independent finishes.
2. Click **Top**, **Bottom**, **Left** or **Right** on the diagram. The selected physical edge is blue; an assigned treatment is amber when unselected. Dashed edges are unknown; dotted edges explicitly have no treatment. Controls are also keyboard accessible with Tab and Enter/Space.
3. Choose **Not specified**, **No treatment** or **Specified treatment**. **Add edge banding** creates a generic provisional proposal. It does not invent a specification code, material, thickness or process. Missing fields are flagged; the treatment can be applied as incomplete preliminary data.
4. **Apply panel properties** updates that occurrence's drawing and schedule. Pending values remain a draft until Apply. **Undo draft change** reverses the last field change (up to 40 steps); **Reset draft changes** restores applied values and can itself be undone. These controls do not erase the separately saved local document.

Switching Basic/Advanced preserves every pending field. Flipping/rotating the diagram preserves the selected physical edge and pending edits. Applying/loading values preserves the current face, diagram rotation and loaded presets. Choosing another occurrence starts that occurrence's form; apply pending edits before changing occurrence. Local Save/Load still saves the applied source-bound document, not unapplied form text.

**Advanced** exposes manufacturer material codes, directional grain sense, the selected edge's nominal treatment thickness/material/appearance/process reference, signed axes and stable physical references. Supplied grade, matching, process and verification records remain inspectable in a read-only source record. This simple editor does not author approval evidence, stock replacement, grade verification, advanced matching groups or full process definitions. It preserves those supplied fields. Editing one edge attribute retains unchanged nested material grades/codes, appearance and process notes; changing face role retains unchanged good-face requirement identities.

The reference chest stays unspecified by default. All UI-authored specifications are provisional. The opt-in synthetic example and its exit/restore behaviour remain available; every exported example page is labelled synthetic. No example becomes approved purchasing or manufacturing data.

## Face orientation and physical edge mapping

`src/manufacturing/panelView.ts` derives an orthographic diagram from the existing topology; it does not change the panel's physical frame or source coordinates.

- A is the broad face at local T=0; B is the opposite broad face. Neither implies a good/decorative face.
- The initial diagram prefers model +Y up, or +Z for horizontal panels. Its horizontal basis is derived from the displayed face's outward normal and that up direction, using the existing X-right/Y-up/Z-rear display convention.
- Each perimeter surface's outward world normal is projected into this display basis to choose Top/Bottom/Left/Right. The selected state stores the existing **physical edge key**, not a screen-side string.
- Diagram rotations are quarter turns of the display basis only. Face flipping is evaluated with the same rotation. At 0°/180° it exchanges displayed left/right; at 90°/270° it exchanges displayed top/bottom. The highlighted physical edge moves accordingly. No orientation override, treatment reassignment or new engineering revision is created by these controls.
- For the ordinary +X/+Y/+Z front panel at 0°, face A maps Left→u-min, Right→u-max, Top→v-max, Bottom→v-min. On B, left/right exchange. Signed/reversed U/V/normal axes and swapped in-plane axes resolve from actual normals, without sorting long/short lengths.
- Grain remains longitudinal U or transverse V in saved data. Basic labels describe the corresponding displayed width/height; arrows follow the mapped axis and preserve supplied directional sense. No matching between different fronts is inferred.

The diagram is schematic with a minimum visible face span for selection; it is not a scaled cutting template. Actual edge lengths are stated beside the selected-edge controls. PDF component maps retain their established canonical drawing orientation and scales, with stable physical edge labels; an editor diagram rotation does not rotate the manufacturing model or rewrite its drawing references. Arbitrary oblique source rotations remain outside the current axis-aligned panel contract.

## Treatment states and reusable presets

`EdgeTreatment.specificationId` is now optional for an explicitly assigned but incomplete generic proposal. Existing string-valued specifications and stored documents remain valid. Absence means **unknown**, not not-applicable or an invented generic manufacturer code. Validation emits an unresolved diagnostic at the treatment's specification path. Missing specification references prevent manufacturing equivalence even if caller-supplied parent/child verification records otherwise exist. No thickness allowance or dimensional deduction is calculated.

Project/company edging presets contain a name, scope label and the editable treatment fields only. Users explicitly save/load them with **Manage local edging presets** and choose a preset for the selected physical edge. Saving a matching scope/name explicitly replaces that local preset; otherwise the saved collection is merged. The separate `draftelm.edging-presets.v1` localStorage key retains up to 50 proposals. The parser rejects unsupported fields (including approval claims), duplicate IDs and invalid thicknesses. Applying a preset changes only the pending selected-edge draft; Apply and any bulk review remain required.

Scope is a local reuse label in this single-project workflow, not an authenticated company catalogue, controlled company definition or supplier integration. Presets do not carry verification records. Saving reusable presets is disabled during the synthetic example. Manufacturing property Save/Load retains the existing `draftelm.panel-manufacturing.v1` envelope and revision checks.

## Bulk editing safeguards

Expand **Apply to several panels**, explicitly check each physical occurrence and review the complete ID list. **Review bulk changes** validates the proposed document before showing confirmation. The review includes all editable values, including unknowns, and the exact affected IDs. Applying to multiple occurrences is disabled until that review is confirmed.

The domain review captures the sorted scope, exact draft fingerprint and entire applied-document fingerprint. Changing any draft field or scope cancels UI confirmation. `applyReviewedPanelPropertyEdit` independently rejects missing/unconfirmed, changed, stale or rebased reviews. No expansion by size, name, BOM group or manufacturing variant occurs. The proposal is atomic; validation failure retains the previous document.

Bulk copy uses stable face A/B and local edge identities, **not** current screen-side names. The review explains this and asks users to inspect differing physical orientations in Advanced. It copies all editable fields, including Not specified, while retaining each target's engineering stock ID/grade, physical orientation, matching and other requirements. Provisional copies stay distinct occurrence-specific manufacturing variants; there is no implicit approval or interchangeability merge. Geometry edits continue to withhold drawings/export until reset or explicit provisional rebase.

## Grouped schedule display

The ten business columns and occurrence-level `ManufacturingScheduleRow[]` remain unchanged. `groupManufacturingSchedule` derives a display partition from the existing validated manufacturing variant resolver. Only complete **verified-properties-only** variants can share a display row. Unknown/provisional definitions remain singleton rows, even when they have identical dimensions or identical bulk-copied proposals.

A grouped row shows its authoritative total quantity and source BOM links. **Expand … occurrences** reveals every underlying source row, stable physical ID and exact variant reference; Collapse hides those child displays. The group total and expanded children are alternate levels of the same data, not additive manufactured quantities. Users can switch off **Group compatible manufacturing variants** to see the original occurrence rows. A supplied verification record remains a consistency record, not an authenticated release approval or assessed physical interchangeability.

The default chest therefore still shows **29 separate schedule rows**, correctly: its requirements and demo stocks are unresolved/provisional. Synthetic fully specified test fixtures exercise actual shared/split verified variants. The printable MS schedule deliberately retains occurrence rows and every source link. All quantities reconcile to the original BOM, independently of live table expansion.

## Drawing profile output

New application Workshop/Engineering defaults use compact notes and the selected occurrence only. **Drawing Settings → Panel property output** controls:

- **Panel property drawings**: occurrence maps at the unchanged nominal CP scale.
- **Detailed panel property tables**: complete MP/MN tables; these can also be printed with maps hidden.
- **Printed manufacturing schedule**: the ten-field MS pages.
- **Panel drawing scope**: selected only, or selected plus all edited occurrences.

Maps/tables also require the existing Component drawings setting; the printed schedule also requires Cutting list. The live schedule remains available when printable schedules are hidden. Source properties, all 29 rows, occurrence/variant/BOM links and stale-input validation remain bound and validated when any output is hidden. Hiding a sheet cannot remove manufacturing requirements or grant readiness.

Compact maps show material, grain, both faces' role/finish, explicitly assigned edges and supplied other requirements as readable **2.5 mm paper notes**. Process details remain in the captured properties and optional full tables. Unknown edges are explicitly identified. If notes cannot fit at the original component scale, a readable compact MN continuation is used; text is not shrunk to force a fit. All nominal CP drawings, controlling dimensions and functional relationships are preserved. Shared SVG/PDF primitives and reconstruction validation cover compact/detailed/table-only/hidden output.

The new optional `contents.manufacturingOutput` settings persist through the existing version-3 profile storage. Absent settings on older saved profiles preserve Phase 5D.2 detailed/selected-plus-edited output. Version-1/2 migrations remain unchanged; no local preferences are rewritten automatically. Reset to profile defaults opts into the new application compact defaults. Legacy drawing API calls without manufacturing input retain their 12-page package; API profiles without the new options retain their prior metadata output.

The normal new-session A3 application package is **16 pages**, including one selected-panel MP and four occurrence-level MS pages, rather than the previous 17-page MP/MN default. Selecting a larger panel, adding long notes or enabling detailed tables can require continuation sheets. The count follows actual content and readability.

## Verification and remaining work

The protected reference remains **29 panel occurrences, 87 nominal component measurements, 26 core functional relationships**, the unchanged engineering BOM and unverified hardware with zero approved purchasing quantities. `manufacturingReady=false` and `complianceVerified=false`; this phase claims no verified BS/ISO compliance.

Phase 5D.4 candidates are a controlled project/company catalogue and persistence policy, reviewed physical face/grain/edge definitions, fuller process/grade authoring with appropriate authority, durable variant/part-number registry and explicit cross-panel orientation-copy policies. Engineering still needs real materials/grades, manufacturer codes, good-face acceptance criteria, pattern/matching rules, treatment/finish definitions and approved finished-to-blank relationships. Authenticated release authority, actual process/feature engineering, Unicode PDF fonts, finished-size calculations, stock replacement, machining and DXF/DWG remain outside this slice.

## Final verification — 19 November 2026

- **726 tests passed**: all 699 previous regressions and 27 workflow regressions. New tests cover 48 signed/swapped physical orientations (384 face/rotation cases), stable physical selection, generic/none/unknown treatments, preset parsing, document/draft/scope-bound bulk review, stale rebase rejection, preservation of nested metadata, verified variant grouping/splitting and quantity/ID conservation, profile persistence/migration, compact/detailed/table-only/hidden output and all 29 maps at A4–A1. Long A4 notes continue without reducing the nominal panel scale and retain explicit unknown-edge information.
- `npx tsc --noEmit`, `npm run lint`, `npm run build -- --webpack` and `git diff --check` passed. Engine sources/formulas and runtime dependencies are unchanged.
- Production Chrome checks pass using static build-artifact routing: Basic/Advanced state preservation, undo/reset draft, A/B flipping before/after diagram rotation, stable edge marks, generic banding/no treatment/unknown, local project/company presets, bulk review/confirmation invalidation, exact scope, 29 unresolved schedule rows, local Save/Load, geometry review/rebase, output preference persistence, both company profiles/projection conventions, detailed tables, A4 and mobile overflow.
- A property edit during lazy PDF export cancels the stale download. The normal reviewed A3 PDF has **16 pages**, no raster image XObjects, and **412** source-linked panel/schedule vector segments matching browser SVG coordinates. The A4 long-note stress fixture also exports successfully with readable compact continuations; those synthetic notes are not production instructions.
- Actual MP/MS PDF pages were rendered from their A3 media boxes with macOS CoreGraphics at 108 dpi and visually reviewed alongside the Basic editor screenshot. Checks cover selection/treatment clarity, grain/face identity, readable 2.5 mm compact notes, reference dimensions, title blocks, all ten schedule columns and synthetic/preliminary labels. This is a screen review at A3 paper dimensions, not a physical printer trial or standards audit. The final A4 compact-note continuation was also rendered and reviewed.

Review artifacts: [Basic editor](/private/tmp/draftelm-5d3-basic-editor.png), [reviewed A3 package](/private/tmp/draftelm-5d3-reviewed-package.pdf), [panel PDF rendering](/private/tmp/draftelm-5d3-panel-pdf.png), [schedule PDF rendering](/private/tmp/draftelm-5d3-schedule-pdf.png), and [A4 long-note export](/private/tmp/draftelm-5d3-long-notes-package.pdf). Verification logs use the `/private/tmp/draftelm-5d3-*-release.log` prefix. No commits or pushes were performed.

## Phase 5D.4 update

[Manufacturing libraries and drawing integration](manufacturing-libraries-drawing-integration.md) extends the local proposals with typed material, edging and finish versions, review-before-staging, immutable applied snapshots, richer physical drawing keys, explicit matching registration and a shared LC legend. The editor diagram's A/B face and quarter-turn now also drive its reference drawing, including after panel switches. Original CP views/scales remain intact; an explicitly rotated MP may use a smaller standard scale. Legacy simple edging presets remain available.
