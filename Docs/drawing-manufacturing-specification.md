# Drawing and manufacturing documentation specification — Phase 5A

**Phase 5C.2 update:** [Functional assembly dimensions and geometric references](functional-assembly-dimensions.md) now add source-bound gaps, reveals, clearances and offsets, with measured geometry separate from nominal intent. Optional FD sheets show core relationships while the clean GA and all component/BOM identities remain unchanged.

**Phase 5C.1 update:** [Semantic component dimensioning](component-dimensioning.md) now resolves length/width/thickness for every rectangular panel occurrence, with grouped traceability, collision-checked placement and linked normal-to-face thickness notes. GA/assembly semantics, profiles and source engineering/BOM remain unchanged.

**Phase 5B.2 implementation update:** [Assembly hierarchy, exploded views and reusable subassembly sheets](assembly-drawings.md) now implement the preliminary rectangular-panel assembly slice. They preserve the engineering source and false readiness/compliance; the complete manufacturing/release architecture below remains staged.

**Status:** proposed technical specification for the agreed product requirements; architecture planning only. **Audit date:** 16 November 2026. No feature, release approval or standards certification is created by this document. Implementation sequencing and interface proposals are in [the architecture roadmap](drawing-architecture-roadmap.md).

## 1. Scope, authority and current baseline

**Phase 5B.1 update:** [clean isometric visibility](isometric-visibility.md) is now implemented for current opaque axis-aligned panels, with a diagnostic wireframe option. It adds no manufacturing approval or dimension scope.

**Phase 5B update (17 November 2026):** the [revision-bound GA slice](general-assembly-planning.md) now implements a large isometric primary, semantic records for the four existing nominal dimensions, preliminary display-coverage diagnostics and shared preview/PDF validation. The Phase 5A audit below is historical; current A3 defaults are 1:10 isometric / 1:20 supporting views. The remaining requirements in this specification remain staged targets; manufacturing readiness and compliance verification remain false.

DRAFTELM will generate a manufacturer-oriented documentation set from validated engineering information: general assembly (GA), warranted subassemblies, every unique component, machining/details, schedules, inspection dimensions and revision-consistent downloads. Presentation is configurable; engineering values remain controlled. This is a constrained documentation system rather than a general-purpose CAD editor. G-code generation is outside scope.

The authority chain is **engineering specification/result → existing component IDs and BOM → validated manufacturing information and coverage requirements → semantic drawing plan → presentation/layout → export artifacts → authorised release assessment**. Drawing tables and spreadsheets are projections of this chain, not independent BOM calculators. New manufacturing information needs an explicit engineering/metadata authority and revision; the renderer cannot supply missing design decisions.

Historical baseline audited in Phase 5A, through Phase 4C.2:

- `src/furniture` generates schema-v2 chest assemblies, global panel positions, validation, revision-bound assumptions and the authoritative BOM. Root, carcass and four drawer assemblies already exist. Panel positions are global minimum corners; assembly transforms must not be added again.
- The reference carcass is **900 × 850 × 500 mm**, with 18 mm carcass panels, four drawers and a **864 × 814 × 6 mm** recessed back at zero nominal edge gap and 10 mm rear inset. These validated nominal geometries remain unchanged.
- The default A3 package has six sheets covering **29 panels in seven blank groups**, with selectable parallel projections, component details, cutting list, unverified hardware schedule and vector PDF. Current GA dimensions are width **900**, height **850**, overall closed panel depth **518**, and carcass depth **500 mm**. The 18 mm projecting decorative fronts explain the depth difference.
- Current profile-v2 defaults put the compact panel list upper right and use 1:20 main/isometric reference views. The isometric is a wireframe illustration, not a hidden-line manufacturing view. A family-based dominant/large primary view is not implemented.
- Membership-based short item numbers survive dimension changes when the groups stay the same. They are document item labels, not a durable company part-number registry. Default balloons place three representative exterior groups. Items 1, 4, 5 and 7 — back, bottoms, box fronts/rears and drawer sides — have 21 concealed occurrences and remain explicitly unplaced/listed.
- The reference **160 generic screws, eight back brackets and eight single-side runners** are unverified demonstration allowances, excluded from approved purchasing quantities. Approval records and verified hardware selections cannot be inferred from those counts.
- `manufacturingReady` and drawing `complianceVerified` are literal false. The engine's `assumptionsVerified` checks revision-matched evidence records, not evidence adequacy or signer authority. Existing canonical specification revisions are not authentication signatures.

