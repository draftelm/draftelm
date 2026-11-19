# Visible panel manufacturing properties — Phase 5D.2

Implemented 18 November 2026. The [Phase 5D.1 schema](panel-manufacturing-properties.md) now has a usable application path: select an occurrence, edit a provisional property, apply it, inspect its labelled physical-panel map and see the same source-bound data in a ten-field schedule and vector PDF.

## What a user can do

The existing `/furniture` workflow now includes **Panel manufacturing properties** between the assembly controls and drawings. Selection uses the original component occurrence ID and also selects that physical panel in the existing viewer/inspector. Every one of the 29 reference panels is available, including equal-size members of a shared engineering blank group.

The editor shows a schematic local U/V face map, neutral broad faces A/B, the four perimeter edge keys and actual local extents. The local-to-world signed axes and exact face/edge IDs/outward normals are available beside the map. The schematic is expressly labelled as illustrative proportions; it does not resize or reinterpret the engineering panel. Face A is T=0, face B is the opposite broad face, and neither role is inferred from camera visibility.

Users can propose:

- Manufacturer material codes, one `manufacturer=code` per line, without changing the engineering stock ID/grade.
- Longitudinal U, transverse V, non-directional or unspecified grain, with explicit either/positive/negative directional sense.
- Each broad face's decorative/reverse/ordinary role and required visibility, with manufacturer-defined good-face requirement text. Role choices explicitly state visibility; blank good-face criteria print **Not specified**.
- Independent finish references on A and B, or an explicit no-applied-finish proposal.
- Each physical edge's band/lipping/other treatment, specification reference, optional nominal thickness, material, appearance and process reference; explicit no treatment remains different from unspecified.

**Apply panel properties** is placed beside the main controls. A draft-change indicator states that Apply updates the drawing and schedule; edits are not silently committed on each keystroke. A second apply action is available after the scope controls. Validation errors keep the previous document intact. All UI-authored values are **provisional/unverified**. There is no verification or release-approval button.

Bulk application is opt-in: users check exact occurrence IDs, see the full selected scope and confirm before applying to more than one occurrence. This copies the editable fields, including explicit Not specified values, only to those IDs. It does not expand by BOM membership, material, shared name or size. Stock grade, physical orientation, matching specifications and other requirements are not replaced by this simple editor. Advanced role/sense data that the editor supports is reflected in the draft rather than silently mapped to another direction.

## Local storage and geometry review

Save/Load uses the separate `draftelm.panel-manufacturing.v1` localStorage key, storing an envelope `{ schemaVersion: 1, properties, syntheticExample }`. Load is explicit; hydration does not automatically restore manufacturing values. The existing drawing-profile preference storage/migrations are unchanged. Reset clears the active session to unspecified/provisional source defaults; it does not silently erase saved local preferences. Storage failures leave active data available and report the failure.

Edits retain their Phase 5D.1 source revision and panel/frame bindings. A geometry, count or relevant source change keeps the old data for review and withholds its drawings/PDF. The user can reset, or explicitly review surviving physical IDs and orientation before carrying values to the new revision. Rebinding retains matching IDs, removes deleted occurrences, initializes new ones and resets incompatible orientation/stock bindings. Every carried verified/provisional value is demoted to a fresh provisional proposal; no old verification claim survives a geometry review. Matching/other requirements are preserved as provisional data, not reapproved.

Presentation change detection ignores audit reasons and binding churn. Reviewing a width change therefore does not create 29 extra panel maps when only one panel has actual property edits. Physical values, assigned treatments and signed orientation still affect that decision. Invalid references, unsupported specifications and stale inputs cannot silently reach the drawing boundary.

## Visible component drawings

The original seven nominal blank groups and CP views stay in place, at their original scales, with all **87 controlling occurrence measurements** unchanged. The new manufacturing layer adds:

- **MP**: an occurrence-specific physical-panel/local face map for the selected panel and each panel with property edits. It uses only that occurrence's original geometry and source links. Existing nominal dimension IDs are repeated with **REF** prefixes; they create no additional semantic measurements.
- **MN**: a property-table continuation when the original scale prevents a readable side-by-side table or when the actual text needs continuation.

All rectangular panels use the same adapter. A request for all 29 produces a map for each without changing controlling dimension coverage. The UI normally includes the selected occurrence plus edited occurrences, avoiding an unsolicited 29-map package.

Local topology is mapped through world coordinates into the existing component display axes. A reversed U/V mapping therefore changes the correct physical paper edge and grain direction, without changing edge IDs or swapping treatments by long/short sorting. Edge keys are placed inside the outline where they fit; all four references remain in the property table and local orientation notes. Broad-face A/B references, role/finish data and source occurrence ID identify the actual panel rather than a nominal blank representative.

