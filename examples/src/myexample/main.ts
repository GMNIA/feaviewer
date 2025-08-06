import van, { State } from "vanjs-core";
import * as THREE from "three";
import { getViewer, getTables, getToolbar, getDialog, Drawing } from "awatif-ui";
import "./styles.css";
import { getMesh } from "awatif-mesh";
import {
  Node,
  Element,
  NodeInputs,
  ElementInputs,
  DeformOutputs,
  AnalyzeOutputs,
  deform,
  analyze,
} from "awatif-fem";

// --- Init ---
const allPoints = van.state([
  [0, 0, 0],
  [5, 0, 5],
  [10, 0, 0],
  [15, 0, 0],
  [0, 5, 0],
  [5, 5, 0],
  [5, 10, 0],
  [0, 10, 0],
  [6.5, 12, 0],
  [2.5, 14.5, 0],
  [10, 5, 0],
  [15, 5, 0],
  [15, 10, 0],
  [10, 10, 0],
  [12, 12, 0],
]);
const elementConnectivity = van.state([
  [1, 2],
  [2, 3],
  [3, 4],
  [13, 15],
  [14, 15],
]);
const division = 5;
const elements: State<Element[]> = van.state([]);
const meshedNodes: State<Node[]> = van.state([]);
const drawingPoints: Drawing["points"] = allPoints;

// FEM States
const nodeInputsState: State<NodeInputs> = van.state({});
const elementInputsState: State<ElementInputs> = van.state({});
const deformOutputsState: State<DeformOutputs> = van.state({});
const analyzeOutputsState: State<AnalyzeOutputs> = van.state({});

// Geometry
const lines = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial()
);
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
    { field: "A", text: "X [m]", min: "25", editable: { type: "float" } },
    { field: "B", text: "Y [m]", editable: { type: "float" } },
    { field: "C", text: "Z [m]", editable: { type: "float" } },
  ],
  data: allPoints,
});
tables.set("members", {
  text: "Members",
  fields: [
    { field: "A", text: "start-Id", editable: { type: "int" } },
    { field: "B", text: "end-Id", editable: { type: "int" } },
    { field: "C", text: "Section-Id", editable: { type: "int" } },
    { field: "D", text: "Material-Id", editable: { type: "int" } },
  ],
  data: elementConnectivity,
});
const surfacePolygon = van.state([[5, 6, 7, 9, 10, 8], [11, 12, 13, 14]]);
tables.set("surface", {
  text: "Surface",
  fields: [
    { field: "A", text: "Point-1", editable: { type: "int" } },
    { field: "B", text: "Point-2", editable: { type: "int" } },
    { field: "C", text: "Point-3", editable: { type: "int" } },
    { field: "D", text: "Point-4", editable: { type: "int" } },
    { field: "E", text: "Point-5", editable: { type: "int" } },
    { field: "F", text: "Point-6", editable: { type: "int" } },
    { field: "G", text: "Thickness [m]", editable: { type: "int" } },
    { field: "H", text: "Material-Id", editable: { type: "int" } },
  ],
  data: surfacePolygon,
});

// --- Mesh generation ---
const structuralPointToNodeMap = van.state(new Map<number, number>());

van.derive(() => {
  const points = allPoints.val;
  const connectivity = elementConnectivity.val;

  const beamNodes: Node[] = [];
  const beamElements: Element[] = [];
  const structuralToNodeMap = new Map<number, number>();

  // --- Beam and Surface Meshing ---
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
    const baseId = beamNodes.length;

    // Map structural points to FEM node indices
    // First node of segment corresponds to start structural point
    structuralToNodeMap.set(startId - 1, baseId);
    // Last node of segment corresponds to end structural point
    structuralToNodeMap.set(endId - 1, baseId + division);
    
    beamNodes.push(...segmentNodes);
    for (let i = 0; i < division; i++) {
      beamElements.push([baseId + i, baseId + i + 1]);
    }
  }
  let surfaceNodes: Node[] = [];
  let surfaceElements: Element[] = [];
  for (const polygon of surfacePolygon.val) {
    const cleanIds = polygon.filter((id) => typeof id === "number" && !isNaN(id));
    const indices = cleanIds.map((i) => i - 1);
    const usedPoints: Node[] = indices.map((i) => points[i]).filter(Boolean);
    if (usedPoints.length >= 3) {
      const surfaceMesh = getMesh({
        points: usedPoints,
        polygon: [...Array(usedPoints.length).keys()],
      });

      const offset = beamNodes.length + surfaceNodes.length;
      
      // Map surface structural points to FEM node indices
      for (let i = 0; i < usedPoints.length; i++) {
        const originalPointIndex = indices[i];
        structuralToNodeMap.set(originalPointIndex, offset + i);
      }
      
      surfaceNodes.push(...surfaceMesh.nodes);
      surfaceElements.push(
        ...surfaceMesh.elements.map((el) => el.map((i) => i + offset) as Element)
      );
    }
  }

  // --- Combine ---
  meshedNodes.val = [...beamNodes, ...surfaceNodes];
  elements.val = [...beamElements, ...surfaceElements];
  structuralPointToNodeMap.val = structuralToNodeMap;
});

// --- FEM calculation ---
van.derive(() => {
  const nodes = meshedNodes.val;
  const elems = elements.val;
  if (!nodes.length || !elems.length) return;

  // Support condition: fully fixed (UX, UY, UZ, RX, RY, RZ)
  const fixed: boolean[] = [true, true, true, true, true, true];

  // Get mapping from structural points to FEM nodes
  const structuralToNode = structuralPointToNodeMap.val;
  
  // Apply supports to ALL structural points that have corresponding FEM nodes
  const supports = new Map<number, boolean[]>();
  for (const [structuralPointIndex, femNodeIndex] of structuralToNode) {
    supports.set(femNodeIndex, fixed);
  }

  // No loads for now
  const loads = new Map<number, number[]>();

  // Material properties for all elements
  const elasticities = new Map(elems.map((_, i) => [i, 100]));
  const areas = new Map(elems.map((_, i) => [i, 10]));

  const nodeInputs: NodeInputs = { supports, loads };
  const elementInputs: ElementInputs = { elasticities, areas };

  // Skip FEM calculation for now - just create empty outputs
  const deformOutputs: DeformOutputs = { displacements: new Map() };
  const analyzeOutputs: AnalyzeOutputs = { 
    forces: new Map(), 
    reactions: new Map(),
    stresses: new Map() 
  };

  nodeInputsState.val = nodeInputs;
  elementInputsState.val = elementInputs;
  deformOutputsState.val = deformOutputs;
  analyzeOutputsState.val = analyzeOutputs;
});

// --- Update visuals ---
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
      width: "570px",
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
      nodeInputs: nodeInputsState,
      elementInputs: elementInputsState,
      deformOutputs: deformOutputsState,
      analyzeOutputs: analyzeOutputsState,
    },
    drawingObj: {
      points: drawingPoints,
    },
    settingsObj: {
      nodes: true,
      supports: true,
      loads: true,
      deformedShape: true,
      structuralPoints: true,
    },
    objects3D: objects3D,
  })
);
