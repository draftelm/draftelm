# Phase 3B — interactive furniture preview, drawer movement and explosion

Open `/furniture`, or follow **Furniture preview** in navigation. The original `/` mechanical-part workflow remains available through the DRAFTELM home link and is otherwise unchanged.

## Source of truth and coordinates

`FurniturePreview` creates a fresh typed schema-v2 demonstration specification and calls `generateFurniture` whenever width, height, depth or drawer count changes. It does not calculate panel sizes, drawer spacing, runner allowances, joints or manufacturing dimensions. It preserves all other selected construction settings and exposes the engine's validation results. Four drawers is the initial default. Other counts are accepted only if the engine approves the resulting assembly; there is no automatic box resizing or fallback count.

The rendering adapter is `src/components/furniture/viewerGeometry.ts`. It accepts a `FurnitureResult`, requires `geometryValid`, and renders **only generated physical panel components**. The reference assembly contains 29 independent panel meshes. Hardware remains in the engine BOM as generic, unverified allowances/envelopes; this preview does not invent physical fasteners, bracket solids, machining or branded hardware.

The engine's coordinates are global minimum corners in millimetres. Three.js boxes are centred on their origin, so the only transform is:

- scene size per axis = engine dimension / 1000;
- scene centre per axis = (engine minimum position + engine dimension / 2) / 1000.

One scene unit is one metre. The world axes are unchanged: **X right, Y up, Z rearward**. No axis is negated and no panel is rotated. No assembly translation is added to already-global panel positions. Decorative fronts retain negative Z; for example their reference Z range −18…0 mm becomes −0.018…0 metres. Panel thickness remains along its engine-defined axis, even when it is X or Y rather than Z.

Each mesh's React key, Three object name and `userData.componentId` use the stable engine component ID. `userData.assemblyId` links it to its assembly. Thin outlines use the same box extents and do not add engineering geometry or modify gaps. Carcass, drawer boxes, decorative fronts and back use distinct simple colours; selected panels are amber.

`FurnitureCanvas` uses React Three Fiber and Three.js's bundled OrbitControls. The initial camera views the front from negative Z. Camera framing derives only from the actual rendered assembly's bounding box, including projecting fronts. Moving the camera does not transform the furniture. The camera includes the full demonstration travel envelope, so changing drawer target positions does not reframe it. While explosion is active or reassembling, framing covers both fully exploded modes, the extraction stage and the ordinary drawer travel envelope. It remains stable throughout slider animation and mode switches. On model size, maximum demo travel or viewport changes, or entry/exit from explosion, the view refits; **Reset view** restores framing. Rendering is on demand, with damping updates while controls move; pixel ratio is capped at 2. Three.js geometry, control listeners and outline buffers are released on replacement/unmount.

## Inspection and interaction

- Drag to orbit, right-drag to pan, scroll to zoom. Touch: one-finger orbit, two-finger pan/zoom.
- Click a panel to inspect it; if it belongs to a drawer, its whole parent drawer assembly is highlighted. Camera drags beyond the click threshold do not select panels; a blank canvas click clears selection.
- The labelled Component selector provides a keyboard-accessible alternative for inspecting every panel, including occluded parts. Inspection shows name, stable ID, exact assembled X/Y/Z dimensions, minimum-corner position, material identifier/name, assembly and stock thickness.
- Panel BOM rows retain all linked component selections, including shared blanks such as the top/base pair. Drawer-linked selections also highlight every panel of their parent drawer assembly; a line shared across drawers highlights each affected drawer. A selected line can contain multiple panels; its active inspector can switch between them. The corresponding BOM rows also reflect selections made in the model or selector.
- Visibility toggles hide outer layers to expose inner boxes and the back. Selecting a part through the component selector or BOM reveals its layer. It does not remove occluding geometry from other layers: hide those layers to inspect internal parts. Hiding a layer does not change the specification/BOM or the positions of any part.
- Width, height, depth and count edits immediately recalculate through the furniture engine. Existing selection, all drawer movement targets and explosion progress are cleared on parameter edits. Removed drawers cannot retain stale motion state or reopen when reintroduced. **Reset specification** restores the four-drawer reference model, layers, camera and default demo travel, with every drawer closed and explosion at zero.

