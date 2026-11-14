# Furniture engine — Phase 1, corrected contact geometry

`src/furniture` is a deterministic TypeScript engineering module independent of the mechanical-part AI, application state and UI. It produces a component assembly and BOM, not a manufacturing release. No branded hardware, drilling patterns, CNC, pricing or preview is implemented.

## API and revision migration

```ts
import { createDemoChestSpecification, generateFurniture, getFurnitureRevision } from "./src/furniture";

const specification = createDemoChestSpecification();
specification.dimensions.width = 1000;
const result = generateFurniture(specification);
// Inspect geometryValid and issues before consuming bom.
// getFurnitureRevision(specification) identifies the exact parameters an approval concerns.
```

The corrected specification is **schema version 2**. It replaces the independent drawer `frontSetback` with `frontBottomOffset`, removes front `boxClearance`, adds `attachmentEdgeMargin`, explicit `bottomFixing`, and back `mountingEdgeOffset`. Legacy schema or legacy depth fields are rejected rather than silently ignored. The demo factory returns the complete new contract. This change affects only the furniture module; no UI or mechanical-part state uses the previous furniture model.

Generation is pure and does not mutate the specification or evidence. Stable component IDs are scoped to a generated chest. Callers combining furniture instances must namespace those IDs. Input is a complete typed specification; a runtime untrusted-JSON parser remains outside this module.

## Coordinates and panel construction

All lengths are millimetres. Origin: front-left-bottom of the **carcass**, excluding decorative fronts. X right, Y up, Z rearward. Every assembly/component position is a **global minimum corner**, never a relative transform. A panel's `{x,y,z}` dimensions are assembled extents; `thicknessAxis` identifies its stock thickness. Negative Z for an overlay decorative front is intentional.

Carcass width W = 900, height H = 850, depth D = 500, thickness t = 18:

- Top/base: W × D × t = **900 × 500 × 18**; base Y = 0, top Y = H − t = 832.
- Sides between top/base: height H − 2t = **814**, depth 500, thickness 18.
- Internal clear width W − 2t = **864**.
- Back: square-cut, 6 mm thick, **no groove/rebate**. At 1 mm edge clearance its cut size is **862 × 812 × 6**, X = 19…881, Y = 19…831, Z = 484…490. Its rear face is 10 mm inward from D = 500.

Face contact is distinguished from positive-volume intersection with a computational tolerance of **0.000001 mm**. This is not a manufacturing tolerance. No cut rounding, stock nesting, grain orientation decision or edge-treatment allowance is implied.

## One shared drawer layout and direct front contact

`calculateDrawerLayout` calculates both decorative fronts and boxes. There is no independent internal-slot pitch.

For n drawers, decorative front dimensions are:

- width = W − 2t + overlayLeft + overlayRight − edgeGapLeft − edgeGapRight;
- height = (H − 2t + overlayTop + overlayBottom − edgeGapTop − edgeGapBottom − (n−1) × verticalGap) / n;
- X = t − overlayLeft + edgeGapLeft;
- Y(i) = t − overlayBottom + edgeGapBottom + i × (frontHeight + verticalGap), numbered bottom to top.

Overlay parameters define the envelope **before** perimeter gaps are deducted. Thus 18 mm overlay with a 2 mm perimeter gap produces **16 mm physical overlap** on each outer carcass edge.

Each box Y is its own front Y + configurable `drawer.frontBottomOffset` (demo **24 mm**). Its entire projected rectangle must be covered by that front. The usable vertical cell is the front Y span clipped to the carcass opening. Box bottom/top clearances (demo 8 mm each) are minimum distances within this clipped cell, not a second position grid. A box that cannot fit that cell is rejected; it is never silently shortened or repositioned.

For **direct screw-fixed fronts**, the decorative front's rear face and box's forward face share Z = `fronts.rearFaceSetback` (demo **0**). Decorative front Z is that coordinate minus its 18 mm thickness. The previous 20 mm attachment gap no longer exists. All four boxes and fronts move together if this depth setting changes.

`rearFaceSetback` is non-negative: 0 gives the selected overlay construction; a positive value moves the contacting faces rearward. Inset construction requires overlays/gaps that fit inside the opening, and adequate box/runner depth space. For example, zero overlay and rearFaceSetback = 18 put an 18 mm front at Z = 0…18 with the box starting at 18. Positive setback with an overlapping overlay front is rejected through panel collision validation. Unsupported stand-off/spacer front attachments are not generated.

Default direct-contact geometry places the decorative front's rear face flush with carcass front edges. Buffer thickness, finish allowance, closing stops and hardware closed-position requirements still need engineering; zero nominal contact must not be read as proven running clearance.

