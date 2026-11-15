"use client";

import type { Group } from "three";
import type { DrawerGroup } from "./drawerMotion";
import type { PanelRole } from "./viewerGeometry";
import ExplodablePanel from "./ExplodablePanel";

/** Group transforms are coordinated centrally so explosion and opening never add up. */
export default function AnimatedDrawer({ drawer, visible, highlightedIds, registerDrawer, registerPanel, onSelect }: {
  drawer: DrawerGroup; visible: Record<PanelRole, boolean>; highlightedIds: string[];
  registerDrawer: (id: string, node: Group | null) => void;
  registerPanel: (id: string, node: Group | null) => void;
  onSelect: (ids: string[]) => void;
}) {
  return (
    <group ref={node => registerDrawer(drawer.id, node)} name={`drawer-motion:${drawer.id}`} userData={{ assemblyId: drawer.id, visualOnly: true }}>
      {drawer.panels.map(panel => (
        <ExplodablePanel key={panel.component.id} panel={panel} visible={visible[panel.role]} selected={highlightedIds.includes(panel.component.id)} register={registerPanel} onSelect={onSelect} />
      ))}
    </group>
  );
}
