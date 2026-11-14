# Phase 2 — interactive furniture preview

Open `/furniture`, or follow **Furniture preview** in navigation. The original `/` mechanical-part workflow remains available through the DRAFTELM home link and is otherwise unchanged.

## Source of truth and coordinates

`FurniturePreview` creates a fresh typed schema-v2 demonstration specification and calls `generateFurniture` whenever width, height, depth or drawer count changes. It does not calculate panel sizes, drawer spacing, runner allowances, joints or manufacturing dimensions. It preserves all other selected construction settings and exposes the engine's validation results. Four drawers is the initial default. Other counts are accepted only if the engine approves the resulting assembly; there is no automatic box resizing or fallback count.

The rendering adapter is `src/components/furniture/viewerGeometry.ts`. It accepts a `FurnitureResult`, requires `geometryValid`, and renders **only generated physical panel components**. The reference assembly contains 29 independent panel meshes. Hardware remains in the engine BOM as generic, unverified allowances/envelopes; this preview does not invent physical fasteners, bracket solids, machining or branded hardware.

The engine's coordinates are global minimum corners in millimetres. Three.js boxes are centred on their origin, so the only transform is:

- scene size per axis = engine dimension / 1000;
- scene centre per axis = (engine minimum position + engine dimension / 2) / 1000.

One scene unit is one metre. The world axes are unchanged: **X right, Y up, Z rearward**. No axis is negated and no panel is rotated. No assembly translation is added to already-global panel positions. Decorative fronts retain negative Z; for example their reference Z range −18…0 mm becomes −0.018…0 metres. Panel thickness remains along its engine-defined axis, even when it is X or Y rather than Z.

Each mesh's React key, Three object name and `userData.componentId` use the stable engine component ID. `userData.assemblyId` links it to its assembly. Thin outlines use the same box extents and do not add engineering geometry or modify gaps. Carcass, drawer boxes, decorative fronts and back use distinct simple colours; selected panels are amber.

`FurnitureCanvas` uses React Three Fiber and Three.js's bundled OrbitControls. The initial camera views the front from negative Z. Camera framing derives only from the actual rendered assembly's bounding box, including projecting fronts. Moving the camera does not transform the furniture. On model size or viewport changes the view refits; **Reset view** restores framing. Rendering is on demand, with damping updates while controls move; pixel ratio is capped at 2. Three.js geometry, control listeners and outline buffers are released on replacement/unmount.

## Inspection and interaction

- Drag to orbit, right-drag to pan, scroll to zoom. Touch: one-finger orbit, two-finger pan/zoom.
- Click a panel to highlight it. Camera drags beyond the click threshold do not select panels; a blank canvas click clears selection.
- The labelled Component selector provides a keyboard-accessible alternative for inspecting every panel, including occluded parts. Inspection shows name, stable ID, exact assembled X/Y/Z dimensions, minimum-corner position, material identifier/name, assembly and stock thickness.
- Panel BOM rows highlight all linked components, including shared blanks such as the top/base pair. A selected line can contain multiple panels; its active inspector can switch between them. The corresponding BOM rows also reflect selections made in the model or selector.
- Visibility toggles hide outer layers to expose inner boxes and the back. Selecting a part through the component selector or BOM reveals its layer. It does not remove occluding geometry from other layers: hide those layers to inspect internal parts. Hiding a layer does not change the specification/BOM or the positions of any part.
- Width, height, depth and count edits immediately recalculate through the furniture engine. Existing selection is cleared on parameter edits. **Reset specification** restores the four-drawer reference model, layers and camera.

## Invalid data, status and limits

Blank numeric fields become invalid numeric values, not zero or a substituted default. Fractional/unsupported counts, inadequate carcass sizes and impossible construction clearances are reported by the existing engine. The current canvas and BOM are withheld until corrected, rather than showing stale valid geometry beside invalid values. An additional adapter guard rejects non-finite/non-positive panel bounds even if a malformed result claims to be valid. Renderable selection IDs are filtered against the current model, so removed components cannot remain selected.

The page persistently states **Preliminary design — not manufacturing-ready** and lists the engine's assumption warnings. `manufacturingReady` is neither changed nor inferred from a rendered model. Material grade, fixings, runner performance, bracket details, structural capacity, tolerances, closing stops and stability still require verification; see [the engineering documentation](furniture-engine.md).

WebGL is required for 3D. A Canvas fallback and a local error boundary leave parameters, component inspection and BOM usable if graphics initialization fails, with a retry action for renderer errors. Graphics context loss/device/driver behaviour is browser-dependent. There is no GPU-based engineering collision calculation: the engine remains responsible for nominal collision/contact validation.

This is a static closed-assembly preview. Drawer movement, swept clearances, exploded geometry, photorealistic materials, stock grain/edge banding, physical hardware models, manufacturing approval, machining, CNC, STEP export and shop drawings are outside this phase. Layer toggles are presentation only, not a different engineered assembly.

## Architecture and checks

- `src/app/furniture/page.tsx`: separate route and metadata.
- `FurniturePreview.tsx`: specification controls, validation and shared selection/layer state; dynamically imports the browser-only Canvas.
- `FurnitureCanvas.tsx`: rendering, lighting, camera and OrbitControls.
- `PanelObject.tsx`: one independently selectable mesh and outline per engine panel.
- `ComponentInspector.tsx` / `FurnitureBOM.tsx`: linked accessible inspection.
- `ViewerBoundary.tsx`: renderer failure isolation.
- `viewerGeometry.ts`: pure, reusable conversion/bounds/selection functions with no Three or browser dependency.

Dependencies added: `three`, React-19-compatible `@react-three/fiber`, and development-only `@types/three`. OrbitControls is imported from Three's own addons; no additional scene/UI framework is needed. The furniture engine and mechanical engineering logic are unchanged.

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Node tests now discover every `tests/*.test.ts` file. The existing 72 engineering tests are retained; 15 additional tests cover all 29 converted bounds, negative Z and panel orientations, global rather than relative positions, scene bounds, role grouping, single/multiple/stale selection, BOM IDs, invalid inputs and recalculation. Tests compile to a unique OS temporary directory and leave no test build output in the project.

Browser verification uses headless Chrome with software WebGL: actual mesh clicks, orbit/pan/zoom image changes, grouped BOM selection, layer reveal, updated dimensions/count, invalid-input recovery, mobile overflow and navigation to the original workflow. This supplements unit tests; it does not certify hardware or manufacturing geometry.

Known upstream diagnostic: the installed Fiber release still constructs `THREE.Clock`, which Three.js 0.187 deprecates in favour of `Timer`. Chrome logs a deprecation warning; interaction and rendering checks pass. The application does not suppress it or patch dependency internals.
