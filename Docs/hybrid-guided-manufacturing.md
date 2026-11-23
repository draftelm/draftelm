# Hybrid guided manufacturing — Phase 5UX.3

Implemented 23 November 2026. This delivers the approved **HYBRID** direction as a bounded manufacturing workflow: real reusable definitions, visual decisions, an actionable unresolved-question summary and precise Advanced editing over the same source. It does not add an AI service, company approval system or furniture family.

## Basic workflow

1. Choose **Drawer fronts**, **Carcass** or **Drawer boxes**. The reference counts are **4 / 5 / 20 physical panels**. The named panel selector chooses a reference occurrence within the group; it is the same selection used by Design, schedules and drawings. Selecting a group does not apply any property.
2. Choose an available **material preset**, or continue without one. Real project/company catalogue records show version and provisional/supplied-verification status. Unknown definitions cannot be selected; incompatible stock/thickness is disabled for the reference panel and checked again for every target. The reference application starts with an empty library and unspecified requirements.
3. Use the diagram to select **Face A/B**, rotate the view or click a physical edge. Open a short contextual question for appearance/good-face criteria, grain, the selected edge or the displayed face's finish. Basic uses visual width/height directions and displayed edge names. It does not expose a table of local coordinates.
4. Each explicit edit selects its corresponding **proposal field**. Skipping a question changes no value and selects no field. Explicit **Not specified** can intentionally clear only a checked field; it is different from **No treatment** or **No applied finish**. Generic banding remains incomplete, without an invented product code, thickness or process.
5. Choose **All panels in this group**, **Only this panel**, or an exact checked subset. Review the before/after values and preserved fields for every occurrence. Confirm the exact scope and fields, then **Apply reviewed proposal**. Until Apply, drawings and schedules show the prior applied values.
6. Use **Save applied properties locally** to retain supported applied data for later. It does not save cabinet dimensions/configuration, group proposal drafts or the full project. Libraries and drawing preferences retain their separate local saves.

Basic is a new decision flow, not the old form divided into tabs. Preset administration, detailed manufacturer/process fields and the legacy edging-preset manager remain in Advanced. Guided material descriptions and finish references can be authored provisionally without a library. No catalogue or specification is fabricated on first load.

## Questions and readiness meaning

The question queue describes the current reference proposal and groups **existing validator diagnostics** over the actual group members. It distinguishes panels with missing information from those with provisional values. These counts are not interchangeable and are not a release score. Other occurrences may differ from the reference; the review shows each one.

The current material schema can describe stock identity, grade, thickness, appearance and stock orientation restrictions. It does **not** establish that a surface pattern, good face, edging or finish is unnecessary. The workflow therefore retains those questions as relevant or unresolved; it does not infer non-directional grain, no treatment or no finish from a material name, stock axis or camera visibility. A supplied choice remains revisitable. A future explicit applicability contract could justify skipping a question, with separate validation; no such rule is invented here.

Loads, stability, fixings/hardware and other manufacturing requirements remain visible in the existing status/assumption controls. Filling these five decision areas does not resolve those engineering limitations. `manufacturingReady=false`, `complianceVerified=false` and unverified hardware purchasing exclusions remain mandatory.

## Physical identity and group boundaries

[groups.ts](../src/manufacturing/groups.ts) is a registered adapter over the existing drawer-chest assembly/occurrence identity contract. It checks source validity and uses actual assembly membership and known panel roles. It does not group by dimensions, labels, camera visibility or finished-part equivalence. All occurrences form one disjoint partition. Unregistered roles/families appear as **Other panels** for explicit review rather than receiving invented drawer-front semantics.

The four front occurrences are the first complete group example. Carcass and box panels remain selectable and individually configurable. Their stock and signed local frames can differ. A cross-panel face/edge/grain proposal is blocked when the target frame differs from the reference frame. Narrow the scope or use an individual Advanced override. A material definition must match each actual target's engineering stock and nominal thickness. A conflict prevents the entire proposal from applying; there is no silent partial success or automatic remapping across mirrors.

The existing [panel view mapper](../src/manufacturing/panelView.ts) and [physical diagram](../src/components/furniture/PanelFaceDiagram.tsx) remain authoritative. A screen's top/bottom/left/right names are derived from the displayed face/quarter-turn, while saved grain uses local axes and edge assignments use stable physical IDs. Face reversal or rotation does not move treatment data to another edge. Review keys E1–E4 are linked to those same physical surfaces. Adjacent fronts sharing direction do not acquire continuous matching; matching remains an independent per-occurrence specification.

