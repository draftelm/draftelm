export type EngineeringRule = {
  id: string;
  name: string;
  category: "material" | "fastener" | "geometry" | "manufacturing" | "safety";
  appliesTo: string[];
  recommendation: string;
  confidence: number;
  reason: string;
};

export const EngineeringRules: EngineeringRule[] = [
  {
    id: "MAT-001",
    name: "Default functional FDM material",
    category: "material",
    appliesTo: ["Shelf bracket", "Vacuum wall mount", "Tool holder"],
    recommendation: "PETG",
    confidence: 95,
    reason:
      "PETG is a strong default for functional 3D printed parts because it has better toughness and impact resistance than PLA while remaining easy to print.",
  },
  {
    id: "MAT-002",
    name: "Avoid PLA for heavy sustained loads",
    category: "material",
    appliesTo: ["Shelf bracket"],
    recommendation: "Avoid PLA for loads above 10 kg",
    confidence: 90,
    reason:
      "PLA can creep over time under sustained load, especially in warm environments. PETG, ABS or Nylon are usually better choices for load-bearing parts.",
  },
  {
    id: "FAST-001",
    name: "Shelf bracket fastener recommendation",
    category: "fastener",
    appliesTo: ["Shelf bracket"],
    recommendation: "M6 screws",
    confidence: 90,
    reason:
      "M6 screws are a common and practical choice for medium-duty wall-mounted shelf brackets when paired with suitable wall plugs or anchors.",
  },
  {
    id: "FAST-002",
    name: "Light wall mount fastener recommendation",
    category: "fastener",
    appliesTo: ["Vacuum wall mount", "Tool holder"],
    recommendation: "M5 screws",
    confidence: 88,
    reason:
      "M5 screws provide a good balance of strength and size for many light to medium-duty wall-mounted printed parts.",
  },
  {
    id: "GEO-001",
    name: "Functional bracket minimum wall thickness",
    category: "geometry",
    appliesTo: ["Shelf bracket", "Vacuum wall mount", "Tool holder"],
    recommendation: "Minimum 4–5 mm wall thickness",
    confidence: 85,
    reason:
      "Functional FDM brackets usually need thicker sections than visual models because layer adhesion, print orientation and load direction affect strength.",
  },
  {
    id: "GEO-002",
    name: "Use reinforcing ribs for brackets",
    category: "geometry",
    appliesTo: ["Shelf bracket", "Wall bracket", "Vacuum wall mount"],
    recommendation: "Add triangular reinforcing ribs",
    confidence: 92,
    reason:
      "Triangular ribs improve stiffness and reduce bending in bracket-style parts without greatly increasing print time or material usage.",
  },
  {
    id: "MFG-001",
    name: "Use 0.20 mm layer height for first prototype",
    category: "manufacturing",
    appliesTo: ["Shelf bracket", "Vacuum wall mount", "Phone holder", "Tool holder"],
    recommendation: "0.20 mm layer height",
    confidence: 90,
    reason:
      "A 0.20 mm layer height gives a good balance between strength, surface finish and print time for most FDM functional prototypes.",
  },
  {
    id: "SAF-001",
    name: "Heavy loads require engineering caution",
    category: "safety",
    appliesTo: ["Shelf bracket"],
    recommendation: "Use reinforcement and conservative safety factor",
    confidence: 92,
    reason:
      "For loads above 25 kg, printed brackets should be reinforced and treated cautiously because failure could cause damage or injury.",
  },
];