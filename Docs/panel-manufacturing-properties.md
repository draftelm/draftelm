# Panel manufacturing properties — Phase 5D.1

Implemented 18 November 2026. This is a data/validation foundation, separate from the drawing renderer and engineering sizing. It does not create approved manufacturing instructions, an editor, supplier database, machining engine or new drawings. `manufacturingReady` and `approvedManufacturingData` are always false.

## Source boundary and public API

`src/manufacturing/index.ts` exports the schema, topology helpers, default document adapter, validator and resolver. The module imports the furniture domain, never the drawing layer. The existing engine, its specification/result schema, original component IDs, BOM formulas and drawing pipeline are unchanged.

```ts
import { createPanelManufacturingDocument, resolvePanelManufacturing,
  validatePanelManufacturingDocument } from "../src/manufacturing";

// result is an existing validated FurnitureResult.
const properties = createPanelManufacturingDocument(result);
const validation = validatePanelManufacturingDocument(properties, result);
const plan = resolvePanelManufacturing(result, properties);
```

Creating a document copies the source's material identities into provisional values and leaves manufacturing requirements unassigned. It does not author grain, finish, edge treatments or good faces. The resolver accepts structurally valid, source-consistent preliminary data with unresolved warnings. Invalid/stale data cannot resolve into a plan. A resolved plan is recursively frozen; creating/resolving it does not mutate or freeze the caller's engineering result or property document.

Source acceptance checks geometry, component/assembly ownership, hierarchy cycles and BOM quantities/blank dimensions against the existing BOM generator. Whole-document binding captures the exact engineering revision and normalized geometry/assembly/BOM snapshot. Per-panel binding also captures component ID, assembly ID, position, dimensions, thickness axis, material, quantity and the explicit local orientation. Source array order is normalized. A changed source revision is conservatively stale even if the affected panel's dimensions happen to match.

## Physical face, edge and frame identities

Each original panel occurrence has exactly two broad faces and four perimeter edge surfaces:

| Identity | Meaning |
| --- | --- |
| `panel-face:<encoded occurrence ID>:a` | Broad face at local thickness coordinate T=0 |
| `panel-face:<encoded occurrence ID>:b` | Broad face at local T=thickness |
| `panel-edge:<encoded occurrence ID>:u-min` / `u-max` | Perimeter surfaces at local U=0 / U=extent |
| `panel-edge:<encoded occurrence ID>:v-min` / `v-max` | Perimeter surfaces at local V=0 / V=extent |

A perimeter edge treatment addresses a physical thickness-wide edge surface. These four identities are distinct from the twelve geometric line segments of a box. Topology records local/world corners, outward world normals, actual edge lengths and adjacency to both broad faces. IDs do not embed length/width sorting, BOM row numbers, drawing labels or camera visibility.

The default U/V order follows the fixed model-axis order excluding the explicit thickness axis, consistent with the physical-axis convention already used by component dimensioning. U is not automatically the longer edge. Local orientation consists of three distinct signed model axes; the normal must map onto the actual thickness axis. The local origin is the appropriate physical corner for those signs. `panelLocalToWorld` and `panelWorldToLocal` map points without modifying global panel minimum corners or adding assembly positions twice. Existing world coordinates remain X right, Y up, Z rearward.

Face A/B are neutral identifiers. Neither is automatically decorative, visible in service or a manufacturer-defined good face. The coordinate basis does not invent a datum system or imply a manufacturing handedness convention. U/V/normal ordering can differ in handedness across the existing thickness-axis cases; outward normals are explicitly recorded rather than inferred from polygon winding.

`createPanelManufacturingDocument(result, orientations)` accepts optional explicit orientations keyed by existing occurrence IDs. This supports signed axis permutations for the engine's axis-aligned rectangular panels, including quarter/half turns and explicit face reversals. A physical face/edge keeps its local semantic ID while its world side changes with an explicit orientation mapping. Editing a record's orientation alone invalidates its captured orientation binding, even when its treatments are only provisional. Rotating/repositioning source geometry also invalidates old source bindings and verified records. No automatic transfer/reapproval is performed. Arbitrary oblique rotations need a future validated engineering transform/solid contract; this phase does not pretend an axis-aligned bounding box is an oblique panel.

## Property states and verification records

Every manufacturing property uses `ManufacturingProperty<T>`:

| Status | Data and meaning |
| --- | --- |
| `unassigned` | A reason; no fabricated value. Valid preliminary data, with an unresolved diagnostic. |
| `provisional` | A supplied candidate value and reason; not equivalent to a verified specification. |
| `verified` | A supplied value plus reviewer/evidence references bound to the exact subject. |

