# Customer-first furniture workspaces — Phase 5UX.2

Implemented 23 November 2026. This is the first implementation slice from the [UX audit roadmap](ux-implementation-roadmap.md). It introduces **Design** and **Manufacturing**, not the complete proposed Describe/Design/Manufacturing/Review/Export journey. Existing furniture geometry, manufacturing meanings, drawing generation and approval restrictions remain authoritative.

## What changes on screen

**Design** opens first. Its main surface contains the four existing cabinet inputs, the live assembly and a named panel inspector. Panel visibility, movement/explosion and detailed engineering references are disclosed when requested. Rotate, pan, zoom, reset, drawer controls, layer selection and the two explosion modes remain available. The preliminary warning and engineering assumptions remain accessible.

**Manufacturing** has three task views:

- **Panel setup:** the existing visual A/B face and physical-edge editor, Basic by default with Advanced available. Selection uses the same physical panel as Design. All materials, grain, face quality, treatments, finishes, library and bulk-edit functions remain available.
- **Schedule:** the same ten-field applied-property dataset, conservative grouping and occurrence-level traceability. Selecting a row returns to that named physical panel's setup.
- **Drawings & PDF:** the existing vector preview and export, with settings/preferences and engineering checks collapsed beside the drawing. The selected-panel drawing action opens this view directly. This is drawing access, not a new Review/Export or release system.

Both workspaces refer to the first drawer front initially, matching the previous manufacturing reference selection. Clearing selection explicitly leaves no active panel; there is no independent editor fallback. All panels remain selectable by name, with exact physical IDs available. Engineering BOM inspection is a separate disclosure in Manufacturing, not another mandatory configuration task.

Manufacturing shows a short count of panels needing information and a persistent unapproved status. Exact missing/provisional diagnostics and pending IDs remain expandable. A summary does not remove any underlying requirement or claim that a successful check grants readiness.

## Applied values, drafts and local saves

| Operation | Exact effect and protection |
| --- | --- |
| Edit a field | Creates a pending, unapplied panel draft. Preview/schedule/PDF continue to use applied values. |
| Change workspace, task view or panel | Keeps the draft, undo history, selected physical edge and unfinished library-entry fields for each visited panel. No implicit Apply or discard. Basic/Advanced and displayed face/turn survive. |
| Apply to current project | Validates and applies the current draft using the existing domain operation. Values remain provisional. The single Apply button replaces the previous duplicate actions. It does not write browser storage. |
| Bulk Apply | Retains existing exact-ID, document/draft-bound review and confirmation. If other targeted panels have pending drafts, an additional replacement modal identifies them; cancel preserves their work. A changed document invalidates an old bulk confirmation. No size-based scope or variant merge. |
| Undo draft change | Reverses the latest pending edit, retaining the existing 40-step history. |
| Restore applied values | Restores that panel's applied values to its draft; the restoration itself can be undone. Does not reset the project or local save. |
| Save applied properties locally | Saves only applied source-bound panel properties and example provenance in this browser. Disabled while any panel has a pending property draft or the source is stale. Does not save cabinet dimensions, pending forms, libraries or drawing preferences. |
| Load saved properties | Requires replacement confirmation; parsing must succeed before current drafts are cleared. Stale documents still require source review. |
| Reset all panel properties | Requires confirmation, then clears active applied properties and retained form sessions to source defaults. Does not erase local saves or grant approval. |
| Reset design to reference | Requires confirmation; resets design/view tools, retaining applied properties and drafts. A changed engineering source still triggers stale review. |
| Carry reviewed edits as provisional | Review binds to the exact current engineering revision. A modal discloses that pending drafts cannot automatically transfer. Compatible applied values carry as provisional; incompatible bindings/new/deleted IDs follow the existing resolver. |
| Try/exit synthetic example | Confirmed replacement; retains example provenance and restores the earlier applied session on exit. The modal discloses pending form sessions that reset. |
| Library Save/Load | Separate versioned local workflow. Loading merges compatible known/pinned versions; does not apply properties or alter panel drafts. Legacy edging proposals retain their distinct save/load behaviour. |
| Drawing settings | Continue to update preview immediately. Save preferences persists profile settings only; Load and Reset require confirmation. Panel requirements/geometry never change because a profile is selected. |
| Leave the page | Native reload/close warning for pending drafts or unsaved applied property changes. Ordinary links leaving the furniture route receive a modal first. Workspace/task changes need no discard warning because work is retained. |

