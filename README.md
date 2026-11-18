# DRAFTELM

Intelligent Design & Manufacturing.

DRAFTELM helps users describe functional 3D-printable parts, answer key engineering questions, and prepare an engineering blueprint.

The independent [furniture engineering engine](Docs/furniture-engine.md) adds Phase 1 parametric drawer-chest specification, panel generation, validation and BOM output without changing the current UI or mechanical-part workflow. Its demonstration assumptions are not manufacturing approval. Run `npm test` for the furniture unit tests.

The [Phase 2 furniture preview](Docs/furniture-preview.md) is available at `/furniture`: inspect the engine-generated panels in 3D, adjust carcass dimensions and drawer count, and select linked BOM components. It remains a preliminary design, not a manufacturing release.

Phase 3A adds independent drawer opening/closing and percentage sliders, with configurable demonstration travel and Reset Drawers. These are viewer-only transforms, not verified runner movement or changes to engineering geometry.

Phase 3B adds Assembly and Individual Panels exploded views, with staged visual separation and independent explosion reset. Saved drawer openings return after reassembly; the engine geometry and BOM remain unchanged.

The [Phase 4A / 4B drawing package](Docs/drawing-foundation.md) includes preliminary A3 general-assembly views, grouped details for all 29 panels, a complete component schedule and nominal cutting list, automatic BOM reconciliation, configurable projection placement, workshop/formal templates, and vector PDF export. The original reference package has six sheets; current Phase 5B.2 defaults have nine. The BS 8888 / ISO-style template targets BS 8888:2025 but its compliance is not yet verified against licensed standards. Manufacturing readiness remains false; DXF/DWG is outside this phase.

[Phase 4C.1 drawing profiles](Docs/drawing-profiles.md) adds reusable Workshop/Engineering settings, live sheet inclusion and cutting-list placement, all supported sheet sizes, company/title-block metadata, configurable numbering and explicit local Save/Load/Reset. Hidden information stays internally reconciled. The reference 160 screws, eight brackets and eight individual runners remain unverified allowances, excluded from approved purchasing quantities.

[Phase 4C.2 assembly annotations](Docs/drawing-annotations.md) adds deterministic panel item numbers, visible-edge balloons and a linked compact GA parts list, with AP-sheet overflow and profile-v2 migration. The default A3 chest has seven items covering all 29 panels, three reliable representative balloons and four explicitly concealed/unplaced groups. The original geometry/BOM and preliminary status remain unchanged.

[Phase 5B GA planning](Docs/general-assembly-planning.md) adds revision-bound semantic dimensions, a large isometric primary with supporting orthographic views, stale-plan rejection and shared browser/vector-PDF validation. Reference values remain 900 × 850 mm, 500 mm carcass depth and 518 mm closed depth including fronts. That phase retained the six-sheet package, all 29 panel IDs, profile settings and unverified hardware exclusions.

[Phase 5B.1 clean GA](Docs/isometric-visibility.md) removes hidden isometric edges against the existing solid panels while preserving visible drawer separations, BOM links and vector PDF output. An optional labelled diagnostic wireframe remains available in Drawing Settings.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

[Phase 5B.2 assembly drawings](Docs/assembly-drawings.md) add a deterministic exploded cabinet sheet and reusable assembled/exploded drawer and carcass sheets. Default GA callouts identify carcass and drawer assemblies; scoped lists retain original panel/BOM links and quantities. Version 3 profiles include sheet switches and migrate older saved output safely. All 29 panels and engineering/BOM formulas remain unchanged; hidden/unplaced drawing items are reported explicitly.

[Phase 5C.1 component dimensioning](Docs/component-dimensioning.md) adds source-bound length/width/thickness semantics for all 29 panel occurrences. Seven grouped drawings cover 87 occurrence measurements with geometric face dimensions, linked normal-to-face thickness notes, automatic collision checks and explicit missing-placement coverage. Preview and PDF share the same vectors; engineering/BOM values and false manufacturing/compliance flags are preserved.

[Phase 5C.2 functional assembly dimensions](Docs/functional-assembly-dimensions.md) adds stable geometric face/edge references and 43 measured relationships serving 46 requests. Default A3 output uses two optional detail sheets for 26 core relationships; 20 supporting requests remain explicitly deferred. Measured values stay separate from unverified exact/minimum design intent (for example, actual rear space 84 mm versus a nominal minimum of 10 mm). Source geometry/BOM and manufacturing/purchasing safeguards remain unchanged.

[Phase 5C.2B contextual sections](Docs/contextual-assembly-sections.md) adds true cut-only hatched section A-A and enlarged rear/back/base detail B, with three repeated source-bound functional measurements. All 29 panels, 87 component measurements and 26 core functional placements remain accounted for. Sections fit on the carcass sheet when practical or use cross-referenced SC continuation pages; the clean GA remains unchanged.

[Phase 5C.2C contextual functional dimensions](Docs/contextual-functional-dimensions.md) replaces isolated-edge sheets in normal Workshop/Engineering defaults: D/E/F show closed front gaps/reveals, C-C/I/J show actual sectional side spaces, and A-A/B retain rear clearance/inset context. All 26 core requests have traceable contextual coverage; legacy FD output remains available as diagnostics and for older saved profiles.

Phase 5C.2D: [professional engineering drawing composition](Docs/professional-drawing-composition.md) improves exploded panel packing, geometry-relative balloons, related functional sheets and shared SVG/PDF paper styles without changing geometry, BOM or preliminary status.
