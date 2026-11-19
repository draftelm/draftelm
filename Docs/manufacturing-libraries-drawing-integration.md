# Manufacturing libraries and drawing integration — Phase 5D.4

Implemented 19 November 2026. This extends [the panel property schema](panel-manufacturing-properties.md), [visible properties](visible-panel-manufacturing-properties.md) and [the simplified workshop workflow](simplified-manufacturing-workflow.md). It adds reusable definitions and a visibly different manufacturing map, without changing the furniture engine, nominal dimensions or engineering BOM.

## Workshop workflow

The existing Basic editor now has **Material library**, **Selected edge library** and **Face A/B finish library** selectors. There are no invented stock, supplier or finish entries on first load. Users can create a provisional entry from the current target's supplied values, give it a project/company scope and owner identifier, then save/load the library locally.

Selecting a version opens a review of the complete applied property, current draft and proposed definition, including grade/process metadata. Selection replaces the material/finish/treatment target rather than silently adding a code. Missing definition fields become Not specified; existing stock restrictions change only when the entry supplies one. **Use reviewed … preset** stages it in the pending draft; **Apply panel properties** updates the source-bound document, drawing and schedule. A selection does not silently replace saved properties. Undo/reset and Basic/Advanced switching retain their existing behaviour. A manual edit detaches the affected library reference while preserving the other face/edge/material references and supplied values.

Simple creation in Basic captures current fields, stock identity and the actual nominal source thickness. Advanced additionally permits explicitly supplied grade, appearance, manufacturer/supplier codes, stock orientation/reversal restrictions and process references. Blank optional overrides retain known fields from the current pinned draft; other attributes remain Not specified. Full process engineering and supplier resolution are not implemented. Stock orientation is a cutting-stock constraint, separate from the explicitly assigned surface grain/pattern; choosing a material never invents a grain direction or a good face.

Material selection refines the **existing engineering stock identity**. A different stock ID or incompatible nominal stock thickness is rejected. Replacing engineering stock requires a separate source change; a library selection cannot rewrite BOM membership, structural assumptions or panel sizes. Explicit **Not specified**, **No treatment** and **Specified treatment** controls remain available. Generic incomplete edging remains a provisional proposal with unresolved diagnostics.

Bulk editing still requires exact occurrence IDs, review and confirmation. The reviewed draft includes its pinned definitions. Changing scope, draft or the applied document invalidates that review. Shared blank dimensions, matching names and shared library entries do not expand the scope or establish manufacturing interchangeability. After application, scope returns to the selected occurrence. Matching registrations must be applied individually; bulk copying other properties preserves each occurrence's existing matching requirement.

## Typed, versioned catalogue

The public API is exported from `src/manufacturing/index.ts`. `catalogue.ts` contains the library schema/validation and `catalogueEditing.ts` contains draft staging and application. The manufacturing domain does not import the drawing renderer.

```ts
interface ManufacturingCatalogue {
  schemaVersion: 1;
  id: string;
  entries: CatalogueEntry[];
}
// CatalogueEntry identifies owner { kind: "project" | "company", id },
// id, positive integer version, name, kind and explicit syntheticExample state.
// specification is unassigned, provisional, or a supplied verified record.
```

Each assigned definition is one of:

| Kind | Recorded facts and unknowns |
| --- | --- |
| Material | Engineering stock ID; optional grade, nominal stock thickness, appearance and stock orientation/reversal restriction. |
| Edge treatment | Edge-band/lipping/other kind; optional specification, material ID, nominal treatment thickness, appearance and process metadata. |
| Finish | Finish specification; optional appearance and process metadata. Opposite panel faces select independently. |

All definitions support manufacturer codes and supplier codes in separate namespaced lists. They require no proprietary service or supplier database. Missing optional attributes are unknown, not an invented none/zero/default. Grade null retains the existing explicit not-applicable meaning. Thicknesses, when supplied, must be finite and positive. Processes are references/text, not executable operations or validated manufacturing instructions.

Catalogue specification states are:

- **Unassigned:** a reason, no value; visible but unavailable for assignment as a specification.
- **Provisional:** supplied facts and a reason; every UI-created version uses this state.
- **Verified:** a caller-supplied evidence record containing a definition/version subject fingerprint, evidence references and reviewer identifier. Validation checks consistency only. There is no authentication, panel approval or manufacturing release transition.

