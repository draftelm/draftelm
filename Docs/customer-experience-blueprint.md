# Customer experience blueprint — Phase 5UX.1

**Implementation update:** [Phase 5UX.2](customer-first-workspaces.md) now provides Design/Manufacturing separation, retained panel drafts and replacement confirmations. The complete five-stage journey and subsequent Basic/library/output redesigns remain proposals. The current-journey table records the pre-5UX.2 audit baseline.

Audit date: **23 November 2026**. **Proposal, not implemented functionality.** This document uses the [current feature inventory](product-feature-inventory.md) and preserves the authority boundaries in the [drawing/manufacturing specification](drawing-manufacturing-specification.md). Delivery steps and acceptance checks are in the [UX implementation roadmap](ux-implementation-roadmap.md).

## 1. Recommended product direction

Organise the product around five customer tasks: **Describe → Design → Manufacturing → Review → Export**. Keep the 3D viewer, engineering model, panel requirements, schedules and drawing generator as shared systems underneath those tasks. A different screen must not mean a different version of a panel or a second BOM.

Basic should ask for the few decisions needed for the current task, explain missing information and offer suitable reusable definitions. Advanced should expose precise supported values and their provenance within the same project. Neither mode can turn missing information into approval.

The first-time experience should start with the **existing chest reference**, explicitly preliminary, rather than suggesting that arbitrary furniture can already be generated from text. A customer should first see the cabinet and its four design inputs, then choose when to prepare manufacturing information. The library should be useful without requiring a new user to become a catalogue administrator.

## 2. Current customer journey and friction

This is the current source-rendered order in [FurniturePreview](../src/components/furniture/FurniturePreview.tsx), [PanelManufacturingEditor](../src/components/furniture/PanelManufacturingEditor.tsx) and [DrawingPanel](../src/components/drawings/DrawingPanel.tsx). It is not a newly observed browser session.

| Current step | What the customer encounters | Friction / consequence |
| --- | --- | --- |
| Enter from `/` | A 3D-printable-part promise and separate Furniture preview link. | The customer may expect the description box to create furniture or expect unsupported file types. |
| Open `/furniture` | Chest reference, warning, dimensions, layers, 3D viewer and technical inspector. | A useful model appears immediately, but purpose/next action are unclear; coordinates and thickness axes compete with ordinary design decisions. The heading still says Phase 5B.1. |
| Inspect or alter design | Four inputs regenerate immediately; multiple selection entry points. | Drawer count/height/depth combinations can become invalid under the fixed box/runner assumptions. All four inputs share an error indicator instead of a clear affected-field explanation. |
| Explore movement/explosion | Two large sections, modes, travel settings, percentages and drawer checkboxes. | Optional inspection tools occupy the path to manufacturing setup; a demonstration travel value can be mistaken for a hardware choice. |
| Start manufacturing | Example/Save/Load/Reset actions, library management, Basic/Advanced and an occurrence selector. | A first-time user must understand session management before the main manufacturing task. Basic affects only this editor. The fallback front selection can disagree with an empty inspector selection. |
| Edit one panel | Diagram, material input/library, grain, face roles, good-face text, finish state/reference/library, edge state/type/reference/library and older edging presets. | Too many routes to a simple decision. The question “Which edge needs banding?” is buried in administration and specification detail. |
| Try reuse/matching | Version review, creation forms, separate legacy presets, matching registration accordion and all-panel bulk list. | Required safety review is useful, but raw IDs/JSON make it hard to see which real parts and fields change. Basic still exposes a technical matching workflow. |
| Apply or leave | Apply at the top and bottom; Undo/Reset draft; separate Save properties. | Apply commits to the active session, Save persists only applied properties, and switching panel replaces the keyed form. Pending work can be lost without an explicit save/discard decision. |
| Inspect drawings | Export action, extensive drawing settings, coverage/intent diagnostics, live schedule, sheet dropdown and SVG preview. | The drawing itself is below substantial configuration and reporting. Export appears before a package-scope review. |
| Inspect tables | Ten-column schedule with traceability and grouping, then engineering BOM farther down. | The two tables have different purposes but feel duplicated. On small screens the schedule requires horizontal scrolling. Unknown/provisional reference data correctly stays as 29 rows, which makes the grouping toggle appear ineffective. |
| Download / return later | Whole configured PDF; several separate local save/load actions. | No unified project save, restore order or release history. Selection can affect exported MP scope; saved properties alone do not restore the cabinet dimensions. |

