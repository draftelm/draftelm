"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import type { DrawerGroup, DrawerPositions } from "./drawerMotion";
import type { PanelRole, PreviewModel } from "./viewerGeometry";
import type { ExplosionMode, ExplosionPlan } from "./explosion";
import { advanceVisualFrame, explosionOffsets, initialVisualFrame, visualFrameSettled } from "./explosion";
import AnimatedDrawer from "./AnimatedDrawer";
import ExplodablePanel from "./ExplodablePanel";

export default function SceneTransforms({ model, drawers, positions, maximumMm, mode, amount, plan, visible, selectedIds, onSelect, onBusy }: {
  model: PreviewModel; drawers: DrawerGroup[]; positions: DrawerPositions; maximumMm: number;
  mode: ExplosionMode; amount: number; plan: ExplosionPlan; visible: Record<PanelRole, boolean>;
  selectedIds: string[]; onSelect: (ids: string[]) => void; onBusy: (busy: boolean) => void;
}) {
  const drawerNodes = useRef(new Map<string, Group>());
  const panelNodes = useRef(new Map<string, Group>());
  const frame = useRef(initialVisualFrame(mode));
  const reportedBusy = useRef(false);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { invalidate(); }, [positions, maximumMm, mode, amount, plan, visible, invalidate]);
  useFrame((_, delta) => {
    const next = advanceVisualFrame(frame.current, mode, amount, drawers, positions, maximumMm, delta);
    frame.current = next;
    const offsets = explosionOffsets(plan, next.mode, next.amount);
    for (const drawer of drawers) {
      const translation = next.amount > 0 ? offsets.drawerOffsets[drawer.id] : [0, 0, next.openingZ[drawer.id] ?? 0];
      drawerNodes.current.get(drawer.id)?.position.set(translation[0], translation[1], translation[2]);
    }
    for (const panel of model.panels) {
      const translation = offsets.panelOffsets[panel.component.id] ?? [0, 0, 0];
      panelNodes.current.get(panel.component.id)?.position.set(translation[0], translation[1], translation[2]);
    }
    const busy = amount > 0 || next.amount > 0;
    if (reportedBusy.current !== busy) { reportedBusy.current = busy; onBusy(busy); }
    if (!visualFrameSettled(next, mode, amount, drawers, positions, maximumMm)) invalidate();
  });
  const registerDrawer = (id: string, node: Group | null) => { if (node) drawerNodes.current.set(id, node); else drawerNodes.current.delete(id); };
  const registerPanel = (id: string, node: Group | null) => { if (node) panelNodes.current.set(id, node); else panelNodes.current.delete(id); };
  const movingIds = new Set(drawers.flatMap(d => d.panels.map(p => p.component.id)));
  return (
    <>
      {model.panels.filter(p => !movingIds.has(p.component.id)).map(panel => (
        <ExplodablePanel key={panel.component.id} panel={panel} visible={visible[panel.role]} selected={selectedIds.includes(panel.component.id)} register={registerPanel} onSelect={onSelect} />
      ))}
      {drawers.map(drawer => <AnimatedDrawer key={drawer.id} drawer={drawer} visible={visible} highlightedIds={selectedIds} registerDrawer={registerDrawer} registerPanel={registerPanel} onSelect={onSelect} />)}
    </>
  );
}