Current source/documents are evidence for this baseline: [engine](furniture-engine.md), [drawing foundation](drawing-foundation.md), [profiles](drawing-profiles.md), [annotations](drawing-annotations.md). Historical examples in earlier documents may describe the pre-annotation 1:10 GA layout; the Phase 4C.2 source and documentation describe the current defaults. The recorded prior result is 274 passing tests; no tests are rerun for this documentation-only task.

### Non-negotiable rules

1. Preserve existing geometry, component IDs and BOM calculations. Feature authoring that later changes physical geometry is a separately validated engineering change, never a drawing edit.
2. Unknown values remain **unspecified**, with reasons and affected scope. Zero, “none”, “not applicable” and “approved” are distinct states; none may substitute for missing information automatically.
3. A nominal design gap and a computational geometry epsilon are not manufacturing tolerances. No grades, tolerances, machining allowances, grain, edging, finishes, drilling or installation details may be invented.
4. All representations retain source/revision/occurrence links. Hiding an output cannot remove its internal validation requirements or make an incomplete package releaseable.
5. Keep current manufacturing readiness false. Future release capability requires reviewed engineering capabilities, automated evidence and authorised approval infrastructure; this specification does not bypass the current false flags.
6. A Workshop or BS 8888 / ISO-style appearance is not evidence of standards compliance. Any future explicit compliance claim requires a scoped, evidenced review against the applicable requirements and licensed material where needed. No normative clauses or default tolerance classes are asserted here.

## 2. Product requirements and acceptance criteria

The identifiers below are stable planning/test references. “Required” means required by the applicable, versioned engineering/company coverage policy, not everything that could conceivably be drawn. Missing or unresolved requirements block release for the affected scope while still permitting clearly preliminary review output.

### R01 — automatic primary GA view

Select the primary view using furniture family, assembly structure and the information it must convey. **A large parallel isometric is the chest-of-drawers default.** Supporting orthographic views retain first-/third-angle relationships and carry true-length dimensions as appropriate. A visible, revision-recorded presentation override may select another suitable primary view.

**AC01:** the reference chest plans isometric as primary and gives it the largest individual view region, rather than four equal cells. Supporting views, parts lists and annotations fit without dropping required content or shrinking lettering below the approved presentation minimum. Unsupported furniture types produce an explainable fallback/review requirement, not an assumed chest layout. View-choice reasons and policy version are recorded. A scale/layout fallback may add a GA continuation sheet.

### R02 — overall and functional GA dimensions

Dimension the assembled envelope and relevant interfaces/clearances, using resolved engine facts and geometry. Keep finished overall envelope, carcass envelope, openings and nominal design clearances distinguishable. Existing runner envelopes are unverified and cannot become approved hardware installation dimensions.

**AC02:** the reference four existing GA dimensions resolve to 900/850/518/500 mm with model-space anchors and correct meanings. Functional candidates such as the opening and front gaps are derived from existing validated geometry/parameters, then selected through an engineering-reviewed rule set; they are not newly chosen design values. A parameter edit updates every affected value. Foreshortened isometric line length is never used as the engineering dimension. Unknown future protruding hardware prevents an unsupported “complete finished envelope” claim.

### R03 — hierarchical BOM-linked ballooning and parts lists

Support assembly → subassembly → part relationships, with a stable part identity distinct from local balloon/item labels and physical occurrence IDs. Global part identity can repeat across scopes; local quantities and hierarchy labels must refer to the selected scope. Unverified fittings remain visibly classified allowances.

**AC03:** every root/subassembly list reconciles to actual descendants of `Assembly.parentId` and the source components, without parsing component-ID strings to infer membership. A drawer list reports its own constituents, not four times the drawer quantity. A shared blank across carcass and drawer roles retains its source BOM link and correct local count. Aggregate leaf totals reconcile once to the master BOM; assembly summary rows are not added again as leaf quantities. Concealed/ambiguous anchors are rerouted to valid views/details or reported as unmet coverage, never fabricated.

### R04 — justified subassembly drawings

