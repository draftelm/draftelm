"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import SceneTransforms from "./SceneTransforms";
import { createExplosionPlan, explosionBounds } from "./explosion";
import type { ExplosionMode } from "./explosion";
import { drawerMotionBounds } from "./drawerMotion";
import type { DrawerGroup, DrawerPositions } from "./drawerMotion";
import type { PanelRole, PreviewModel } from "./viewerGeometry";

function CameraControls({ bounds, resetKey }: { bounds: NonNullable<PreviewModel["bounds"]>; resetKey: number }) {
  const { get, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  useEffect(() => {
    // Three owns this imperative camera; read it inside the effect, not from React render data.
    const { camera, gl, size } = get();
    const orbit = new OrbitControls(camera, gl.domElement);
    controls.current = orbit;
    const radius = Math.hypot(...bounds.size) / 2;
    const verticalFov = camera instanceof PerspectiveCamera ? camera.fov * Math.PI / 360 : Math.PI / 8;
    const halfFov = Math.min(verticalFov, Math.atan(Math.tan(verticalFov) * size.width / Math.max(size.height, 1)));
    const distance = radius / Math.sin(halfFov) * 1.08;
    // Front is negative Z. Move the camera, never mirror/rotate furniture coordinates.
    const directionLength = Math.hypot(0.5, 0.3, 1);
    camera.position.set(bounds.center[0] + distance * 0.5 / directionLength, bounds.center[1] + distance * 0.3 / directionLength, bounds.center[2] - distance / directionLength);
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
  }, [bounds, get, invalidate, resetKey]);
  useFrame(() => controls.current?.update());
  return null;
}

function RendererUnavailable({ onReady }: { onReady: (ready: boolean) => void }) {
  useEffect(() => { onReady(false); }, [onReady]);
  return <p className="p-8">WebGL is unavailable. You can still inspect components and the BOM below.</p>;
}
function RendererStatus({ onReady }: { onReady: (ready: boolean) => void }) {
  const get = useThree(s => s.get);
  useEffect(() => {
    const canvas = get().gl.domElement;
    const lost = () => onReady(false), restored = () => onReady(true);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => { canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored); };
  }, [get, onReady]);
  return null;
}

interface Props {
  model: PreviewModel;
  drawers: DrawerGroup[];
  positions: DrawerPositions;
  maximumMm: number;
  visible: Record<PanelRole, boolean>;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  resetKey: number;
  explosionMode: ExplosionMode;
  explosionAmount: number;
  explosionBusy: boolean;
  onExplosionBusy: (busy: boolean) => void;
  onRendererReady: (ready: boolean) => void;
}

export default function FurnitureCanvas({ model, drawers, positions, maximumMm, visible, selectedIds, onSelect, resetKey, explosionMode, explosionAmount, explosionBusy, onExplosionBusy, onRendererReady }: Props) {
  const plan = useMemo(() => createExplosionPlan(model, drawers), [model, drawers]);
  const expanded = explosionAmount > 0 || explosionBusy;
  const bounds = useMemo(() => expanded ? explosionBounds(model, drawers, plan, maximumMm) : drawerMotionBounds(model, drawers, maximumMm), [expanded, model, drawers, plan, maximumMm]);
  if (!bounds || !model.bounds || model.error) return <p className="p-8">{model.error || "No panels to display."}</p>;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.001, far: 100 }}
      gl={{ antialias: true }}
      fallback={<RendererUnavailable onReady={onRendererReady} />}
      onCreated={() => onRendererReady(true)}
      onPointerMissed={event => { if (event.type === "click") onSelect([]); }}
    >
      <color attach="background" args={["#101b2b"]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-2, 3, -4]} intensity={2.5} />
      <directionalLight position={[2, 1, 3]} intensity={1.5} />
      <CameraControls bounds={bounds} resetKey={resetKey} />
      <RendererStatus onReady={onRendererReady} />
      <SceneTransforms model={model} drawers={drawers} positions={positions} maximumMm={maximumMm} mode={explosionMode} amount={explosionAmount} plan={plan} visible={visible} selectedIds={selectedIds} onSelect={onSelect} onBusy={onExplosionBusy} />
    </Canvas>
  );
}