Grain arrows are emitted only for assigned directional grain; non-directional/unspecified has no arrow. Single/either-sense heads follow the explicit local sense. Assigned edge treatments add an inset **symbolic** strip; unknown and explicit no-treatment edges have no strip. The strip is a paper symbol, not actual edging geometry, an oversize allowance or a thickness deduction. Fixed paper text/lineweights follow the shared Workshop/Engineering style system.

Fitting retains the corresponding CP scale. If the table cannot share the available region at that scale, the panel uses a full region and the property table moves to a referenced MN sheet. Complete source text is wrapped/paginated at 2.5 mm table lettering; no required value is truncated or fonts reduced to force a fit. Very small views can omit a crowded interior symbol label while the full explicit value remains in the linked table. Shared validators reconstruct the exact source-bound views/tables, check scale retention, dimensions, symbols and clipping, and reject altered placements/values or missing sheets.

The existing Component drawings profile toggle controls MP/MN inclusion. The cutting-list toggle/placement controls the new printable manufacturing schedule. Both Workshop/Engineering, projection conventions, A4–A1 and expanded title-block reservations are supported. First-/third-angle assembly layouts are unchanged; the additional local face map is explicitly labelled rather than inventing a new orthographic arrangement.

## Ten-field manufacturing schedule

The live schedule and printed **MS** pages use the same `ManufacturingScheduleRow[]` dataset:

| Column | Value / missing-data behaviour |
| --- | --- |
| Part number | **Not specified**; no registry/SKU is fabricated. |
| Description | Existing panel name, stable occurrence ID and source BOM reference. |
| Quantity | Authoritative source occurrence quantity. |
| L × W × T | Existing nominal BOM blank dimensions, not finished size. |
| Material / code | Source stock identity and supplied manufacturer codes/grade, with status. |
| Grain direction | Actual local U/V, sense, non-directional or **Not specified**. |
| Edge banding / treatments | Physical edge keys and actual assigned treatment references/thickness; other edges explicitly unspecified. |
| Finished dimensions | **Not specified** in every row; no allowance/process model is implemented. |
| Surface finish | Actual A/B finish references and supplied appearance, or **Not specified**. |
| Manufacturing notes | Actual face requirements and any supplied additional manufacturing requirements, with preliminary status. |

Each row retains its manufacturing variant fingerprint, source BOM ID and occurrence identity internally and in the UI traceability affordance. Equal-size panels with different supplied finishes/edging are separate rows with different variant links. Unknown/provisional properties retain the Phase 5D.1 conservative occurrence separation; showing matching proposals does not establish interchangeability. Source part numbers remain unknown. This vertical slice uses one row per physical occurrence, not an aggregate finished-part registry.

In the application, a row's description selects its panel/map. The ten columns scroll horizontally on smaller screens. In the PDF, readable table pages replace the old CL presentation when a manufacturing input is supplied; the authoritative `cuttingList`, `componentSchedule` and original BOM stay unchanged internally. Hardware stays in the separate unverified allowance schedule and never enters an approved purchasing total. Continuation fragments preserve every character and print each row quantity once.

**P** means provisional/unverified; **V** means a supplied verification record only. Every page remains preliminary, not for manufacture. The code does not resolve external material/finish/process specifications or treat an assigned code as an approved physical product.

## Opt-in synthetic example

**Try synthetic example on this panel** is an explicit action. It applies sample U-grain, an A-face appearance requirement, different A/B finish references, a manufacturer code and a v-min band proposal only to the selected occurrence. All identifiers/descriptions are visibly `SYNTHETIC-*`; the source geometry/material IDs and BOM remain untouched.

The active mode has a prominent application label and a synthetic header on **every exported page**. It stays marked when edited, bulk-applied or saved/reloaded. Exit restores the pre-example session (or unspecified defaults); it does not quietly promote the example into real property data. Manufacturing readiness and approved purchasing remain false. A loaded example without an earlier in-memory session exits to defaults.

## Binding, export and compatibility

`generateDrawingDocument` accepts an optional fourth `ManufacturingDrawingInput` argument containing the properties, explicit requested panel IDs and example state. Legacy calls without this input retain their previous 12-page reference output and profile behaviour. The application supplies this input, giving a visibly different package.

The generator captures an independent property snapshot and source-bound schedule rows. A generated `contents.panelManufacturing` profile binding requires the input at shared render/export validation; deleting the properties cannot downgrade the package silently. The original GA/component/functional source bindings continue to validate. The added validator reconstructs MP/MN/MS coverage and content; numeric labels, dimension positions, physical symbols, tables and source values cannot be edited independently of their captured properties.

Browser SVG and vector PDF consume the same paper primitives, including source IDs for MS table rows, topology labels and treatment/grain symbols. Property, geometry, selection or profile changes replace the live document; an in-flight export must still match that exact captured document before download. A property edit while the lazy PDF exporter loads cancels the export, just like an engineering revision edit.

