"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import PanelObject from "./PanelObject";
import type { PanelRole, PreviewModel } from "./viewerGeometry";

function CameraControls({ bounds, resetKey }: { bounds: NonNullable<PreviewModel["bounds"]>; resetKey: number }) {
  const { get, invalidate, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    // Three owns this imperative camera; read it inside the effect, not from React render data.
    const { camera, gl } = get();
    const orbit = new OrbitControls(camera, gl.domElement);
    controls.current = orbit;
    const radius = Math.hypot(...bounds.size) / 2;
    const verticalFov = camera instanceof PerspectiveCamera ? camera.fov * Math.PI / 360 : Math.PI / 8;
    const halfFov = Math.min(verticalFov, Math.atan(Math.tan(verticalFov) * size.width / Math.max(size.height, 1)));
    const distance = radius / Math.sin(halfFov) * 1.2;
    // Front is negative Z. Move the camera, never mirror/rotate furniture coordinates.
    camera.position.set(bounds.center[0] + distance * 0.5, bounds.center[1] + distance * 0.3, bounds.center[2] - distance);
    camera.near = Math.max(radius / 1000, 0.0001);
    camera.far = Math.max(distance * 30, 100);
    camera.updateProjectionMatrix();
    orbit.target.set(...bounds.center);
    orbit.minDistance = radius * 0.15;
    orbit.maxDistance = distance * 10;
    orbit.enableDamping = true;
    const render = () => invalidate();
    orbit.addEventListener("change", render);
    orbit.update();
    invalidate();
    return () => { orbit.removeEventListener("change", render); orbit.dispose(); controls.current = null; };
  }, [bounds, get, invalidate, resetKey, size.width, size.height]);
  useFrame(() => controls.current?.update());
  return null;
}

interface Props {
  model: PreviewModel;
  visible: Record<PanelRole, boolean>;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  resetKey: number;
}

export default function FurnitureCanvas({ model, visible, selectedIds, onSelect, resetKey }: Props) {
  if (!model.bounds || model.error) return <p className="p-8">{model.error || "No panels to display."}</p>;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.001, far: 100 }}
      gl={{ antialias: true }}
      fallback={<p className="p-8">WebGL is unavailable. You can still inspect components and the BOM below.</p>}
      onPointerMissed={event => { if (event.type === "click") onSelect([]); }}
    >
      <color attach="background" args={["#101b2b"]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-2, 3, -4]} intensity={2.5} />
      <directionalLight position={[2, 1, 3]} intensity={1.5} />
      <CameraControls bounds={model.bounds} resetKey={resetKey} />
      {model.panels.filter(panel => visible[panel.role]).map(panel => (
        <PanelObject key={panel.component.id} panel={panel} selected={selectedIds.includes(panel.component.id)} onSelect={onSelect} />
      ))}
    </Canvas>
  );
}