The catalogue's evidence subject binds owner, ID, version, name, kind, example state and complete definition. It is independent of a particular engineering geometry revision. Applying any library entry, including one with supplied verification, creates **provisional occurrence properties**; it never transfers catalogue evidence into an engineering approval.

Existing versions cannot be overwritten or change kind. Creating the same name/owner creates a higher version. Loads merge known versions, including versions pinned by saved panel properties; conflicting content, status or evidence for the same identity/version is rejected. A different active catalogue namespace can be explicitly loaded without changing existing panel pins. Namespaces/delimiters are encoded in selectors and reference labels rather than conflated with physical IDs. The local catalogue is bounded to 200 version records.

## Pinned occurrence references and revisions

Material, specified finish and specified treatment values can carry an optional:

```ts
interface CatalogueReference {
  catalogueId: string;
  fingerprint: string;
  entry: CatalogueEntry; // captured version, definition and supplied evidence
}
```

Fingerprints are canonical JSON comparison keys, not cryptographic signatures or approval authority. The full immutable snapshot remains in the source-bound occurrence property. It is deliberately self-contained: loading a saved panel document still produces its drawings and library legend before the separate local library has been loaded. Updating the active library cannot change an already applied panel. A new version requires explicit selection/review/application.

Reference fingerprints bind the complete captured version, including its status/evidence. Conflicting snapshots of one version cannot coexist silently. Validation also compares applied facts to their reference: material identity/grade/codes, actual stock thickness and supplied stock restriction; face finish codes/appearance/process; physical edge treatment/material/thickness/appearance/process. Edited facts cannot retain a contradictory reference. Existing documents without references remain compatible.

Physical manufacturing variant comparison uses the pinned definition/version and manufacturing meaning, excluding review attribution. The independent captured-property snapshot includes all evidence, so an evidence change invalidates cached plans/exports without inventing a different physical manufacturing requirement. Original occurrence IDs, original BOM rows and the distinction between stock blank compatibility and finished manufacturing variants remain intact. Unknown/provisional occurrence properties still isolate occurrences. A verified catalogue entry alone cannot justify grouping or purchasing.

Geometry changes retain the existing stale-data/export withholding. Explicit rebase demotes occurrence properties while preserving the independent pinned catalogue snapshot. Incompatible stock identity, nominal library stock thickness or physical orientation resets the affected occurrence to source defaults rather than carrying an invalid specification into a new source. This is review/rebinding, not reapproval.

`draftelm.manufacturing-catalogue.v1` stores the explicit local Save/Load catalogue. The existing `draftelm.panel-manufacturing.v1` document stores applied pins alongside the existing engineering bindings. Legacy `draftelm.edging-presets.v1` controls remain available; no old file/key is silently overwritten or converted into approved data. Project/company ownership is a local namespace and future account seam, not an authenticated company policy or centrally controlled service.

## Grain, face and edge drawing annotations

The new application default enables **Grain, face and edging drawing keys**. Browser SVG and PDF use the same source-linked vector primitives.

- **Grain:** an explicit directional pattern produces a clear arrow, preserving positive/negative/either sense. The shared semantic `grain` stroke is 0.25 mm, independent of view scale. Unknown/non-directional grain has no arrow. The view notes explain the symbol and local U/V direction; a shared direction alone never asserts continuity. Stock restriction selection does not populate the separate pattern requirement.
- **Faces:** a supplied good-face requirement or decorative/reverse/visible role produces a physical A/B badge where it fits; complete role/acceptance criteria and independent finish codes remain in the notes/table. A good face is never inferred from camera visibility, material or finish selection. The view heading identifies the displayed A/B face and quarter-turn even when an interior badge cannot fit.
- **Edges:** E1=u-min, E2=u-max, E3=v-min, E4=v-max. These keys identify the same physical perimeter surfaces in every face view. An asterisk and 0.5 mm inset treatment line identify an explicitly assigned treatment. The adjacent edge key and compact keyed note identify its supplied code and thickness; unknown attributes remain Not specified. Explicit no treatment has no strip and is stated separately from unknown. Lines are symbols, not physical band geometry or dimensional deductions.

Keys/text use fixed 3 mm paper lettering; compact property notes and full tables use 2.5 mm. Both profiles resolve these roles through the central style system, with bounded company overrides. The plain keys/arrow/asterisk are candidate company conventions, not asserted normative BS/ISO symbols or verified compliance.