## Drawer movement — visual transforms only

Select any drawer in **Drawer movement** to show its Open/Close button and opening slider (0–100%). Multiple drawers may be selected and open at the same time. Switching selection never closes another drawer. A partial opening toggles to closed with the Close button; the slider can choose any integer percentage. Controls display the **target** percentage; the rendered group eases towards it.

Movement groups are built from the engine's assembly relationships and listed component IDs. The supported schema-v2 drawer contains one decorative front and five box panels. All six meshes retain their exact closed-coordinate geometry beneath one group positioned at the scene origin. Only that group's Z translation is animated. Its X/Y offsets remain zero. Carcass and recessed-back panels have no moving parent. No engine dimensions, component positions, assembly definitions, approvals or BOM quantities are changed, and no hardware meshes are added.

`Demo maximum travel` is a separate viewer setting, default **300 mm**, with a **400 mm presentation cap**. These numbers are illustrative and are not derived from, or verified against, runner travel. The effective maximum is clamped to 0–400 mm; blank/non-finite input gives 0 mm, negative input gives 0 mm, and larger input gives 400 mm, with visible input feedback. Translation is (0, 0, −openingFraction × effectiveMaximum / 1000) in scene metres. Lowering the limit clamps an already-open group before its next rendered frame. At zero travel the opening controls are disabled.

Animation uses frame-time-based exponential easing with a bounded frame delta, no overshoot, and an exact final snap within 0.01 mm. Demand rendering is invalidated when targets change and while an animation is unfinished, including closing and reversals. Animation never writes to the engine's component objects. Camera bounds include the possible opening envelope and do not change for each animation frame or slider target.

**Reset Drawers** smoothly returns every current drawer to zero without changing the specification, BOM, selected panels, visibility or demo setting. Dimension/count edits use a conservative policy: all drawers close and their stored targets are cleared; changed model revisions mount new groups at closed positions. New drawers start closed, deleted IDs are removed, and invalid configurations expose no movement groups. State helpers also reconcile IDs so stale or unknown drawer IDs cannot acquire a target.

A panel selected through the canvas, inspector or BOM identifies its parent drawer and highlights all six parent panels. The inspector continues showing the selected part's **engineering closed-position coordinates**, explicitly labelled as such. Grouped BOM rows can select several drawers; each then has independent controls. Hiding panels does not remove their movement group or discard its target. Hidden-layer controls report that state; revealing the layer shows the current transformed panels. BOM/inspector selection can reveal the selected part's layer as before. Component inspection, target controls and reset remain usable when WebGL initialization fails; a renderer retry recreates its groups and eases towards their stored targets.

**Limitations:** this is not verified kinematics. There is no animated collision test, travel-stop/load/retention verification, anti-tip or stability calculation, verified runner extension, detailed hardware, or physical disassembly simulation. Multiple open drawers are a visual scenario, not a claim of safe physical use. The engineering collision/contact checks and approval revision still concern the original closed assembly. `manufacturingReady` remains false. The presentation travel cap is a rendering policy, not a mechanical safety limit.

## Exploded View — two presentation modes

Choose **Assembly** or **Individual Panels**, set the **Explosion** slider (0–100%), and use **Reset Explosion** to reassemble. Percentage labels are target values; the displayed transforms approach those targets smoothly. The mode and slider wrap onto separate rows on narrow screens.

- **Assembly:** the complete carcass (including the back) remains stationary. Each six-panel drawer group translates only along negative Z. Small, deterministic depth staggering helps distinguish rows. Its internal panel geometry and relative positions remain rigid.
- **Individual Panels:** the first 40% extracts all drawers as rigid groups. Only after that stage do panel offsets begin. Over the remaining 60%, the carcass top moves +Y, base −Y, left side −X, right side +X and back +Z. Within each drawer, its front and box-front move −Z (the decorative front farther), rear +Z, sides −X/+X and bottom −Y. Drawer rows spread vertically, maintaining bottom-to-top order, to make room for the separated parts.

