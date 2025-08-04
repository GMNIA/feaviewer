import * as THREE from "three";
import van, { State } from "vanjs-core";
import { Node } from "awatif-fem";
import { Settings } from "../settings/getSettings";

/**
 * Creates and returns a THREE.Points object representing structural points (member ends),
 * rendered as larger blue points over the regular mesh nodes.
 *
 * @param settings - Viewer display settings
 * @param derivedNodes - List of 3D node coordinates
 * @param derivedDisplayScale - Reactive display scale factor
 * @returns A THREE.Points object with styled geometry for structural points
 */
export function structuralPoints(
  settings: Settings,
  derivedNodes: State<Node[]>,
  derivedDisplayScale: State<number>
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: 0x3366ff,
      sizeAttenuation: true,
      depthTest: true, // optionally false if you always want them on top
    })
  );

  // Optional: ensure they render after nodes
  points.renderOrder = 1;
  points.frustumCulled = false;

  const baseSize = 0.05 * settings.gridSize.rawVal * 0.6;

  // on settings.structuralPoints + derivedNodes update visuals
  van.derive(() => {
    if (!settings.structuralPoints.val) return;

    points.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(derivedNodes.val.flat(), 3)
    );
  });

  // on derivedDisplayScale update size
  van.derive(() => {
    derivedDisplayScale.val;

    if (!settings.structuralPoints.rawVal) return;

    points.material.size = baseSize * derivedDisplayScale.rawVal * 1.5; // slightly larger
  });

  // visibility toggle
  van.derive(() => {
    points.visible = settings.structuralPoints.val;
  });

  return points;
}