Unknown is different from explicit no treatment/no finish (`{ kind: "none" }`), non-directional grain, independent matching, or an explicitly reviewed empty requirement list. Nested properties use the same states. For eligible nullable attributes, `null` means explicitly not applicable, rather than unknown; an unassigned attribute must use its unassigned state. Edge-band/lipping nominal thickness, when specified, must be positive, and cannot use null. An `other` treatment can explicitly declare thickness not applicable. No value changes panel dimensions.

A verification record contains engineering revision, exact subject fingerprint, evidence references and `verifiedBy`. The subject includes the value, property path, occurrence/assembly identity, captured panel binding and local orientation. Copying a verification record to a different panel, face, edge or field fails. Changing the value/frame/revision without re-recording appropriate evidence fails. Nested verified records are independently checked; a verified parent with an unassigned child remains unresolved for equivalence. `verifiedProperty` records caller-supplied claims, and does not authenticate a reviewer or prove evidence adequacy.

Validation distinguishes `valid` (schema/source/reference consistency) and `allPropertiesVerified` (no errors or unresolved/provisional warnings in this limited schema). Neither means approved, manufacturing-complete or releaseable. Plans/validation expose `approvedManufacturingData: false`, groups expose `manufacturingInterchangeability: "not-assessed"`, and release flags supplied as unsupported input are rejected. Trusted identities, evidence repositories, revocation and authorised approval remain future work. Specification IDs bind the literal supplied reference and properties; this phase does not resolve or monitor external material/finish/process dictionaries. Controlled external definition versions/digests must be introduced before those references can support a release baseline.

## Material, surfaces, good faces and processes

`MaterialSpecification` carries the existing `stockMaterialId`, an explicit grade property, optional description and zero or more manufacturer-specific codes. Codes are namespaced by manufacturer; no supplier service or proprietary material database is required. A verified material definition must agree with the engineering stock identity; replacing that identity requires a separate engineering change. `demo-*` identities cannot be upgraded to verified stock by this metadata layer.

Each broad face independently carries:

- `requirements`: explicit decorative, reverse and required-visible-in-service booleans, plus manufacturer-defined good-face requirement IDs/descriptions. Required visibility is design intent, separate from computed geometric visibility in an assembled view.
- `finish`: explicit no finish, or a finish specification ID with manufacturer codes and independently stated appearance/process metadata. Opposite faces can have different specifications.

One face cannot be both decorative and reverse, and both broad faces cannot simultaneously be designated reverse. Both faces can explicitly be decorative. No camera-facing direction establishes any of these roles. Unassigned roles remain unknown.

Each perimeter edge independently carries no treatment, edge-band, lipping or another explicitly identified treatment. A specified treatment can carry material identity/grade, nominal thickness, finished appearance and process metadata, each with explicit status. Visible geometry never triggers automatic edging. Processes are specification references and textual metadata only; they are not executable operations, validated machining geometry, toolpaths or dimensional deductions.

`otherRequirements` is an explicit, source-bound list of identified additional manufacturing requirements. Its unassigned default is not an approved empty machining/operation list. The current strings reserve an extension seam; they do not validate features, tolerances, process access or inspection requirements.

## Grain, pattern and matching

`grain` supports longitudinal (local U), transverse (local V), non-directional and unassigned values. Directional specifications also retain positive/negative/either sense. `grainWorldDirection` returns the corresponding signed world axis; for `either` it returns the positive local-axis representative while the reversal permission remains in the original data. Non-directional returns null; callers must preserve an unassigned property rather than substitute a vector.

`stockOrientation` separately records non-directional stock or directional stock along local U/V with an explicit reversal permission. This lets stock cutting constraints be compared using actual along/across dimensions rather than assembly axes. Surface pattern and stock orientation are kept as separate specifications; neither silently overwrites the other.

`grainMatching` is unassigned, explicitly independent, or an explicit grouping requirement containing group ID, broad face ID, sequence, common-pattern U/V origin and quarter-turn registration. These fields reserve enough information for later pattern placement and matching review. A matching group with a single member is reported incomplete; duplicate sequence positions, foreign faces and a directional matching requirement combined with non-directional pattern are invalid. No adjacency heuristic creates a group. Grain is currently a panel-level requirement; separate veneer/pattern directions on opposite faces need a future explicit per-face extension. Registration, actual visual continuity, stock yield, material batch/bookmatching and manufacturing feasibility are not solved here.