## Field-specific proposal contract

[proposals.ts](../src/manufacturing/proposals.ts) adds commands without changing the stored manufacturing schema or furniture model:

- `PanelFieldProposal`: reference occurrence, explicit target occurrence IDs, a field set and the existing panel draft.
- Fields: **material/stock restriction**, **grain**, **A/B appearance requirements**, **A/B finish**, and each of the **four physical edge treatments** independently.
- `reviewPanelFields`: validates the existing source/document and catalogue, resolves the selected operations per occurrence and reports changed/unchanged values, preserved editable fields and blocking incompatibilities.
- `applyReviewedPanelFields`: requires confirmation and reconstructs the exact review against current source, document, draft, fields, scope, catalogue and synthetic provenance. Tampered or stale reviews cannot apply.
- `mergePanelDraftFields`: rebases committed fields into the representative draft while preserving unrelated pending Advanced values.

The implementation composes each target from its own applied draft, overlays **only named fields**, invokes the existing single-occurrence editor/validators and merges only the allowed resulting branches. It never runs the legacy all-fields bulk operation invisibly. Binding/orientation, IDs, quantities, geometry/BOM, matching and other requirements are retained. Material includes any explicitly supplied stock restriction; omitted restrictions preserve the target's current value, as in the existing catalogue application rule.

A material/finish/treatment selection replaces that checked specification target, including its supplied metadata. Missing fields in the selected definition remain unknown and are disclosed. It is not a patch that silently fills missing catalogue data from another panel's approved specification. Custom edits detach affected pins under the existing rules; unselected pins remain intact.

The review shows complete physical scope, before/after values, existing differences, preserved fields, current revision compatibility and used pinned definitions. Optional catalogue grade, thickness, stock restriction, appearance, process and manufacturer/supplier codes are reported as supplied or **Not specified**, with full captured values/evidence inspectable. Supplied catalogue verification is explicitly labelled as such; it cannot approve an occurrence. There is no authenticated approved company-preset service.

The active catalogue fingerprint is conservatively bound in addition to the selected immutable pins. Adding/loading another version invalidates an open review even if the applied panel still pins its earlier version. Re-selecting a version is explicit. Tighter affected-definition invalidation can be considered later; current behaviour favours re-review.

## Shared Basic/Advanced state and safe replacement

[GuidedPanelSetup](../src/components/furniture/GuidedPanelSetup.tsx) uses the **same pending draft, physical edge and face view** owned by the retained [PanelPropertyForm](../src/components/furniture/PanelPropertyForm.tsx). Advanced retains the complete prior editor, read-only source/evidence details, exact single-occurrence controls, library authoring and existing full-field bulk workflow. Mode/workspace/selection changes do not reset either experience.

Only explicitly checked Basic fields apply. Unrelated pending Advanced edits on the representative stay pending afterwards. If the reference occurrence is outside the target scope, its draft stays unapplied. Existing target-panel drafts receive the prior replacement warning/confirmation: changing applied records can reset those target form sessions. Cancel preserves them. A future property-level merge/conflict workflow could retain non-conflicting pending target edits automatically; this phase does not pretend that exists.

Source changes keep proposal values against their earlier context and withhold stale drawings/export. The open review invalidates even if the user later restores the original source. Rebase/load/reset remain explicit, confirmed operations. Proposal field selection itself counts as pending work, including when the reference value already equals its applied value but other targets differ. Pending counts refer to retained reference-panel editing sessions, not the number of proposed targets.

The legacy Advanced all-fields bulk action still includes unknown values and requires its exact-scope review. Basic's field-specific safety must not be claimed for that different explicit operation. Local Save/Load, synthetic provenance/restore, before-unload/navigation guards and drawing preference migration retain the Phase 5UX.2 semantics.

## Extension points and limits

UI components consume a group description and exact IDs, not hardcoded dimensions or company construction values. Additional furniture families need a registered identity adapter and reviewed applicability/orientation rules. Future company accounts, approved rule sets and guidance can use these validated contracts; no fake AI/approval controls or unimplemented furniture choices are introduced.

Remaining priorities:

1. Company-controlled catalogue ownership, evidence authority, applicability and complete project recovery; current company scope is local metadata.
2. Explicit reviewed mapping for heterogeneous/rotated/mirrored groups; current safe fallback is narrower or individual scope.
3. Property-level merging of other targets' pending drafts and more selective catalogue-change invalidation.
4. Legacy edging-preset migration/consolidation and clearer library administration outside individual Advanced panels.
5. More visual review comparisons and manufacturer usability studies. Automated tests do not establish customer comprehension or production readiness.
6. Approved stock, face criteria, finishing/treatment processes, matching feasibility and finished-to-blank rules still require engineering decisions. No sizes/allowances, machining or release capability are added.