### Physical orientation and placement

`manufacturingAnnotations.ts` maps local points through the existing signed panel frame into the selected face/quarter-turn basis. The MP's outline and reference dimension anchors transform together; true values/semantic IDs are unchanged. Grain uses the actual local U/V axis projected into this same basis. Each edge line/label retains its stable physical edge source ID. A face flip therefore reverses the appropriate projected axis and moves the same treatment to its correct paper side; it does not relabel or reassign manufacturing edges.

The editor and drawing share a per-occurrence presentation view. Panel switching and geometry review retain that view consistently. `ManufacturingDrawingInput.panelViews` captures explicit face/rotation choices for preview/export validation. These are presentation settings; original source coordinates, original panel frame and manufacturing variants are unchanged.

Original CP sheets and all controlling component scales/dimensions remain intact. MP reference views retain the original CP scale where possible. An explicitly rotated view may select a smaller sensible standard scale to fit the allocated region; proportions, text and lineweights are never stretched/scaled to fill it. This is stated per view. Legacy calls without a face-view override retain their previous scale behaviour.

Grain ink reserves its area before edge text is placed. Vertical edge keys can run along the edge; crowded keys move along that same physical edge. All symbols remain within the allocated image/frame and dimension lines remain outside it. Very small views can omit a crowded interior label while the explicit keyed legend, face heading and full property data remain available. Long notes use readable MN continuations rather than font shrinkage. Arbitrary oblique panel rotations remain outside the supported axis-aligned rectangular-panel contract.

## Explicit grain matching

The existing source-bound matching schema is now editable in **Explicit grain matching requirement**. Users choose unknown, explicit independent, or a specified group and supply a physical face, member order, U/V pattern registration and quarter-turn. Values must be supplied explicitly; the application does not calculate registration, order, veneer sequencing, nesting or visual continuity.

A single-member group is diagnosed incomplete; duplicate order numbers, invalid faces and non-directional-pattern conflicts are rejected. Matching stays occurrence-specific. The matching group/face/order/registration appears in related component notes and the ten-field schedule, labelled **continuity UNVERIFIED**, including when a supplied verification record is present. No extra GA dimension/balloon layer is invented, and nearby fronts with the same grain orientation never acquire an automatic group.

## Schedule, library legend and output choices

The ten business columns remain unchanged. Rows with catalogue references use compact **L1, L2, …** keys and names rather than repeating grades, supplier codes and process definitions for every occurrence. These are document-local library keys, not durable part numbers. Part numbers and finished dimensions remain Not specified. Each row retains source occurrence, BOM, manufacturing variant and quantity data. The live schedule has expandable pinned-definition details; verified-variant grouping remains conservative and separately configurable.

An optional **LC** sheet defines each referenced version once, including known/unknown attributes, codes, supplied status/evidence and source identity. It includes only used snapshots, including versions used by occurrences whose individual MP sheets are hidden. Different material versions can share one LC page. Complete source text is wrapped/paginated at fixed paper size without truncation. All 29 occurrence rows remain in the printable MS schedule.

**Drawing Settings → Panel property output** controls property maps, detailed tables, printed schedules, selected/all-edited panel scope, keyed annotations and referenced library definitions. Hiding LC/MP/MS retains bound properties and validation. Reconstruction rejects altered/missing legends, changed symbols/values, stale source data or removed manufacturing bindings. Property/reference/view/profile changes cancel an in-flight stale PDF; unreferenced library edits do not alter pinned drawing inputs.

New application defaults remain selected-panel/compact output. The real unspecified reference package stays **16 A3 pages**, with no LC sheet until there is a used reference. The reviewed synthetic two-front example has **17 A3 pages**: one MP and one shared LC page, retaining the original drawing families and occurrence-level MS pages. The reviewed LC page holds five versions (two material versions, one edging definition and separate A/B finishes). Extra text, different formats and explicit detailed/all-edited output can require continuations. No automatic separate sheet is added for every edited component.

Older saved output settings without the new keyed switch preserve their previous symbols. Catalogue legends default on when used unless explicitly hidden; absent libraries add no sheet. Version-1/2 profile migrations and existing local preference behaviour are preserved. Legacy API calls without manufacturing input still retain the 12-page package.

## Remaining engineering decisions and limitations