## Occurrences, manufacturing variants and stock blanks

These identities are deliberately distinct:

1. **Physical occurrence:** original engine component ID, preserved exactly.
2. **Manufacturing variant:** a derived partition based on ordered local U/V/T geometry and the relevant manufacturing definition: material/grade/codes, stock constraints, grain/matching, both face requirements/finishes, four treatments and other requirements.
3. **Stock cutting-blank group:** a separate derived raw-stock compatibility partition. It respects verified material/grade, thickness, along/across or non-directional dimensions, reversal constraints, grain/pattern axes and explicit matching registration. It does not establish finished-part equivalence.

The original engine BOM and its seven reference nominal blank groups remain intact. New groups retain original occurrence IDs, source BOM IDs and authoritative quantities. They partition all input panel occurrences exactly once; assemblies/hardware are not introduced as panel variants.

For a verified-property comparison, every relevant property, including nested properties, must be verified and valid. Unknown/provisional requirements isolate occurrences rather than approve equivalence by matching missing values. Stock grouping requires material, stock orientation, grain and matching to be verified; unresolved finishing requirements can still split manufacturing variants while sharing an explicitly compatible raw blank. This does not approve unknown finishing data. Conservative U/V ordering can keep otherwise potentially rotatable parts as separate variants; a reviewed rotational/symmetry policy is deferred.

Fingerprints use versioned **canonical JSON**, following the engine's existing revision convention, with code-point key/order comparisons and finite plain JSON values. Sparse arrays and nonfinite values are rejected. They are complete comparison keys, not short hashes, authentication signatures or durable company part numbers. Equal verified definitions have the same fingerprint independent of source array order, world placement, occurrence IDs and reviewer/evidence attribution. Per-face/per-edge definitions are keyed by local semantic tokens; matching retains explicit group/sequence/registration. Unresolved fingerprints include the occurrence ID so unspecified records cannot merge. Source BOM labels, names and paper/display choices cannot establish equivalence. Review/evidence changes still alter the captured document snapshot and invalidate cached plans, even when the comparison fingerprint remains unchanged.

`validatePanelManufacturingPlan` reconstructs the source-bound plan and rejects cached/tampered topology, partitions, quantities or diagnostic state. A compact digest or assigned company registry may later wrap these canonical keys, with explicit collision and migration policy.

## Synthetic examples

The executable examples are [test fixtures](../tests/panelManufacturingFixtures.ts) and [domain/compatibility tests](../tests/panelManufacturing.test.ts). They create a separate `synthetic-stock` model and use clearly synthetic material grades, finishes, processes and evidence. None is assigned to the production/demo chest.

```ts
// Test/example code only — imports intentionally point to synthetic fixtures.
import { fullySpecifiedFixture, syntheticFinish, verify }
  from "../tests/panelManufacturingFixtures";
import { resolvePanelManufacturing } from "../src/manufacturing";

const { source, document } = fullySpecifiedFixture();
const panel = document.panels[1];
const reverseFace = panel.faces.find(f => f.faceId.endsWith(":b"))!;
const path = `faces/${reverseFace.faceId}/finish`;
reverseFace.finish = verify(panel, path,
  syntheticFinish(panel, reverseFace.faceId, "synthetic-reverse-finish"));
const plan = resolvePanelManufacturing(source, document);
// Two manufacturing variants, one compatible raw-stock blank group.
// manufacturingInterchangeability is still not assessed; readiness remains false.
```

Tests also demonstrate a quarter-turn where the same A face and U-min edge retain their physical identity while resolving to different world sides, edge-band/lipping metadata without dimension deductions, and pattern registration with an explicitly named synthetic group. Verified properties are recorded at nested paths before their containing value is recorded; this preserves subject consistency.

## Reference chest and backward compatibility

The reference adapter produces **29 records, 58 broad faces and 116 perimeter-edge references**. Both `demo-sheet` and `demo-plywood` remain explicitly provisional, with grade unassigned and no assigned manufacturer codes. All face roles/good-face requirements, grain, matching, stock orientation, face finishes, edge treatments and other requirements remain unassigned.

The derived reference plan therefore contains **29 unresolved manufacturing variants and 29 unresolved stock-blank entries**, without claiming any approved equivalence. These are not 29 new physical parts or replacements for the existing seven engineering BOM blanks. The reference still has 29 physical panels, 87 component measurements, all 26 core functional displays, the same 12-page A3 drawing package and unchanged hardware allowances. Manufacturing readiness, compliance status and zero approved purchasing quantities remain unchanged.