## Verification and review

Repeatable browser scripts are [guided manufacturing](../scripts/check-guided-manufacturing.mjs) and [workspace/Advanced regressions](../scripts/check-furniture-workspaces.mjs). Build first; run scripts after the build finishes using an existing Playwright installation via `DRAFTELM_PLAYWRIGHT_MODULE`. No runtime/test dependency is added to the app. `DRAFTELM_UX_ARTIFACTS` chooses the local review-artifact directory. Workspace parity comparison optionally uses `DRAFTELM_UX_BASELINE_SHEETS` and `DRAFTELM_UX_BASELINE_PDF`; without those inputs it does not claim comparison against an earlier capture.

### Final verification — 23 November 2026

- **831 tests passed**, zero failures: the 786-test baseline plus 45 guided-manufacturing cases. Coverage includes actual role membership/quantity conservation, unregistered identities, 900/1000/1100 mm sources and 1/4/6/12 drawers, each independent field mask, opposite-face preservation, unknown versus no treatment, pinned/supplied catalogue evidence, stock incompatibility, mirrored group rejection, individual physical-edge mapping through all eight face/quarter-turn views, exact scope, forged/stale reviews, preserved Advanced edits and both profiles/projections with 29/87/26 coverage.
- TypeScript (`npx tsc --noEmit`), lint, Webpack production build and `git diff --check` passed. Furniture geometry/BOM, stored manufacturing schema, existing property validators/appliers, drawing generators/profiles/renderers and runtime dependencies were not changed. New group/proposal adapters call the existing validation boundaries.
- **22 production Chrome check groups passed:** eight guided groups plus 14 workspace/Advanced groups. They cover no-preset configuration, Basic versus Advanced, real locally loaded catalogue proposals, proposal versus applied schedule data, catalogue-change review invalidation/pinning, explicit field selection, physical edge identity under B/90°, navigation/draft retention, missing/no-treatment states, mixed-frame conflicts and single scope, source staleness/review invalidation, local applied saves, keyboard/390 px layouts, no-WebGL fallback, bulk replacement, profiles/preferences, native unload warnings and stale asynchronous PDF cancellation.
- The untouched reference retains **16 A3 pages**. All **16 SVG sheets and all 16 decoded PDF page vector/text streams** matched the Phase 5UX.2 capture exactly; the reference PDF contains no raster Image XObjects. The guided synthetic material/banding example has **17 A3 pages**, including one shared LC legend for the used versions. Applied grain/edging appears in the existing MP and ten-field MS outputs; no new drawing generator or mandatory drawing family was added.
- Actual Basic group, visual specification, open before/after review and Advanced screenshots were inspected. The example MP/LC/MS pages were extracted and rendered with macOS CoreGraphics at 108 dpi from A3 media boxes (1785 × 1262 pixels). Review covered B/90° physical mapping, grain/edge separation, full source identities, library status/unknowns, all ten schedule columns and preliminary/synthetic status. This is a screen review at A3 dimensions, not a printer trial or formal standards verification.
- No commits or pushes were performed. The screenshots/PDF use explicitly synthetic test records in isolated browser sessions, not approved production defaults or edits to the reference chest on first load.

Review: [Basic groups](/private/tmp/draftelm-5ux3/basic-groups.png), [visual specification](/private/tmp/draftelm-5ux3/visual-specification.png), [review before Apply](/private/tmp/draftelm-5ux3/review-before-apply.png), [Advanced](/private/tmp/draftelm-5ux3/advanced-mode.png), [mobile Basic](/private/tmp/draftelm-5ux3/basic-mobile.png), [guided example PDF](/private/tmp/draftelm-5ux3/guided-example.pdf), [panel](/private/tmp/draftelm-5ux3/review-panel.png), [library legend](/private/tmp/draftelm-5ux3/review-library.png), [schedule](/private/tmp/draftelm-5ux3/review-schedule.png), [guided report](/private/tmp/draftelm-5ux3/verification.json) and [workspace report](/private/tmp/draftelm-5ux3-workspaces/verification.json). Final logs use `/private/tmp/draftelm-5ux3-*-final.log`; artifacts are local review files, not manufacturing releases.
