import type { FurnitureSpecification, MountingAnchor, Vector3 } from "./types";

export interface DrawerLayout {
  id: string;
  front: { position: Vector3; dimensions: Vector3 };
  box: { position: Vector3; dimensions: Vector3 };
  /** Shared front cell clipped to the usable carcass opening, not a second slot grid. */
  usableBottom: number;
  usableTop: number;
}

/** Call after validating finite dimensions and a positive bounded drawer count. */
export function calculateDrawerLayout(s: FurnitureSpecification): DrawerLayout[] {
  const { width, height } = s.dimensions;
  const t = s.panels.carcass.thickness, f = s.construction.fronts, b = s.construction.drawer;
  const frontWidth = width - 2 * t + f.overlay.left + f.overlay.right - f.edgeGap.left - f.edgeGap.right;
  const frontHeight = (height - 2 * t + f.overlay.top + f.overlay.bottom - f.edgeGap.top - f.edgeGap.bottom - (s.drawerCount - 1) * f.verticalGap) / s.drawerCount;
  return Array.from({ length: s.drawerCount }, (_, i) => {
    const frontY = t - f.overlay.bottom + f.edgeGap.bottom + i * (frontHeight + f.verticalGap);
    return {
      id: `chest/drawer-${i + 1}`,
      front: {
        position: { x: t - f.overlay.left + f.edgeGap.left, y: frontY, z: f.rearFaceSetback - s.panels.drawerFront.thickness },
        dimensions: { x: frontWidth, y: frontHeight, z: s.panels.drawerFront.thickness },
      },
      box: {
        // Direct screw-fixing: rear decorative face and forward box face are coincident.
        position: { x: t + s.hardware.runner.sideClearance, y: frontY + b.frontBottomOffset, z: f.rearFaceSetback },
        dimensions: { x: width - 2 * t - 2 * s.hardware.runner.sideClearance, y: b.height, z: b.depth },
      },
      usableBottom: Math.max(t, frontY),
      usableTop: Math.min(height - t, frontY + frontHeight),
    };
  });
}

/** Layout of two attachment faces per bracket. These are not a bracket solid or holes. */
export function calculateBackBracketMounts(s: FurnitureSpecification): MountingAnchor[][] {
  const t = s.panels.carcass.thickness, b = s.construction.back;
  const { width: w, height: h, depth: d } = s.dimensions;
  const e = b.edgeClearance, offset = b.mountingEdgeOffset, z = d - b.rearInset;
  const back = (point: Vector3): MountingAnchor => ({ targetId: "chest/carcass/back", axis: "z", face: "max", point });
  const perEdge = b.bracketCount / 4;
  const mounts: MountingAnchor[][] = [];
  for (let i = 0; i < perEdge; i++) {
    const fraction = (i + 1) / (perEdge + 1);
    const y = t + e + (h - 2 * t - 2 * e) * fraction;
    const x = t + e + (w - 2 * t - 2 * e) * fraction;
    mounts.push(
      [back({ x: t + e + offset, y, z }), { targetId: "chest/carcass/left", axis: "x", face: "max", point: { x: t, y, z } }],
      [back({ x: w - t - e - offset, y, z }), { targetId: "chest/carcass/right", axis: "x", face: "min", point: { x: w - t, y, z } }],
      [back({ x, y: t + e + offset, z }), { targetId: "chest/carcass/base", axis: "y", face: "max", point: { x, y: t, z } }],
      [back({ x, y: h - t - e - offset, z }), { targetId: "chest/carcass/top", axis: "y", face: "min", point: { x, y: h - t, z } }],
    );
  }
  return mounts;
}