The browser may suppress native unload prompts according to its policy. Session drafts are not durable recovery storage. Company accounts, full project save/load and browser-history navigation recovery remain future work. Closing the page or confirming departure can lose cabinet inputs and unsaved session state. Reset/replacement modals also explain that panel-form undo history, bulk review and unfinished library-entry forms reset.

## State and source architecture

[FurniturePreview](../src/components/furniture/FurniturePreview.tsx) still owns one set of design inputs, generates one result and shares one active selection. No second project/BOM is created. The older home-page ProjectContext remains separate.

[WorkspaceTabs](../src/components/furniture/WorkspaceTabs.tsx) only selects task presentation. Both workspace panels and the drawing component remain mounted. Hidden content is excluded from normal focus/accessibility navigation. Arrow keys, Home and End move between tabs; the selected tab is the single tab-list stop. Camera fitting responds to bounds/reset rather than every container resize, and reconciled drawer positions are memoised so task switching does not recreate fitting bounds.

[PanelManufacturingEditor](../src/components/furniture/PanelManufacturingEditor.tsx) retains forms only for visited physical panels. The existing [form](../src/components/furniture/PanelPropertyForm.tsx) still owns each panel's pending fields/history/scope; keeping it mounted also preserves unfinished library authoring. The parent tracks pending status and protects cross-panel bulk replacement. Each [diagram](../src/components/furniture/PanelFaceDiagram.tsx) has unique grain-marker IDs, avoiding collisions between retained hidden SVGs.

The first pending property edit captures its source document even before Apply. A geometry change cannot silently rebind that draft to new sizes. During staleness, forms use their last valid source context and are hidden/inert. Drawing/export validation still receives the actual current result and stale properties, so output is withheld. Returning to the exact original source can recover the draft. Explicit rebase/reset/load rebuilds form sessions after confirmation.

[ConfirmProjectAction](../src/components/furniture/ConfirmProjectAction.tsx) uses a native modal with keyboard containment, initial Keep current work action, Escape cancellation and focus restoration. This is editing consent, not approval authority.

Future guidance can consume selected-panel/validator data, company rules can enter through validated engineering/manufacturing contracts, and drawing presets can extend profile inputs. Navigation does not own those facts. No empty AI, approval or future-workspace buttons are added.

## Output and engineering safeguards

No furniture/manufacturing domain calculations, drawing profiles/defaults, generators, nominal dimensions or BOM formulas are changed. The reference remains **29 panel occurrences, seven nominal blank groups, 87 component measurements and 26 core functional relationships**, with **20 supporting deferrals**. The selected-front A3 package remains **16 pages**. Applied library definitions, long notes or different settings can still add pages. Pending drafts do not appear in exports; the preview states that distinction.

A selected panel still determines MP scope as before; separating export scope from inspection selection is a later milestone. `manufacturingReady=false` and `complianceVerified=false`. Generic hardware has zero approved purchasing quantity. No approved material, tolerance, process, continuous matching, treatment allowance or release record is invented. Both profiles and projection conventions remain supported.

## Repeatable checks

The browser regression is checked in at [scripts/check-furniture-workspaces.mjs](../scripts/check-furniture-workspaces.mjs). It uses an existing Playwright installation and system Chrome without adding app dependencies. Build first, then run it after the build finishes:

```sh
npm run build -- --webpack
DRAFTELM_PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/@playwright/test DRAFTELM_UX_ARTIFACTS=/tmp/draftelm-5ux2 node scripts/check-furniture-workspaces.mjs
```

