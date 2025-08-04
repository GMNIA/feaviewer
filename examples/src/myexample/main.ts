import van, { State } from "vanjs-core";
import * as THREE from "three";
import { getViewer, getTables, getToolbar, getDialog, Drawing } from "awatif-ui";
import "./styles.css";

// Init
const allPoints = van.state([
  [0, 0, 0],
  [5, 0, 5],
  [10, 0, 0],
  [15, 0, 0],
]);
const elementConnectivity = van.state([
  [1, 2],
  [2, 3],
  [3, 4],
]);
const division = 5;
const elements: State<Element[]> = van.state([]);
const meshedNodes: State<Node[]> = van.state([]);
const drawingPoints: Drawing["points"] = allPoints;

const lines = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial()
);

// Visual representation of input points (in red)
const pointMaterial = new THREE.PointsMaterial({
  color: 0xff0000,
  size: 0.2,
  sizeAttenuation: false,
});
const pointGeometry = new THREE.BufferGeometry();
const pointDots = new THREE.Points(pointGeometry, pointMaterial);
const objects3D = van.state([lines, pointDots]);

const tables = new Map();

// Tables
tables.set("points", {
  text: "Points",
  fields: [
    { field: "A", text: "X-coordinate", min: "25", editable: { type: "float" } },
    { field: "B", text: "Y-coordinate", editable: { type: "float" } },
    { field: "C", text: "Z-coordinate", editable: { type: "float" } },
  ],
  data: allPoints,
});

tables.set("members", {
  text: "Members",
  fields: [
    { field: "A", text: "startId", editable: { type: "int" } },
    { field: "B", text: "endId", editable: { type: "int" } },
  ],
  data: elementConnectivity,
});

// Beam meshing
van.derive(() => {
  const points = allPoints.val;
  const connectivity = elementConnectivity.val;

  const newNodes: Node[] = [];
  const newElements: Element[] = [];

  for (const [startId, endId] of connectivity) {
    const start = points[startId - 1];
    const end = points[endId - 1];
    if (!start || !end) continue;

    const segmentNodes: Node[] = [...Array(division + 1).keys()].map((i) => {
      const t = i / division;
      return [
        (1 - t) * start[0] + t * end[0],
        (1 - t) * start[1] + t * end[1],
        (1 - t) * start[2] + t * end[2],
      ] as Node;
    });

    const baseId = newNodes.length;
    newNodes.push(...segmentNodes);

    for (let i = 0; i < division; i++) {
      newElements.push([baseId + i, baseId + i + 1]);
    }
  }

  meshedNodes.val = newNodes;
  elements.val = newElements;
});

// Update red input points
van.derive(() => {
  const coords = allPoints.val;
  if (!coords.length) return;

  pointGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coords.flat(), 3)
  );
  pointGeometry.computeBoundingSphere();

  objects3D.val = [...objects3D.rawVal];
});

// Update mesh lines
van.derive(() => {
  const coords = allPoints.val;
  const conns = elementConnectivity.val;
  const lineSegments: number[] = [];

  for (const [startId, endId] of conns) {
    const start = coords[startId - 1];
    const end = coords[endId - 1];
    if (start && end) lineSegments.push(...start, ...end);
  }

  lines.geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(lineSegments, 3)
  );

  objects3D.val = [...objects3D.rawVal];
});

// Dialog GUI
const clickedButton = van.state("");
const dialogBody = van.state(undefined);
van.derive(() => {
  if (clickedButton.val === "Model data")
    dialogBody.val = getTables({ tables });
});

// Viewer setup
document.body.append(
  getToolbar({
    clickedButton,
    buttons: ["Model data"],
    sourceCode: "awatif+code_aster",
    author: "https://www.linkedin.com/in/andrea-toffolon-464ab556/",
  }),
  getDialog({
    dialogBody,
    dialogStyle: {
      width: "500px",
      height: "600px",
      top: "40px",
      left: "auto",
      right: "20px",
    },
  }),
  getViewer({
    mesh: {
      nodes: meshedNodes,
      elements: elements,
    },
    drawingObj: {
      points: drawingPoints,
    },
    settingsObj: {
      nodes: true,
      loads: false,
      deformedShape: false,
      structuralPoints: true,
    },
    objects3D: objects3D,
  })
);