No manufacturing sidecar is silently attached to a `FurnitureResult`, profile, drawing or PDF. Future consumers must explicitly bind and validate this additional input alongside the engineering revision; the current drawing facade and its browser/PDF stale-export safeguards retain their existing behaviour.

## Phase 5D.2 decisions and extension points

Engineering/manufacturer review must establish:

- Real stock/material definitions, grade applicability and company/manufacturer code authority; evidence adequate to verify each selection.
- Intentional physical local frames, good/decorative/reverse/visible face requirements and opposite-side finish specifications for each role.
- Local grain conventions, stock orientation/reversal policy, continuous matching groups, registration/batch requirements and a continuity/feasibility assessment.
- Edge treatment definitions, material/process details and which nominal dimensions represent substrate blanks versus finished parts. Any treatment allowance/deduction needs a separately validated engineering model; none is implemented here.
- A reviewed comparison scope for rotational equivalence, finishes applied before versus after cutting, manufacturing features/handedness and required supporting requirements.
- Durable part-number/variant registry, compact digest policy and explicit source/property migration/review workflows. Geometry edits must not silently reapprove previous treatment mappings.
- Trusted reviewer/evidence authority and release rules. The present verification records establish consistency only.
- Explicit integration into drawing annotations, component/subassembly reuse, schedules and export baselines, with all future consumers including the manufacturing property revision in stale-input checks.

These decisions extend the authority boundaries in the [manufacturing specification](drawing-manufacturing-specification.md), [architecture roadmap](drawing-architecture-roadmap.md), [component dimensioning](component-dimensioning.md) and [professional composition](professional-drawing-composition.md). This phase makes no new standards-compliance claim.

## Verification

Final verification on 18 November 2026:

- **660 tests passed**: all 594 existing regressions plus 66 manufacturing-property tests. New coverage includes the 29-occurrence reference, 900/1000/1100/1200 mm sources, physical topology/orientation, opposite finishes, good faces, grain/stock constraints, edge treatments, explicit matching, nested unknowns, stale/corrupted bindings, property-scoped equivalence, quantity/BOM conservation and unchanged drawings.
- `npx tsc --noEmit`, `npm run lint` and `npm run build -- --webpack` passed. No runtime dependency or engine/drawing/component source changes were required.
- Production Chrome regression passed against the built app using local static-artifact routing. Checks cover the requested width range, depth/drawer regeneration, Workshop/Engineering profiles, first-/third-angle projection, saved profile round-trips, stale export cancellation, A4 continuations, A1 details and mobile overflow.
- The exported reference A3 PDF retains 12 pages, all 26 core contextual displays and no raster image XObjects. Browser/PDF parity matched 951 contextual vector segments. New tests additionally establish exact drawing-document equality before/after manufacturing resolution for both profiles/conventions, 87 component measurements, unchanged source/BOM, and purchasing exclusions.
- `git diff --check` passed. No commits or pushes were performed.

Temporary validation logs and browser/PDF artifacts are named `/private/tmp/draftelm-5d1-*`. The browser regression script uses the existing locally installed Playwright/Chrome; it introduces no application dependency.

## Phase 5D.2 visible integration

[Visible panel manufacturing properties](visible-panel-manufacturing-properties.md) now connects this schema to an occurrence editor, explicit bulk proposals, local Save/Load, opt-in synthetic examples, geometry review/rebinding, MP/MN occurrence drawings and the ten-field MS schedule. The earlier sections describe the Phase 5D.1 data-only boundary; the current application supplies an additional validated manufacturing input while legacy drawing API calls retain their prior output. No verification or release approval is added by the UI.

## Phase 5D.3 workshop workflow

[Simplified manufacturing workflow](simplified-manufacturing-workflow.md) adds Basic/Advanced modes, a physical-edge-linked face diagram, provisional generic treatments with an explicitly unresolved optional specification reference, guarded bulk review, conservative expandable schedule groups and configurable compact/detailed output. Existing string specification references and source-bound documents remain compatible; missing treatment references never establish verified variant equivalence. No engineering geometry or release authority changes.

## Phase 5D.4 versioned libraries

[Manufacturing libraries and drawing integration](manufacturing-libraries-drawing-integration.md) adds typed project/company material, edging and finish definitions, immutable version/snapshot references and provisional occurrence assignment. Library evidence is separate from engineering verification. Matching registration is now explicitly editable; source-bound reference views and compact schedule aliases preserve physical identities, stock/finished-variant separation and false release readiness.