All spacing is illustrative and deterministic, derived from the existing panel/assembly bounds in scene metres. It has no effect on cutting dimensions or manufacturing positions. A clearance envelope extracts the drawer rear beyond the carcass front before local rear-panel separation. Row spacing accounts for panel height and the downward bottom offset. Depth staggering is normalized across the number of drawers rather than growing without bound per row. These are presentation rules, not installation/removal paths or physical hardware travel.

`SceneTransforms` owns a single frame state for both opening and explosion. Activation first eases displayed independent openings back to zero **without modifying their saved slider values**. It then applies explosion offsets. During extraction/separation, opening offsets are zero, never added to explosion. Changing modes reassembles the current exploded pose fully before applying the next mode. Returning the slider to zero first reassembles all panels/groups, then restores saved independent openings. Drawer Open/Close and opening sliders are disabled throughout explosion/reassembly; selection, visibility and camera controls remain available.

**Reset Drawers** changes only saved drawer openings, including while exploded; it does not reset explosion. **Reset Explosion** changes only explosion percentage and preserves the selected mode and saved drawer openings. **Reset specification** clears both systems and restores Assembly mode. Dimension/count edits close drawers and clear explosion; new model revisions mount fresh visual state, removing deleted component IDs.

Meshes keep their stable IDs, closed-coordinate centres and sizes. A nested origin-based wrapper carries each local panel offset, inside the existing drawer group where applicable. No engine assembly position is added twice. Hidden parts keep their wrapper offsets, and revealing them shows the current pose. Canvas, inspector and BOM selection still identify the original panel; the inspector explicitly displays **closed engineering coordinates**, not exploded display positions.

The camera fits a union envelope of both modes, the extraction stage and ordinary drawer travel, including all panel corners. This prevents framing from chasing each animation frame. **Reset view** refits that envelope while exploding and the normal envelope after reassembly. Orbit/pan/zoom remain available to inspect depth-occluded parts; separation does not guarantee visibility of every face from a single camera angle.

No new dependencies or engineering changes are needed. Invalid specifications withhold the scene/BOM and disable explosion controls. If WebGL initialization/context fails, controls and selection/BOM remain usable; Reset Explosion can clear suspension without requiring a render frame. The existing renderer retry is retained. Recovered renderer transforms are reconstructed from current target settings, never from altered engineering coordinates.

**Limits:** explosion is not a manufacturing drawing, verified disassembly sequence, swept-volume solver or physical stability test. Unit tests sample nominal panel AABBs along representative staged paths and check fully exploded configurations for one, three and four drawers at different sizes; no universal collision-free path or lack of screen-space occlusion is claimed. Actual fixings, runners, tolerances, loads and installation access are still unmodelled/unverified. Engineering validation, approval evidence and BOM quantities continue to describe the closed manufactured assembly; `manufacturingReady` stays false.

## Invalid data, status and limits

Blank numeric fields become invalid numeric values, not zero or a substituted default. Fractional/unsupported counts, inadequate carcass sizes and impossible construction clearances are reported by the existing engine. The current canvas and BOM are withheld until corrected, rather than showing stale valid geometry beside invalid values. An additional adapter guard rejects non-finite/non-positive panel bounds even if a malformed result claims to be valid. Renderable selection IDs are filtered against the current model, so removed components cannot remain selected.

The page persistently states **Preliminary design — not manufacturing-ready** and lists the engine's assumption warnings. `manufacturingReady` is neither changed nor inferred from a rendered model. Material grade, fixings, runner performance, bracket details, structural capacity, tolerances, closing stops and stability still require verification; see [the engineering documentation](furniture-engine.md).

WebGL is required for 3D. A Canvas fallback and a local error boundary leave parameters, component inspection and BOM usable if graphics initialization fails, with a retry action for renderer errors. Graphics context loss/device/driver behaviour is browser-dependent. There is no GPU-based engineering collision calculation: the engine remains responsible for nominal collision/contact validation.

Movement is demonstration-only. Swept-clearance analysis, photorealistic materials, stock grain/edge banding, physical hardware models, manufacturing approval, machining, CNC, STEP export and shop drawings are outside this phase. Layer toggles are presentation only, not a different engineered assembly.