Generate subassembly drawings when a versioned manufacturing-complexity decision identifies interfaces, operations, assembly dependencies or hidden critical information that the GA/component sheets cannot communicate adequately. Repeated equivalent subassemblies may share documentation with occurrence mappings. Size or part count alone does not prove complexity.

**AC04:** each existing drawer/carcass scope receives an explicit `required`, `not-required` or `unresolved` decision with reasons and rule version. Required subassembly drawings cannot be hidden in a released package. Equivalent drawers are grouped only when construction, orientation, features and manufacturing metadata match; different machining or finishes split them. Rules/thresholds require engineering review before they become release criteria.

### R05 — complete unique-component documentation

Document every manufacturing-distinct component. Group simple identical panels into readable sheets; dedicate views/space/sheets to complex components. Existing cut-blank equality is insufficient to establish finished-part interchangeability once grain, edging, finish or machining differs.

**AC05:** all 29 reference panel occurrence IDs remain covered exactly once in the applicable master leaf-row mapping, and all seven current blank groups remain documented. Approved feature/finish differences split derived manufacturing variants without changing the engine's blank grouping or losing source quantities. Every variant points to its source BOM line(s)/occurrences and at least one drawing or approved coverage exemption. Complex parts get more space, additional views or continuation/detail sheets; physical text remains readable.

### R06 — complete automatic manufacturing/inspection dimensions and controlled edits

Generate dimensions from a versioned requirement set for the validated features, processes and inspection purpose. Separate semantic measurements from paper placements and repeated/reference displays. Automatic completeness is evaluated against explicit requirements, not the presence of a rectangular outline or a large dimension count.

**AC06:** every required dimension/inspection characteristic has a resolved semantic ID, geometry/feature source, reference frame and at least one readable approved display. Duplicate controlling dimensions, conflicting values, unresolved features and missing coverage are detected. Repeats in another view are explicitly reference displays of the same semantic measure. Users may move text/leaders, select an equivalent view or adjust scale; they cannot type a replacement numeric value or remove the last required display. A conflicting/obsolete edit is invalidated after regeneration and surfaced for review. Unsatisfied feature requirements block release rather than being silently skipped.

### R07 — feature-appropriate references and datums

Select reference faces/edges and part-local coordinate frames using feature/process/inspection rules. Distinguish an ordinary dimension reference edge from an engineering datum system. Provide controlled overrides with reasons and impact review.

**AC07:** references resolve to stable topology/fact identities rather than screen coordinates or whichever edge happens to be longest. Changing width/height so long/short order swaps does not silently rotate grain, edge labels or datum meaning. Datum changes recalculate affected dimensions, revalidate feature access and invalidate prior approvals. No datum symbol, GD&T requirement or inspection setup is invented merely because the template is Engineering.

### R08 — approved tolerances

Support approved company general-tolerance policies plus explicit critical dimension tolerances. Store applicability, units, process/material scope, precedence and evidence. Explicit critical tolerances take precedence where approved; unresolved conflicts or applicability gaps require review.

**AC08:** absent tolerance data produces an explicit unspecified status, never a suggested numeric/class default. A required critical tolerance cannot fall back silently to a general note. Changed company policy/version or datum/feature dependency invalidates the affected assessments. Displayed notes and per-dimension values resolve from the same approved policy. Arithmetic consistency, limits and coverage are checked without claiming process capability or standards compliance from formatting alone.

### R09 — validated machining and extra details

Use validated, revision-bound engineering feature definitions for holes, grooves, pockets, rebates and other supported operations. Draw relevant faces/sections/positions/depths readably and add linked detail sheets when component sheets are insufficient. Actual feature geometry needs engineering validation before it enters a drawing.

**AC09:** a feature can be traced to its part variant, local frame, source evidence and geometry revision; its manufacturing/inspection dimensions are covered once with permitted references elsewhere. Dense/hidden operations receive additional detail views/sheets with navigable parent links. Missing depth, tool-side/access information, required datums or unresolved features are reported. Current square-cut back construction gains no groove/rebate or holes through this specification. Generic screw/bracket anchors and runner envelopes are never repurposed as drilling locations. No toolpaths or G-code are generated.

### R10 — grain, edge treatments and finishes