Real material/grade/codes, company definitions, physical good-face criteria, actual stock/batch/pattern constraints, finish/treatment processes and appropriate evidence still require engineering/manufacturer decisions. Codes are supplied references; no external dictionary is fetched, authenticated or monitored. Catalogue record verification checks consistency, not evidence adequacy or reviewer authority.

Future company accounts need controlled ownership/permissions, durable persistence/history, archive/revocation policy and external definition/version authority. A durable part-number registry, fuller process/feature authoring, per-face pattern extensions, approved finished-to-blank relationships, tolerance/inspection policies and authenticated release remain separate work. Unicode PDF font embedding is still deferred; unsupported manufacturing characters are refused rather than substituted.

There is no stock replacement, nesting, calculated finished size, edging deduction, machining offset, drilling, CNC/G-code, DXF/DWG or CAD editor in this phase. Furniture geometry/BOM formulas, 29 reference panels, 87 component measurements, 26 core functional relationships and the 20 supporting deferrals are preserved. `manufacturingReady=false`, `complianceVerified=false`; generic hardware remains unverified with zero approved purchasing quantity. No formal standards-compliance or production-release claim is made.

## Final verification — 19 November 2026

- **786 tests passed**: all 726 preceding regressions plus 60 library/annotation regressions. New coverage includes entry/version/evidence/reference validation; unknown/provisional/verified states; known-version merge conflicts; immutable pinning; manual detachment and metadata preservation; invalid stock/thickness; source rebase/reset; stock blank versus finished variant grouping; explicit matching and duplicate/incomplete groups; namespace encoding; all face/quarter-turn combinations in both company profiles; signed/swapped X/Y/Z-normal panels; narrow rotated transverse grain; physical edge placement; lipping; printed style widths; LC/MS traceability; hidden/tampered output; and vector PDF primitives.
- Widths **900, 1000 and 1100 mm** were exercised with **1, 4, 6 and 12 drawers** using valid heights (850 mm through four drawers, 1250 mm for six and 2450 mm for twelve). Reference safeguards remain 29 panels/87 measurements/26 core relationships; other counts conserve their own original engine occurrences, measurement requirements and hardware exclusions.
- `npx tsc --noEmit`, `npm run lint`, `npm run build -- --webpack` and `git diff --check` passed. Furniture engine/formulas and runtime dependencies are unchanged.
- Production Chrome checks pass using static build-artifact routing: default empty libraries/unknown properties, Basic/Advanced creation, complete preset review and staged selection, material/edging/A/B finish versions, no automatic occurrence update on new version creation, local library/property round-trips, synthetic provenance/restore, explicit bulk scope, individual matching registrations, geometry stale export/rebase, face/rotation persistence across panel switches, both profiles/projection conventions, output preference persistence, A4 and mobile overflow.
- Applying a new catalogue version while lazy PDF export loads cancels the stale download. Restoring saved panel properties before loading the separate library still resolves all pinned definitions correctly. The reviewed synthetic A3 package has **17 pages**, all original 29/87/26 references and no raster image XObjects. **420 source-linked vector segments** across MP/LC/MS were matched to browser SVG coordinates.
- Actual MP/LC/MS PDFs were rendered from their A3 media boxes with macOS CoreGraphics at 108 dpi and visually reviewed. Review covers the good-face badge, grain/edge separation, keyed treatment/thickness notes, distinct A/B finishes, unverified matching note, five pinned definitions on one LC page, all ten schedule columns, title blocks and preliminary/synthetic status. A supplementary Face B / 90° synthetic view was also exported/rendered/reviewed at 1:10, with correctly transformed edge/grain/reference dimensions. This is a screen review at A3 paper dimensions, not a physical printer trial or formal standards audit.

Review artifacts: [editor](/private/tmp/draftelm-5d4-editor.png), [reviewed A3 package](/private/tmp/draftelm-5d4-reviewed-package.pdf), [panel rendering](/private/tmp/draftelm-5d4-panel-pdf.png), [library rendering](/private/tmp/draftelm-5d4-library-pdf.png), [schedule rendering](/private/tmp/draftelm-5d4-schedule-pdf.png), and [Face B / 90° view](/private/tmp/draftelm-5d4-face-B-90.pdf). Supplementary face-view output uses an explicitly synthetic fixture; it is not an additional production specification. Final logs use `/private/tmp/draftelm-5d4-*-reviewed.log`. Existing Phase 5D.3 work and these changes remain uncommitted. No commits or pushes were performed.
