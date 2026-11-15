"use client";

import type { Group } from "three";
import type { PreviewPanel } from "./viewerGeometry";
import PanelObject from "./PanelObject";

export default function ExplodablePanel({ panel, visible, selected, register, onSelect }: {
  panel: PreviewPanel; visible: boolean; selected: boolean;
  register: (id: string, node: Group | null) => void; onSelect: (ids: string[]) => void;
}) {
  return (
    <group ref={node => register(panel.component.id, node)} name={`panel-explosion:${panel.component.id}`} userData={{ componentId: panel.component.id, visualOnly: true }}>
      {visible && <PanelObject panel={panel} selected={selected} onSelect={onSelect} />}
    </group>
  );
}