The later Phase 4B **2D drawings** panel uses this same closed engine result. It includes every panel blank, a full component schedule and a nominal cutting list with automatic BOM reconciliation; all generated sheets are included in vector PDF export. See [the drawing package documentation](drawing-foundation.md). Viewer movement, explosion and visibility do not affect those sheets. This remains preliminary documentation with no manufacturing release or verified BS 8888 compliance.

Phase 4C.1 adds [Drawing Settings and reusable profiles](drawing-profiles.md): choose presentation, format/projections, visible views/schedules, title-block metadata and numbering, then explicitly save/load preferences in this browser. The visible sheet set controls vector PDF output; full internal component/BOM reconciliation remains active. Unverified hardware allowances are labelled separately from approved purchasing quantities.

Phase 4C.2 adds [component balloons and the assembly parts list](drawing-annotations.md) to those settings. Annotations use the same closed engine geometry and remain independent of viewer opening/explosion. The reference list covers all 29 panels in seven items; only three groups have reliably visible balloon anchors. The UI identifies concealed/unplaced requests and any list relocation. Saved v1 profiles migrate safely with new annotation visibility off; current profile defaults enable both features.

## Architecture and checks

- `src/app/furniture/page.tsx`: separate route and metadata.
- `FurniturePreview.tsx`: specification controls, validation and shared selection/layer/movement state; dynamically imports the browser-only Canvas.
- `FurnitureCanvas.tsx`: rendering, lighting, camera and OrbitControls.
- `drawerMotion.ts`: pure assembly grouping, parent selection, clamped target state, animation easing and camera-envelope functions.
- `AnimatedDrawer.tsx`: one persistent visual group per drawer; transforms are assigned by the central animation controller.
- `explosion.ts`: pure, bound-derived display spacing, staged offsets, shared transition state machine and camera envelope.
- `SceneTransforms.tsx`: sole owner of all drawer and panel wrapper transforms during rendering.
- `ExplodablePanel.tsx`: a visual offset wrapper around an unchanged panel mesh.
- `ExplosionControls.tsx`: mode/percentage/reset controls and drawer-suspension status.
- `DrawerControls.tsx`: independent selection, Open/Close, 0–100% sliders, configurable demo travel and Reset Drawers.
- `PanelObject.tsx`: one independently selectable mesh and outline per engine panel.
- `ComponentInspector.tsx` / `FurnitureBOM.tsx`: linked accessible inspection.
- `ViewerBoundary.tsx`: renderer failure isolation.
- `viewerGeometry.ts`: pure, reusable conversion/bounds/selection functions with no Three or browser dependency.

Dependencies added: `three`, React-19-compatible `@react-three/fiber`, and development-only `@types/three`. OrbitControls is imported from Three's own addons; no additional scene/UI framework is needed. The furniture engine and mechanical engineering logic are unchanged.

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Node tests now discover every `tests/*.test.ts` file. The existing engineering and viewer tests are retained, covering all 29 converted bounds, negative Z and panel orientations, global rather than relative positions, scene bounds, role grouping, single/multiple/stale selection, BOM IDs, invalid inputs and recalculation. Additional movement tests cover six-panel assembly grouping, independent negative-Z offsets, state reconciliation/reset, finite clamping, monotonic animation and limit reductions, full-parent highlights, camera envelopes, and unchanged engine/BOM data. Explosion regressions additionally cover rigid groups, logical directions, progressive stages, reassembly-before-mode-switch, opening suspension/restoration, independent resets, dimension/count changes, component/BOM immutability, representative AABB separation and framing. Tests compile to a unique OS temporary directory and leave no test build output in the project.

Browser verification uses headless Chrome with software WebGL: actual mesh clicks, orbit/pan/zoom image changes, grouped BOM selection, layer reveal, updated dimensions/count, invalid-input recovery, mobile overflow and navigation to the original workflow. Explosion browser checks also inspect all 29 actual mesh world positions, verify camera containment of all eight panel corners, raycast-select an exploded front, preserve BOM selection/visibility, restore saved openings and exercise both resets. This supplements unit tests; it does not certify hardware or manufacturing geometry.

Known upstream diagnostic: the installed Fiber release still constructs `THREE.Clock`, which Three.js 0.187 deprecates in favour of `Timer`. Chrome logs a deprecation warning; interaction and rendering checks pass. The application does not suppress it or patch dependency internals.