| Drawer | Decorative front Y | Complete box Y | Box front / decorative rear face Z |
| --- | --- | --- | ---: |
| 1 | 2…211.25 | 26…156 | 0 |
| 2 | 214.25…423.5 | 238.25…368.25 | 0 |
| 3 | 426.5…635.75 | 450.5…580.5 | 0 |
| 4 | 638.75…848 | 662.75…792.75 | 0 |

All adjacent front gaps are **3 mm**; top/bottom perimeter reveals are **2 mm**. Each box starts **24 mm above its front bottom**, including drawer 4. Boxes and fronts share **212.25 mm pitch**. A configurable 10 mm attachment-edge margin must leave a positive fixing region on the box-front face. This is a demonstration geometric margin, not a manufacturer-approved screw-edge distance; actual attachment holes/fasteners remain undefined.

## Drawer boxes, runners and under-box bottoms

Drawer outside width = internal width − 2 × sideClearance = 864 − 25.4 = **838.6 mm**. All boxes span X = **30.7…869.3**. Two 12 mm side walls run full box depth; 12 mm front/rear walls fit between them, with width **814.6 mm**. Total box height is 130 mm, comprising a 6 mm bottom under 124 mm-high walls. Box depth is independently configured at 400 mm. At the default direct-contact Z, boxes span **0…400**, leaving **84 mm** to the inner back face at 484; configured rear clearance 10 mm is a minimum, not that resulting distance.

Runner envelope width **must equal** required per-side space within computational tolerance. Default width/space is 12.7 mm; left runner spans X = 18…30.7 and right runner 869.3…882. Each envelope must make positive-area contact with both its cabinet side and drawer side. A 15 mm side space with a 12.7 mm envelope is rejected, even if labelled verified. Packing and alternative mounting arrangements have no supported definition in this phase and cannot be inserted as extra components.

Default runner length is 400 mm, height 45 mm, front offset 0 mm and bottom offset 20 mm. Offset/length must fit the box wall; the closed envelope cannot intersect the panels or other hardware envelopes. Runner length, mounting height, load capacity, closed position, installation clearances and screw allowances remain **generic demonstration values**, not verified catalogue data. Swept motion, extension/retention, actual profiles, and loaded deflection are not checked.

Bottom construction is explicitly `under-box` with `bottomFixing: "screws-through-bottom"`. Each bottom is a full-footprint sheet; all four wall lower faces must contact its upper face. It is neither captive in a groove nor supported on an unmodelled ledge. Default fixing allowance is eight screws, assumed driven upwards through the bottom into the wall edges. At least four are required by the supported configuration (one allowance per wall); this minimum is **not a strength or screw-spacing calculation**. Exact screw locations, lengths, pilot holes, heads, edge distances, adhesive, plywood grade and bending/withdrawal capacity must be approved. The clear internal footprint is **814.6 × 376 mm**. In particular, reducing bottom thickness may still give geometrically valid output, but invalidates all existing approval evidence and makes no structural claim.

## Individually positioned recessed-back brackets

Eight quantity-one bracket components replace the old aggregate at a single point. `calculateBackBracketMounts` distributes equal numbers along all four edges: default two per edge at 1/3 and 2/3 of the back's edge span. Supported count: 4–64, divisible by four. A configurable **25 mm** offset places each back-face anchor inward from its corresponding back edge.

Each component contains two explicit mounting-face anchors: one on the back rear face (Z = 490) and one on the appropriate carcass inner face. These are **not hole centres**. In the reference chest:

| Edge | Back-face anchors (X, Y, Z), mm | Corresponding carcass anchor |
| --- | --- | --- |
| Left | (44, 289.666667, 490), (44, 560.333333, 490) | Same Y/Z, X = 18 |
| Right | (856, 289.666667, 490), (856, 560.333333, 490) | Same Y/Z, X = 882 |
| Base | (306.333333, 44, 490), (593.666667, 44, 490) | Same X/Z, Y = 18 |
| Top | (306.333333, 806, 490), (593.666667, 806, 490) | Same X/Z, Y = 832 |

Back-to-carcass edge gap is 1 mm, so a bracket must bridge **26 mm between these illustrative anchor coordinates** in the corresponding X/Y direction. The selected bracket must be designed/verified to serve that arrangement; these anchors do not certify a commercially available fitting. Anchor locations are checked against both panels and the configured distribution. Missing/displaced brackets and unsupported counts are errors. Each gets a separate two-screw allowance (at least one per attachment face).

Actual bracket leg sizes, thickness, bend orientation, screw-hole offsets, installation access within the 10 mm rear recess, material strength, screw engagement into the 6 mm back, and racking resistance remain unverified. Brackets therefore have no claimed solid envelope. Their future physical shape must be checked for interference before release; anchor validation alone is not a bracket fit approval.