The existing vector font has limited character coverage. With manufacturing input active, PDF export explicitly refuses unsupported text instead of substituting `?` into a manufacturing code/finish. Browser/source text stays intact, and the UI explains the export limitation. Full Unicode font embedding remains future work.

The reference application now has **17 A3 pages**: the original GA/EA/DS/CS/SC/FC/CP content, MP-001 and its MN-001 property continuation for the selected drawer front, four MS schedule pages replacing CL-001, and the original HW page. Actual edits, selections, metadata lengths, size/profile and continuation needs can change the count. The default real reference properties remain unspecified/provisional; the example is not applied on load.

## Verification and remaining limits

Final verification on 18 November 2026:

- **699 tests passed**: all 660 preceding regressions plus 39 visible-manufacturing regressions. Coverage includes explicit/bulk edits, unknown versus none, opposite finishes, variant links, all 29 selectable maps, widths 900/1000/1100/1200 mm, signed local edge/grain orientation, all profile/convention/A4–A1 combinations, original CP view/scale equality, 87/26 coverage, source/BOM conservation, property persistence/rebinding, reference repeats, pagination/quantities and corruption rejection.
- `npx tsc --noEmit`, `npm run lint`, `npm run build -- --webpack` and `git diff --check` passed. The furniture engine/formulas and runtime dependencies are unchanged.
- Production Chrome checks pass against static build-artifact routing: default unspecified values, opt-in/exit example, real provisional edits, both face finishes, grain/edging, exact bulk scope confirmation, local Save/Reset/Load, geometry-change withholding and explicit review/rebase, both profiles/projections, A4 output and mobile overflow. The reviewed A3 package has 17 pages, 29 physical schedule rows, all 87 nominal measurements and all 26 core functional relationships.
- Editing a manufacturing property while the lazy PDF exporter loads cancels the in-flight export. The captured vector PDF contains no image XObjects. 524 manufacturing panel, property-table and schedule vector paths were compared to browser SVG coordinates; domain tests also verify corresponding source-linked text primitives for both profiles/conventions.
- Actual MP/MN/MS PDF pages are rendered with macOS CoreGraphics at 108 dpi from their A3 media boxes and visually reviewed alongside Chrome screenshots. Review checks the labelled local map, correctly assigned symbolic edge, explicit grain direction, opposite face specifications, ten readable columns and preliminary/synthetic status. This is a screen review of the A3 PDF, not a physical printer trial or standards audit.

Local review artifacts: `/private/tmp/draftelm-5d2-reviewed-package.pdf`, `draftelm-5d2-editor-browser.png`, `draftelm-5d2-MP-001-browser.png`, `draftelm-5d2-MN-001-browser.png`, and `draftelm-5d2-MS-001-browser.png`. Logs share the `draftelm-5d2-*` prefix. No commits or pushes were performed; prior Phase 5D.1 work remains in the uncommitted workspace.

This phase does not add approved stock definitions, a durable part-number registry, authenticated review, finished-size calculations, treatment deductions, physical edging geometry, continuous grain matching, feature/process engineering, nesting, machining, CSV/XLSX/ZIP export or a CAD editor. The simple UI does not author advanced matching groups, stock grain constraints, grade verification or full process definitions; those supplied source-bound fields remain preserved and subject to validation. Finish inputs are specification references, and appearance/process details supplied through the domain remain visible without becoming approved instructions.

Before manufacturing approval, engineering/manufacturer review must establish real stock/grade/codes, physical face intent and acceptance criteria, grain/matching/reversal constraints, treatment and finish definitions, validated finished-to-blank relationships, fixing/process details, tolerance/inspection authority and an authenticated release workflow. `manufacturingReady=false`, `complianceVerified=false`, purchasing quantities remain zero for generic allowances, and this phase makes no BS/ISO compliance claim. No automatic commit or push is performed.

## Phase 5D.3 update

The [simplified workshop workflow](simplified-manufacturing-workflow.md) supersedes the all-fields-at-once editor described above. New application defaults use Basic mode, interactive A/B face/edge selection, compact selected-panel notes and a 16-page reference A3 package. Detailed tables and selected-plus-edited scope remain optional and persist through drawing profiles; older saved profiles retain their prior output. The ten-field occurrence dataset, source bindings and preliminary safeguards remain intact.

## Phase 5D.4 drawing integration

[Versioned libraries and keyed annotations](manufacturing-libraries-drawing-integration.md) add reviewed material/edge/finish selection, persistent pinned snapshots, displayed A/B face/rotation, clearer grain/face/edge ink, explicit matching notes and a shared LC definition legend. The default unspecified application package remains 16 pages; the reviewed synthetic library example is 17 pages. No stock/size/purchasing approval is inferred.