Show approved per-face/per-edge information on component drawings and in dedicated schedules. Use an explicit part-local orientation and consistent edge identities across views, schedules and mirrored variants. Distinguish nominal blank dimensions, finished dimensions and applied treatment thicknesses.

**AC10:** a marked edge resolves to the same physical edge in the drawing and schedule. Missing grain/edge/finish data is unspecified, not “none”. A reversed/mirrored orientation cannot swap treatments silently. Separate manufacturing variants are created where treatments differ. No edge-thickness deduction, oversize allowance or finished-to-cut conversion changes the engine's nominal blank size without a separately approved engineering construction/dimension model.

### R11 — one master BOM and cutting-list schema

Produce one reconciled master documentation dataset over the existing BOM and validated metadata. Use these **ten default logical business fields**, preserving their order; dimension groups may expand into separate numeric columns in machine-readable formats:

| # | Logical field | Authoritative value and missing-data behaviour |
| --- | --- | --- |
| 1 | Part number | Versioned company/project part registry; current short item numbers remain separate. Unassigned numbers are explicit, not fabricated SKUs. |
| 2 | Description | Source BOM/engineering part description plus approved variant designation. |
| 3 | Quantity | Sum of mapped engine occurrences in the stated scope/unit. Hardware allowances and approved purchasing quantities stay separate. |
| 4 | Length / width / thickness | Existing nominal cut-blank values and units. Do not imply grain rotation or finished size. Hardware without defined cut dimensions is not applicable, with its classification visible. |
| 5 | Material / code | Source material identifier and, where provided, approved company/stock code; no inferred grade. |
| 6 | Grain | Approved orientation relative to stable part axes, or explicit unspecified/not-applicable state. |
| 7 | Edge banding / treatments | Approved edge-specific schedule references; unspecified is distinct from an approved “none”. |
| 8 | Finished dimensions | Approved finished-size definition; do not copy blank sizes into this field without an approved relationship. |
| 9 | Surface finish | Approved face/edge finish code/schedule; unresolved information stays visible. |
| 10 | Manufacturing notes | Controlled, revision-bound instructions/references from authorised sources. AI suggestions/free text are not approved instructions. |

**AC11:** default displays expose all ten logical fields, including unspecified states. PDF, CSV and XLSX share field meanings/units and row identity. Cut/finished dimension groups expand explicitly into length/width/thickness numeric columns; technical traceability columns/worksheets/manifests are additional to the ten business groups and cannot be removed from the underlying dataset. Every derived variant maps back to source BOM/occurrences, with disjoint, exhaustive leaf membership and conserved quantities. Hardware allowances do not enter an approved purchasing subtotal. A missing required field is a release blocker, not a default filler.

### R12 — embedded and standalone schedules

Allow schedules within drawing packages and separately as PDF, CSV and XLSX. Separate approved purchasing data from demonstration allowances, and make scope/status/revision visible in each format.

**AC12:** all three formats are rendered from one frozen schedule dataset and agree on row IDs, values, units, quantities and unspecified statuses. PDF continuation rows do not duplicate quantities. XLSX retains typed numeric cells, explicit statuses and a traceability/provenance sheet; CSV defines encoding, delimiters, units, numeric precision, missing-state encoding and traceability fields/sidecars. Formula-like user text is safely encoded without changing its logical value. No formulas or spreadsheet auto-conversion may silently alter part codes or dimensions. Standalone files identify their baseline/scope and preliminary/release status.

### R13 — automated validation plus authorised approval

Require complete applicable engineering, feature, dimension, schedule, presentation and package validation plus authorised human approval before manufacturing release. Role/identity, scope, evidence, policy version, current approval state and exact approved content must be verifiable. Local profile preferences, a typed name, checksums and existing assumption strings are insufficient authority.

**AC13:** current reference designs remain blocked and `manufacturingReady` remains false. Future release transitions require a separately reviewed capability/schema change; a documentation adapter cannot reinterpret the existing literal false as approval. Tests reject stale geometry/metadata/datum/tolerance/template/profile/renderer dependencies, missing or revoked approval, unsigned/self-declared authority, hidden required content and incomplete exports. Explicit standards claims have independent scoped evidence; a company-approved release does not automatically assert BS/ISO compliance. Any change to approved content requires revalidation and renewed approval under the applicable policy. No silent “presentation-only” exemption is assumed initially.