## Reference component and BOM structure

One root assembly, one carcass assembly and four drawer assemblies contain **29 panels**, eight runner envelopes, eight individually anchored back brackets, and fixing allowances. BOM lines group equal rectangular blanks by material/cut size and hardware by definition ID, retaining all component IDs and part names.

| Panel blank | Quantity | Cut size, mm |
| --- | ---: | --- |
| Carcass top/base | 2 | 900 × 500 × 18 |
| Carcass sides | 2 | 814 × 500 × 18 |
| Recessed back | 1 | 862 × 812 × 6 |
| Drawer sides | 8 | 400 × 124 × 12 |
| Drawer box front/rear | 8 | 814.6 × 124 × 12 |
| Drawer bottoms | 4 | 838.6 × 400 × 6 |
| Separate fronts | 4 | 896 × 209.25 × 18 |

Eight runner components mean four left/right pairs. Reference fixing allowances remain **160 generic screws and eight brackets**: 16 carcass joint screws, 16 bracket screws, and 32 screws per drawer (eight corner, eight bottom, four front and twelve runner mounting screws). The generic screw ID is an unresolved allowance, not a claim that one screw SKU suits every joint. Actual fixing selections must be split and validated before manufacturing.

## Assembly checks and approval invalidation

`validateComponentGeometry` checks every available panel or hardware envelope against every other available solid/envelope. Positive-volume intersection is reported as `panel-overlap` or `hardware-interference`; touching faces are permitted. Schematic fixing/bracket anchors have no solid to collide. Other checks include finite positive geometry, quantities, duplicate IDs and panel-thickness consistency.

`validateFurnitureAssembly` additionally checks the specification-derived positions/dimensions of all 29 panels and eight runners, exact required hardware definitions/quantities, and individually located bracket anchors. Unknown components/packing, missing required components, or substituted fittings are rejected. `validateRequiredContacts` checks **56 positive-area face relationships** in the reference chest:

- four carcass side-to-top/base contacts;
- per drawer: four wall-to-bottom contacts, four wall-corner contacts, one decorative-to-box front contact, and four runner-to-drawer/cabinet contacts.

Edge/corner touching, gaps, and penetration do not satisfy a required face contact. Front coverage, the shared vertical layout and attachment margins are checked independently of collision detection. These checks establish nominal assembly geometry, not fastener penetration, tool access, joint strength, moving clearances or manufacturing tolerances.

Verification areas remain materials, carcass joinery, back fixing, drawer construction, runners, front fixing, and load/stability. A record requires status `verified`, non-empty description and evidence, and `specificationRevision` exactly equal to `getFurnitureRevision(specification)`. That revision is a canonical snapshot of **all non-verification parameters plus the engineering-algorithm revision**. Object key order is immaterial. Any parameter change conservatively invalidates **all** approvals; an engine formula revision also invalidates previous evidence. Old records are retained unchanged for audit and reported as unverified/stale. Merely reusing a status or adding evidence does not approve a new revision.

The snapshot is not an authentication signature and does not independently validate external engineering evidence. Verification text itself is excluded from the parameter snapshot to avoid circular dependencies; human sign-off must use an authoritative evidence process. The module exposes the applicable revision in every result and never auto-stamps approval.

Invalid input returns no components/BOM. Invalid generated assembly retains components for diagnosis but withholds the BOM. `geometryValid` means these nominal geometry/contact checks passed. `assumptionsVerified` means all recorded evidence matches the specification revision; it does not prove the supplied evidence is adequate. **`manufacturingReady` stays false for every Phase 1 result**, even with revision-matched records. Material grades, stock/finish tolerances, grain/edge treatment, fixing details, bottom capacity, back/racking strength, loaded runner performance, stops, retention, anti-tip restraint and overall stability remain essential release work.

## Checks and extension points

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. Tests compile into a unique OS temporary directory using the existing TypeScript dependency, then run with Node's built-in test runner. No new dependency is needed. Regressions cover all four front/box positions and contact, extreme gaps, runner space/envelopes, missing/detached parts, bottom support contact, panel/hardware interference, bracket distribution/anchors, missing fixing allowances, and evidence invalidation after parameter changes.

The `family` discriminator remains `drawer-chest`; the default remains four full-width drawers in one column. Parametric counts 1–64 are supported as before, subject to actual cell fit. Future furniture families can reuse component, assembly, material and BOM primitives; alternative joinery, packing and branded hardware require explicit new contracts/validation. Future engine changes must bump the engineering revision to invalidate earlier approvals.
