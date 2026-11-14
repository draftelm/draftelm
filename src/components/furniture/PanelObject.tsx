"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, EdgesGeometry } from "three";
import { PANEL_STYLES } from "./viewerGeometry";
import type { PreviewPanel } from "./viewerGeometry";

export default function PanelObject({ panel, selected, onSelect }: { panel: PreviewPanel; selected: boolean; onSelect: (ids: string[]) => void }) {
  const edges = useMemo(() => {
    const box = new BoxGeometry(...panel.size);
    const geometry = new EdgesGeometry(box);
    box.dispose();
    return geometry;
  }, [panel.size]);
  // Primitives are externally owned; release their buffers when this panel is replaced/hidden.
  useEffect(() => () => edges.dispose(), [edges]);
  const id = panel.component.id;
  return (
    <mesh
      name={id}
      userData={{ componentId: id, assemblyId: panel.component.assemblyId }}
      position={panel.center}
      onClick={event => { event.stopPropagation(); if (event.delta <= 4) onSelect([id]); }}
    >
      <boxGeometry args={panel.size} />
      <meshStandardMaterial color={selected ? "#fbbf24" : PANEL_STYLES[panel.role].color} roughness={0.75} metalness={0} emissive={selected ? "#785000" : "#000000"} emissiveIntensity={0.2} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      <lineSegments raycast={() => {}}>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial color={selected ? "#fff1ba" : "#263747"} transparent opacity={0.65} />
      </lineSegments>
    </mesh>
  );
}