### R14 — company layouts and constrained future template import

Support versioned company layouts with reserved drawing/table/title-block zones, fonts, approved branding and field bindings. Keep company presentation policy separate from approved engineering tolerance/process policy. Future DWG/DXF import is an isolated template ingestion feature, not a general CAD-editing subsystem.

**AC14:** templates cannot overwrite semantic numeric labels, hide required release notes or bypass minimum readability/coverage checks. A template change is revision-visible and requires review of affected output. Imported templates, when eventually implemented, have explicit unit/origin mapping, bounded entity support, file/hash provenance and isolated sanitisation; unsupported objects, scripts, external links, proxy entities and unreadable fonts produce diagnostics/rejection. Raw uploaded bytes are not executed or silently trusted. Phase 5A implements no import/parser and claims no compatibility with arbitrary DWG/DXF files.

### R15 — selected downloads and structured ZIP packages

Allow selected sheets/components/subassemblies/schedules to download individually, and complete manufacturing scopes to download as structured ZIP packages. Freeze a single documentation baseline before asynchronous generation; include a manifest with source revisions, scope, dependency closure, selected/omitted artifacts, validation/approval references, file hashes and quantities/status provenance.

**AC15:** PDF/CSV/XLSX/ZIP cannot combine different engineering/profile/metadata revisions. Editing while export runs either cancels/restarts or completes an explicitly identified older snapshot; it never uses new filenames/metadata with old geometry. Paths/filenames are unique and sanitised. ZIP contents match the manifest and hashes; failure produces no apparently complete manufacturing package. A subset/individual download is clearly partial and cannot assert completeness for the whole furniture assembly. A manufacturing subset must have a complete approved dependency closure for its declared scope. Missing required details/metadata/schedules invalidate production packaging; draft selection remains allowed with omissions recorded. No G-code is present.

## 3. Coverage, reconciliation and controlled grouping

Maintain separate but connected identities: immutable source occurrence ID; source assembly ID; engine BOM line identity within its snapshot; stock-blank group; manufacturing variant/part number; scoped assembly item label; semantic dimension/feature/annotation ID; sheet/artifact ID. Use an instance namespace when combining furniture instances; do not rewrite their original IDs or infer assembly relationships from path text.

The engine currently groups rectangular blanks by material and sorted face lengths/thickness. Adding a hole pattern, handed edge treatment or grain requirement can make two blanks different finished parts. The future master dataset may partition one engine line into manufacturing variants, but it must conserve its occurrence membership and quantities exactly. It must not merge manufacturing-distinct rows simply because their cut sizes match. Cross-assembly shared blanks and shared hardware definitions retain source scope/classification. Unspecified metadata is not evidence that two parts are interchangeable.

Coverage is an explicit graph of required scopes, variants, features, dimension characteristics, datums, tolerances, schedules and artifacts. A diagnostic must identify the affected references and a corrective action/review owner. A feature with no selected drawing is a gap; a balloon with no visible anchor is an annotation issue; a group with no purchasing approval remains an allowance. Those conditions are related but cannot stand in for one another's approval.

## 4. Revision and release contract

Freeze and identify the engineering snapshot, manufacturing metadata, numbering registry, semantic coverage/rule versions, datum/tolerance decisions, profile, company template/assets/fonts, presentation edits, renderer/exporter versions and release policy. The existing canonical engineering revision remains intact; additional content digests supplement it. Human-readable drawing revision “A” is a label, not a unique content identity.

Changing any dependency invalidates affected cached artifacts and approval eligibility. Re-resolve anchors and references after changes; never carry paper positions over by array index or geometric proximity alone. A hash demonstrates content identity/integrity, not approver authorisation or engineering adequacy. A future authoritative approval service or approved external signing workflow is a prerequisite for release; local storage remains presentation preference storage.

Proposed lifecycle: **draft → validated for stated scope → awaiting authorised review → approved frozen artifacts → superseded/revoked**. Approval is bound to the exact baseline and payload manifest; revocation/staleness is checked at handoff. Geometry validity, automated document coverage and human sign-off are separate gates. The current engine/documents can participate only as preliminary data until all release capabilities and evidence exist.

## 5. Acceptance fixtures and engineering decisions

