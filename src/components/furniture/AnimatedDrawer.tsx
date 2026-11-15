"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import type { DrawerGroup } from "./drawerMotion";
import { advanceDrawerOffset, drawerOffset } from "./drawerMotion";
import type { PanelRole } from "./viewerGeometry";
import PanelObject from "./PanelObject";

export default function AnimatedDrawer({ drawer, opening, maximumMm, visible, highlightedIds, onSelect }: {
  drawer: DrawerGroup; opening: number; maximumMm: number;
  visible: Record<PanelRole, boolean>; highlightedIds: string[]; onSelect: (ids: string[]) => void;
}) {
  const group = useRef<Group>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { invalidate(); }, [opening, maximumMm, invalidate]);
  useFrame((_, delta) => {
    const object = group.current;
    if (!object) return;
    const next = advanceDrawerOffset(object.position.z, opening, maximumMm, delta);
    // This group is at the world origin: children keep their original global centres.
    object.position.set(0, 0, next);
    if (next !== drawerOffset(opening, maximumMm)[2]) invalidate();
  });
  return (
    <group ref={group} name={`drawer-motion:${drawer.id}`} userData={{ assemblyId: drawer.id, visualOnly: true }}>
      {drawer.panels.filter(p => visible[p.role]).map(panel => (
        <PanelObject key={panel.component.id} panel={panel} selected={highlightedIds.includes(panel.component.id)} onSelect={onSelect} />
      ))}
    </group>
  );
}
