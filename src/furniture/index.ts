export type * from "./types";
export { createDemoChestSpecification } from "./defaults";
export { generateFurniture } from "./engine";
export { generateFurnitureBOM } from "./bom";
export { validateFurnitureSpecification, validateComponentGeometry, GEOMETRY_TOLERANCE_MM } from "./validation";
export { calculateDrawerLayout, calculateBackBracketMounts } from "./layout";
export type { DrawerLayout } from "./layout";
export { validateFurnitureAssembly, validateRequiredContacts } from "./assemblyValidation";
export { getFurnitureRevision } from "./revision";