Retain the reference geometry and existing regression fixtures. Future acceptance suites must cover dimensions/count edits, all 29 occurrence IDs, reordered BOMs, split manufacturing variants with conserved blank totals, shared parts across hierarchy levels, mirrored/rotated frame changes, unsupported features, unspecified tolerances/finishes, hidden required sheets, congested views, obsolete presentation edits, corrupt/future profiles, stale/revoked approvals, concurrent export edits, standalone/ZIP cross-format equivalence and export failure/cancellation.

Required engineering/product review before corresponding implementation can be called manufacturing-complete:

| Decision | Review responsibility | Proposed treatment until resolved |
| --- | --- | --- |
| Functional/inspection dimension checklist per family/process | Furniture engineering and inspection leads | Only known nominal dimensions are shown; complete manufacturing coverage stays unresolved. |
| Datum/edge/frame rules, handedness and permitted overrides | Manufacturing and quality engineering | Proposal plus explicit review; no automatic datum/GD&T approval. |
| General/critical tolerances, fit policy and process capability | Company engineering/quality authority | No numeric/class defaults; reference zero nominal back gap remains unaltered and unapproved for production fit. |
| Materials, grain, edging, finished-size relationships and finishes | Company manufacturing/materials authority | Unspecified, with scoped release blockers; no inferred stock/grade/allowance. |
| Machining definitions, fixing details and subassembly complexity rules | Joinery/production engineering | No holes/operations derived from generic anchors; thresholds/rules remain proposed. |
| Durable part numbering and variant equivalence policy | Company document control and engineering | Existing item labels remain document labels; registry decisions require approval. |
| Approved purchasing selections, strengths, stability and installation requirements | Responsible engineering authority | Existing 160/8/8 allowances excluded; no production purchasing quantities invented. |
| Signatory roles, evidence retention, revocation and trust service | Company quality/document control and application owner | Release unavailable until authorised identity/evidence infrastructure exists. |
| Required release scope, subset rules and company template examples | Manufacturing users and document control | Draft omissions visible; incomplete selections cannot become manufacturing packages. |

This specification establishes a staged target, not a claim that any of these open engineering decisions have been settled. The [Phase 5B slice](drawing-architecture-roadmap.md#5-recommended-phase-5b-slice) deliberately implements only a small, testable part of the architecture.

### Phase 5C.2B implementation note

[Contextual sections and details](contextual-assembly-sections.md) provide a true rectangular-solid assembly section, cut-only hatching, source-linked functional reference repeats and an enlarged rear/back/base crop. Existing component dimensions and all 26 core functional requests remain on their current sheets. This implements a preliminary presentation slice only; datum/tolerance authority, machining/fixing detail and manufacturing-release requirements remain unfulfilled.

### Phase 5C.2C implementation note

[Contextual functional dimensions](contextual-functional-dimensions.md) now provide preliminary contextual coverage for all 26 core requests, preserving source values and distinguishing actual rear space from its minimum intent. Normal built-in profiles use contextual FC/SC drawings instead of isolated FD sheets. This does not satisfy unimplemented feature, tolerance, inspection, hardware or manufacturing-release requirements.

## Phase 5D.1 data foundation update

[Panel manufacturing properties](panel-manufacturing-properties.md) now implements the bounded source-bound metadata/identity foundation supporting R05/R07/R10/R11: two broad faces/four perimeter edges per physical occurrence, explicit local orientation, unknown/provisional/verified property records, conservative derived variants and stock grouping, and stale/source/reference validation. It does not implement manufacturing drawings/schedules, finished-size deductions, validated processes or release authority. All production/demo manufacturing requirements remain unassigned; existing demo stocks remain provisional and manufacturing readiness remains false.

## Phase 5D.2 visible property slice

[Visible panel manufacturing properties](visible-panel-manufacturing-properties.md) implements a provisional occurrence editor, physical face/edge maps, directional grain/treatment symbols, property continuations and ten-field source-bound manufacturing schedules. The current application has a 17-page reference A3 package; legacy API calls without manufacturing input retain 12 pages. All 29 panel occurrences, 87 nominal measurements, 26 functional relationships, original BOM and false manufacturing/compliance/purchasing safeguards remain intact. Assigned property references are proposals, not approved materials/processes, calculated finished dimensions or manufacturing release data.