It serves production artifacts through local request interception, not a deployed service. Optional DRAFTELM_UX_BASELINE_SHEETS and DRAFTELM_UX_BASELINE_PDF compare a pre-change capture. Without those files it exercises UI/vector export but cannot claim pre-change parity. Do not run it against .next while rebuilding.

The camera check allows a small antialiased-edge pixel difference after WebGL resize/damping; it detects reset/orientation regressions, not byte-identical raster rendering. SVG/PDF checks compare exact vectors/text independently of that tolerance.

## Remaining work for 5UX.3

1. Reduce the still-large Basic form into contextual material/face/grain/edge tasks. This phase separates workspaces and task views; it does not redesign every specification field.
2. Consolidate versioned libraries and legacy edging proposals with a reviewed migration; move catalogue administration away from ordinary choices.
3. Add tested field-scoped bulk commands and visual before/after review. Current bulk copy still includes every editable field, including unknowns, using physical references.
4. Improve occurrence search, issue-to-part navigation and property-level conflicts. Retaining visited forms trades memory/DOM size for safe editing; larger assemblies may justify a controlled draft-session store.
5. Add complete project recovery and later independent export scope. Panel saves do not restore cabinet dimensions/pending forms; browser-history recovery is not implemented.
6. Test with manufacturers unfamiliar with the product. Automated checks do not establish comprehension or production readiness.

## Final verification — 23 November 2026

- **786 automated tests passed**, with zero failures. TypeScript (`npx tsc --noEmit`), lint, Webpack production build and `git diff --check` passed. No engine/manufacturing-domain/generator/profile or dependency files changed.
- **14 production Chrome check groups passed** in the checked-in script: initial/keyboard workspaces; camera continuity; layers/movement/both explosion modes; exact reference vectors; multi-panel drafts and Basic/Advanced; explicit bulk scope and dirty-target replacement; undo/restore/copy-only behaviour; applied-property local Save/Load; retained library creation/versioning; stale source/rebase; profile persistence; synthetic restore; 390 px layout/focus; no-WebGL access; and unload/stale-export handling. Related assertions share groups in the report.
- Width changes through **900/1000/1100 mm** exercised review invalidation and pending-source recovery. The broader existing domain suite retains its parameter/count fixtures and 29/87/26/BOM/purchasing safeguards.
- A pre-change production capture supplied **16 SVG sheets and 16 PDF pages**. Every SVG sheet and decoded PDF vector/text page stream matches exactly after the UI changes. Both reference and reviewed synthetic example are 16 A3 pages in this fixture; PDF pages have 420 × 297 mm media boxes, with no raster Image XObjects in the reference. This count is fixture-specific, not a new fixed pagination rule.
- Actual Chrome desktop/mobile screenshots were inspected. The exported Face B / 90° synthetic panel was rendered with macOS CoreGraphics at 108 dpi (1785 × 1262 pixels) and reviewed for the retained grain/edge mapping, notes, reference dimensions, title block and preliminary/example status. This is screen review at A3 paper dimensions, not a physical printer trial or standards audit.
- Prior Phase 5UX.1 documentation was preserved and annotated with implementation updates. No commits or pushes were performed.

Review artifacts: [Design](/private/tmp/draftelm-5ux2/design-workspace.png), [Manufacturing default](/private/tmp/draftelm-5ux2/manufacturing-default.png), [Manufacturing synthetic example](/private/tmp/draftelm-5ux2/manufacturing-workspace.png), [Drawings view](/private/tmp/draftelm-5ux2/drawings-workspace.png), [mobile Design](/private/tmp/draftelm-5ux2/design-mobile.png), [mobile Manufacturing](/private/tmp/draftelm-5ux2/manufacturing-mobile.png), [unchanged reference PDF](/private/tmp/draftelm-5ux2/reference-package.pdf), [reviewed example PDF](/private/tmp/draftelm-5ux2/reviewed-example-package.pdf), [rendered panel](/private/tmp/draftelm-5ux2/reviewed-panel.png) and [Chrome report](/private/tmp/draftelm-5ux2/verification.json). Logs use `/private/tmp/draftelm-5ux2-*-final.log`. Artifacts are local review files, not approved production specifications.