### Highest-priority problems

| ID | Finding and source evidence | Recommendation |
| --- | --- | --- |
| UX01 | One long page presents several different jobs at once. Optional movement/explosion tools precede manufacturing. [FurniturePreview](../src/components/furniture/FurniturePreview.tsx) | Introduce task workspaces; put inspection controls beside the viewer. |
| UX02 | Two component selectors, model/BOM/schedule selection, drawer highlighting and a separate bulk checkbox list overlap without one obvious selection model. [inspector](../src/components/furniture/ComponentInspector.tsx), [editor](../src/components/furniture/PanelManufacturingEditor.tsx) | Use one named selection with breadcrumbs; keep inspection highlighting separate from explicit bulk edit scope. |
| UX03 | Basic still shows material/finish/edging creation and several physical role choices. [form](../src/components/furniture/PanelPropertyForm.tsx), [picker](../src/components/furniture/CataloguePresetPicker.tsx) | Show a short task summary and open only the selected material, face or edge question. Move definition administration to Libraries. |
| UX04 | Versioned edge library and legacy edging presets coexist. Both Apply actions commit the same draft; profile/template controls overlap. | One primary Apply action; one library chooser. Migrate legacy presets explicitly. Provide one output preset with optional company-template detail. |
| UX05 | Apply, local Save, Reset draft, Reset properties, Reset specification and profile reset have different effects. Panel switching can discard a pending draft. | Consistent Applied/Pending/Saved locally labels; guard changes of selection/task/reset/load. Explain exact reset scope. |
| UX06 | Source IDs, world coordinates, U/V registration and JSON reviews appear close to everyday work. | Use part names, thumbnails and human-readable before/after reviews, with exact IDs always inspectable/copyable. |
| UX07 | Engineering diagnostics, preliminary warnings and successful consistency checks are interleaved without one action queue. | Keep a persistent honest status summary; group issues by task/part and provide a direct route to resolve or review each. |
| UX08 | Both profiles largely share content; default output follows broad feature inclusion and occurrence rows. [profiles](../src/drawings/profiles.ts), [output defaults](../src/drawings/manufacturingOutput.ts) | Introduce purpose-based output policies, actual page preview and explicit export scope. Do not shorten output through font reduction or unapproved grouping. |
| UX09 | Multiple local saves do not restore a complete cabinet project. [current ownership](product-feature-inventory.md#current-data-ownership-and-persistence) | Show the current storage boundary now; implement unified versioned project persistence as a separate milestone. |
| UX10 | Home-page claims and inert navigation imply more functionality than is connected. [Hero](../src/components/Hero.tsx), [Navbar](../src/components/Navbar.tsx) | Present the supported chest workflow as the furniture entry; clearly separate the older prototype and unavailable exports/accounts. |

These are expert-review findings. Priority is based on task interruption and the risk of misunderstood changes; no measured completion times or customer error rates are claimed.

## 3. Proposed screen hierarchy

```text
Furniture project
  Persistent header: project name · preliminary/source status · local save status
  Stage navigation: Describe | Design | Manufacturing | Review | Export

  Describe
    Start with chest reference · project brief · supported design requirements
  Design
    Cabinet dimensions/drawer count · central 3D · contextual part inspector
    Optional viewer tools: layers, drawer opening, explosion, reset camera
  Manufacturing
    Setup summary · assembly/part list · central panel/assembly view
    Context sidebar: material | displayed face | grain | selected edge
    Schedule tab · scoped reuse/review action
  Review
    Issues and affected parts · drawing navigator/preview · source/coverage detail
    Required engineering decisions · release status (currently unavailable)
  Export
    Workshop/Engineering output · explicit scope · actual pages · preliminary PDF

  Supporting destinations, not extra mandatory stages
    Libraries: project/company material, treatment and finish definitions
    Project details and local save/restore
    Company drawing setup (supported fields; later controlled templates)
```

Keep these within the furniture workspace initially; five new routes, a dashboard and an account system are not prerequisites. Stage navigation is task navigation, not a five-step approval checklist. Users may revisit a task and inspect preliminary output with unresolved requirements. Only operations whose prerequisites are invalid/stale should be withheld; merely visiting a later stage must not certify completion.

### Where each representation belongs

| Representation | Primary home | Contextual access elsewhere |
| --- | --- | --- |
| 3D assembly | Design; also useful as a selection aid in Manufacturing. | Review can highlight a part linked from an issue. Optional opening/explosion remain inspection tools. |
| Physical panel diagram | Manufacturing, for the selected occurrence/face. | A small panel thumbnail in reviews and bulk proposals. Stable E1–E4 mapping available. |
| Panel properties | Manufacturing sidebar/task card. | Review opens the same editor for the same ID, without copying properties. |
| Ten-field schedule | Manufacturing Schedule view, with named occurrence details. | Review checks quantities/unknowns; Export selects its printed inclusion. |
| Engineering BOM | Advanced source/quantity view inside Manufacturing or Review. | Explain its distinction from finished variants and raw stock compatibility; do not calculate a competing list. |
| Drawings | Review drawing navigator with large preview. | Manufacturing offers an immediate selected-panel preview; Export shows the final included pages. |
| Company definitions / template setup | Supporting Libraries/Company setup destination. | Contextual picker opens only suitable definitions; administrators need not configure them for every panel. |
| Approval status | Persistent status, with full explanation in Review. | Export repeats the status. Current product offers preliminary download only; no working Approve/Release control exists. |

On a narrow screen, replace the sidebar with a named expandable panel and a clear return to the selected item. Keep form controls, issue navigation and the part list operable without WebGL or a mouse. Do not make a 1500 px schedule or a 720 px sheet the only way to find an unresolved property.

## 4. Five-stage journey

| Stage | Customer question | Essential decisions / screen | Completion and next action |
| --- | --- | --- | --- |
| **1. Describe** | What am I making? | Select the supported chest reference, optionally name it and record intended use/site constraints. Explain one drawer column and preliminary construction. Typed intent is a brief until explicitly mapped to supported values; do not claim a new furniture parser. | “Use this reference” → Design. Unknown load/site/installation requirements remain visible; no inferred safe load. |
| **2. Design** | Is the cabinet the size and arrangement I need? | Large closed 3D model plus width, height, carcass depth and drawer count. State carcass versus closed overall depth. Show fitting errors beside the affected decision and explain fixed assumptions. | Valid nominal geometry enables Manufacturing; invalid edits retain their values and an explanation. “Continue with preliminary design” is not engineering approval. |
| **3. Manufacturing** | What must each physical panel be made from and look like? | Setup by explicitly selected role/occurrences, then exceptions on individual panels. Material, face quality, grain and edges appear as short visual tasks; definitions reused through scoped proposals. | “Review project” opens unresolved requirements and actual drawings. Missing properties remain unknown; no forced fictitious material/none selections to pass a wizard. |
| **4. Review** | What is consistent, and what still needs a decision? | Separate geometry/data errors, missing/provisional specifications, omitted/deferred coverage and presentation diagnostics. Select an issue to highlight its part/view and open the relevant control. Review drawings and schedule at the same source revision. | Clear preliminary status, affected scope and actions. Automated checks can pass while manufacturing release remains unavailable. |
| **5. Export** | What information am I sending, to whom and for what purpose? | Choose Workshop/Engineering preliminary output, explicitly confirm project/part scope and view included/omitted pages with actual count. Optional company setup under disclosure. | Download the current validated **preliminary vector PDF**. Invalid/stale data withholds it; unresolved but consistent proposals remain labelled. No release action until a separate authorised capability exists. |

Proposed Basic Design surface: four editable design inputs and one Continue action. Viewer tool buttons and a status summary are not additional required setup decisions. Describe should not ask the same dimensions again. Project naming can remain optional for exploration, and export metadata can be requested when it matters.

## 5. Basic and Advanced responsibilities

Basic/Advanced are two views of the same project, not different quality levels, different BOMs or permission roles. Changing mode must preserve pending edits, source identity, selection and outstanding requirements.

| Area | Basic | Advanced / specialist access |
| --- | --- | --- |
| Cabinet design | Four supported main inputs, visual fit feedback, clear construction summary. | Exact supported construction/thickness/runner parameters only when their editor and validation exist. Initially show unsupported authoring as read-only information; do not invent a full Advanced engine editor. |
| Materials | Choose a compatible reusable material, or leave unknown/create a clearly provisional custom proposal. Show known thickness and material status. | Grade, manufacturer/supplier codes, engineering stock identity, stock restrictions, definition versions and evidence context. A stock replacement is an engineering change, not a description edit. |
| Faces | Display A/B explicitly; ask which face needs the required appearance and show its finish. Opposite face can remain unresolved. | Independent decorative/reverse/visibility meanings and manufacturer good-face acceptance criteria with physical references. |
| Grain | Arrow choices described relative to the displayed panel, plus non-directional/unknown. | Local-axis direction/sense, stock reversal restrictions and explicit cross-front group/registration. Matching remains unverified until supported review establishes more. |
| Edges | Click an edge; choose Unknown, No treatment or a supplied treatment. Show a compact treatment summary. | Material/thickness/code/process/appearance, stable edge identity and provenance. Explicit no treatment stays a decision, never a visibility default. |
| Reuse | Named, compatible preset and explicit selected target parts. Plain-language before/after proposal. | Define/version libraries, inspect precise scope/orientation and resolve conflicts; legacy migration. |
| Schedules | Useful names, quantities, size and unresolved summaries; all ten fields remain accessible. | Full traceability, variant/blank comparisons, statuses and source references. Any narrower display is not a smaller underlying dataset. |
| Drawings | Purpose preset, legible preview and contextual panel drawing. | Sheet/view selection, projection, scales as supported, numbering/company fields, coverage and placement diagnostics. No editable numeric dimension replacement. |
| Evidence / overrides | See pending/unverified status and the owner of an unresolved decision. | Inspect evidence and, in future, make supported authorised overrides with reason/impact review. Current UI cannot grant verification or override validation; Advanced is not authority. |

### Reuse company settings honestly

When a future controlled company preset is available, Basic can offer it by applicability and explicit scope. It must show version, relevant status and exceptions. A catalogue-level verification record alone does not approve an occurrence, stock substitution, load case or release.

**Today there is no authenticated approved company preset service.** Until one exists, offer the current versioned local proposals under that name. Do not replace “provisional” with “company approved” to make the interface look simpler. A user without a suitable preset can continue with an explicit unresolved requirement or create a provisional candidate.

Contextual questioning should be deterministic first: if a field is missing, show the affected panels, why the information matters and the available supported answers. For example, ask about banding after an edge is selected, and matching only when the user requests coordinated fronts. Do not ask for pattern registration on every ordinary panel. Record “decide later” as unresolved; do not auto-select none/non-directional.

### Reusable manufacturing setup, without hidden changes

1. Select a named set such as the four drawer fronts; display the actual occurrences and orientations. This is a proposed convenience selector, not an existing automatic editing group.
2. Choose a material/treatment/finish proposal and explicitly choose the fields to apply. A setup recipe may link several catalogue definitions in future, but current entries are individual definitions, not complete company construction policies.
3. Show a visual before/after review for every affected face/edge. Identify overwritten values, unknown replacements, incompatible stock, different orientations and retained exceptions.
4. Confirm the exact scope and apply atomically. Do not expand it because another part shares dimensions or a name. Changing scope/data invalidates confirmation.
5. Keep resulting proposals provisional. Preserve each ID and each matching registration; copying a screen's “left” edge to a differently oriented panel requires an explicit physical mapping, not text matching.

The current bulk action copies all editable fields, including unknowns. A future “apply material only” or “keep existing edges” action needs an explicit field-scoped domain operation and tests; hiding fields in Basic cannot change what that existing operation copies.

## 6. Selection, drafts and feedback

Use one active physical occurrence across 3D, tree/list, editor, schedule and selected-panel drawing. Show a name such as **Drawer 1 → Separate front**, a small diagram and an inspectable stable ID. A parent drawer may highlight for context, but it must not silently become the edit scope. A BOM blank row may highlight many parts; applying to those parts still requires explicit scope review.

Maintain three clearly named states: **Pending changes** in the form; **Applied to this project** after validation; **Saved in this browser** after persistence. Current local persistence is not a company backup. Provide one primary Apply action per task, with Undo and Discard pending changes beside it. Guard panel changes, task navigation, load/reset and mode-related remounts whenever a dirty draft would be lost. Support Apply and continue, Discard and continue, or Stay; validation failure keeps the draft and current location.

Display geometry errors, source-stale requirements and provisional information differently. Suggested status language:

- “Design needs correction” for invalid geometry.
- “Manufacturing information needs review after design change” for stale bindings.
- “Preliminary — material/finish decisions outstanding” for consistent but incomplete information.
- “Drawing checks passed for this scope” for scoped presentation/data checks, with **Not approved for manufacture** still visible.

These labels should reflect existing validator states, not introduce an unreviewed readiness percentage or an inferred safety score. A grouped issue card can represent many low-level diagnostics, but it must retain all affected references and an expandable exact list. Deferred supporting relationships and hidden/unplaced required displays need different explanations.

## 7. Drawing-output proposal

### Why the current package is lengthy

The current default combines GA, root explosion, carcass/drawer subassemblies, sectional/functional view families, three grouped component sheets, manufacturing maps, ten-field occurrence schedules and unverified hardware. Nearly every implemented drawing family is on. Fixed readable lettering and the 29 long occurrence rows create legitimate continuations. CP and MP repeat panel geometry for different purposes; extra maps are controlled, but the selected panel still drives default MP scope.

The proposal is **purpose selection**, not deleting engineering records or compressing text. Do not make unknown/provisional panels share approved-equivalent rows just to reduce page count.

| Output family | Proposed concise Workshop preliminary preset | Proposed detailed Engineering preliminary preset |
| --- | --- | --- |
| GA and overall dimensions | Include a clear assembly reference with linked part list. | Include, with supported detailed view/annotation options. |
| Component sizes | Include complete applicable nominal component measurement coverage. | Include full nominal component coverage and traceability. |
| Functional sections/details | Retain the A-A/B, C-C/I/J and front/D/E/F families for the current 26-core coverage. | Retain them; allow diagnostic views separately. Twenty supporting deferrals stay explicit. |
| Root exploded/drawer/carcass sheets | Optional according to the task; off in a proposed concise reference review subset, with omissions identified. Current subassembly rules are not approved manufacturing-release policies. | On by default, with existing honest visibility diagnostics. |
| Panel property maps | Explicit selected scope, compact grain/face/edge notes; no map merely because somebody clicked a panel earlier. | Explicit selected/all-edited scope; detailed tables available where useful. Do not create 29 maps automatically. |
| Manufacturing schedule | Ten fields; maintain occurrence rows under current rules. | Same dataset, plus inspectable provenance/detail. No competing regrouping/calculation. |
| Library definitions | Shared used-version legend once, required if printed L references would otherwise be undefined. | Shared used-version definitions, with fuller details as needed. |
| Hardware | Optional separate unverified allowance appendix, normally omitted from the concise panel-work subset. Omissions disclosed; never an approved purchasing list. | Include unverified allowance appendix with zero approved purchasing quantity. |
| Metadata / layout | Company preset if supplied; otherwise a simple supported native template. | Supported company fields, projection, numbering and bounded style configuration. Both remain unverified for standards compliance. |

For the unchanged reference, omitting the root explosion, drawer, carcass and hardware pages suggests roughly **12 rather than 16 A3 pages**, if the remaining section layout fits as expected. This is a **planning estimate, not a generated or promised count**. The 29-row schedule alone still needs about four pages under current presentation. Add used definitions or long notes and the count grows. A full Engineering selection may stay at 16/17 pages or grow with detailed tables; detail is intentional there.

Do not target a four-page “manufacturing package” before solving the scope and coverage questions. A separate short design-review subset may omit component/schedule content, clearly labelled partial and preliminary; it is not the Workshop manufacturing-information set. Re-layout, verified grouping policy and future schedule exports can be evaluated later without losing semantics.

### Export safeguards and settings

Export must preview its **explicit scope**, included page list, omitted information, source status and actual generated page count. Selecting another panel in 3D should not silently change a confirmed export scope. Reuse existing profile versions and migrations; do not overwrite saved company choices when adding product presets. Keep projection/template/style choices independent of Basic/Advanced and of engineering truth.

For current capabilities, the only download action is **Download preliminary PDF**. Invalid/stale data still blocks export; consistent unresolved proposals may be downloaded with their warnings. Hidden sheets keep internal requirements and source references. A future manufacturing release needs engineering completeness, authenticated authority and a frozen reviewed baseline; a checkbox in Review, a typed name, a Workshop label or an attractive drawing cannot supply those capabilities.

## 8. First-time reference-chest walkthrough

1. **Describe:** “Start with a chest of drawers.” Explain the reference uses demonstration material/hardware assumptions. Offer an optional name; no account or library creation required.
2. **Design:** Show the 900 × 850 × 500 mm four-drawer carcass and a clear 518 mm closed-depth note. Let the user change the four main inputs. Put opening/explosion behind Inspect controls. Explain any fit failure without asking them to edit engine parameters they cannot yet author.
3. **Manufacturing:** Show a summary of outstanding material, face, grain, edge and finish decisions. Start from an explicitly selected named front, not an unannounced default. Let the user choose an available local proposal or leave it unresolved. Clicking the lower edge opens that edge's treatment only. Flip to B to see separate finish data. Applying updates the selected-panel preview and schedule.
4. **Reuse when requested:** “Apply this material to selected fronts” proposes the actual four IDs and fields with a before/after review. Do not copy matching registration or unrelated unknown fields. This field-scoped convenience is future implementation, not current behaviour.
5. **Review:** Show the affected source-linked drawings and a short list of unresolved engineering decisions: actual stock/grade, hardware/fixings, good-face acceptance, grain/matching, finishes/treatments, finished-size rules, loads/stability and any applicable tolerances/process/inspection requirements. Completing UI fields cannot resolve the unimplemented release requirements.
6. **Export:** Choose the preliminary output purpose, inspect actual pages and omissions, then download vector PDF. Offer local save with an honest statement of what is retained. Synthetic examples remain an explicit learning action, separately labelled and reversible.

The intended result is fewer simultaneous decisions, not fewer recorded requirements. This walkthrough needs usability testing with manufacturers who did not help build the product; the next document defines a small first implementation and measurable exit criteria.
