import * as THREE from "three";
import van, { State } from "vanjs-core";
import { Text } from "./Text";
import { Node } from "awatif-fem";
import { Settings } from "../settings/getSettings";

/**
 * Creates a THREE.Group displaying structural point indexes as 3D text labels.
 *
 * @param settings - The UI settings controlling visibility and scale.
 * @param drawingPoints - The input structural points (user-defined) to label.
 * @param derivedDisplayScale - The state representing current display scale.
 * @returns A THREE.Group with text labels for structural points.
 */
export function structuralPointsIndexes(
  settings: Settings,
  drawingPoints: State<Node[]>,
  derivedDisplayScale: State<number>
): THREE.Group {
  const group = new THREE.Group();
  const size = 0.05 * settings.gridSize.rawVal * 0.6;

  // On settings.structuralPointsIndexes or drawingPoints update
  van.derive(() => {
    if (!settings.structuralPointsIndexes.val) return;

    group.children.forEach((c) => (c as Text).dispose());
    group.clear();

    drawingPoints.val.forEach((pt, index) => {
      const text = new Text(`${index + 1}`);
      text.position.set(...pt);
      text.updateScale(size * derivedDisplayScale.rawVal);
      group.add(text);
    });
  });

  // On displayScale change
  van.derive(() => {
    derivedDisplayScale.val; // triggers update

    if (!settings.structuralPointsIndexes.rawVal) return;

    group.children.forEach((c) =>
      (c as Text).updateScale(size * derivedDisplayScale.rawVal)
    );
  });

  // Toggle visibility
  van.derive(() => {
    group.visible = settings.structuralPointsIndexes.val;
  });

  return group;
}
