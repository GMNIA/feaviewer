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
  [0, 0, 0, 0, 0, 0, 0, 0, 0], // 0 - fixed (dx=0, dy=0, dz=0, drx=0, dry=0, drz=0)
  [5, 0, 5, null, null, null, null, null, null], // 1 - free
  [10, 0, 0, 0, 0, 0, 0, 0, 0], // 2 - fixed
  [15, 0, 0, null, null, null, null, null, null], // 3 - free
  [0, 5, 0, 0, 0, 0, 0, 0, 0], // 4 - fixed
  [5, 5, 0, 0, 0, 0, 0, 0, 0], // 5 - fixed
  [5, 10, 0, null, null, null, null, null, null], // 6 - free
  [0, 10, 0, null, null, null, null, null, null], // 7 - free
  [6.5, 12, 0, null, null, null, null, null, null], // 8 - free
  [2.5, 14.5, 0, 0, 0, 0, 0, 0, 0], // 9 - fixed
  [10, 5, 0, 0, 0, 0, 0, 0, 0], // 10 - fixed
  [15, 5, 0, 0, 0, 0, 0, 0, 0], // 11 - fixed
  [15, 10, 0, 0, 0, 0, 0, 0, 0], // 12 - fixed
  [10, 10, 0, 0, 0, 0, 0, 0, 0], // 13 - fixed
  [12, 12, 0, null, null, null, null, null, null], // 14 - free
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
const beamElements: State<Element[]> = van.state([]);
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
    { field: "D", text: "dx", editable: { type: "float" } },
    { field: "E", text: "dy", editable: { type: "float" } },
    { field: "F", text: "dz", editable: { type: "float" } },
    { field: "G", text: "drx", editable: { type: "float" } },
    { field: "H", text: "dry", editable: { type: "float" } },
    { field: "I", text: "drz", editable: { type: "float" } },
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
  const beamElementsArray: Element[] = [];
  const structuralToNodeMap = new Map<number, number>();

  // --- Step 1: Find all structural points used in connectivity ---
  const usedPointIds = new Set<number>();
  for (const [startId, endId] of connectivity) {
    usedPointIds.add(startId);
    usedPointIds.add(endId);
  }

  // --- Step 2: Create continuous FEM nodes starting from index 1 ---
  // Create mapping: structural point ID -> continuous FEM node index (1-based)
  const pointIdToNodeIndex = new Map<number, number>();
  let femNodeIndex = 1; // Start FEM nodes at index 1
  
  // First, assign continuous indices to structural points
  for (const pointId of usedPointIds) {
    const point = points[pointId - 1]; // convert 1-based ID to 0-based array index
    if (point) {
      beamNodes.push([point[0] as number, point[1] as number, point[2] as number]);
      pointIdToNodeIndex.set(pointId, femNodeIndex);
      structuralToNodeMap.set(pointId - 1, femNodeIndex - 1); // map to 0-based FEM array index
      femNodeIndex++;
    }
  }

  // --- Step 3: Create beam segments with intermediate nodes ---
  for (const [startId, endId] of connectivity) {
    const start = points[startId - 1];
    const end = points[endId - 1];
    if (!start || !end) continue;

    const startNodeIndex = pointIdToNodeIndex.get(startId)!; // get FEM node index (1-based)
    const endNodeIndex = pointIdToNodeIndex.get(endId)!;     // get FEM node index (1-based)
    
    // Create intermediate nodes for this beam segment
    const segmentStartIndex = femNodeIndex;
    const intermediateNodes = [...Array(division - 1).keys()].map((i) => {
      const t = (i + 1) / division;
      return [
        (1 - t) * (start[0] as number) + t * (end[0] as number),
        (1 - t) * (start[1] as number) + t * (end[1] as number),
        (1 - t) * (start[2] as number) + t * (end[2] as number),
      ] as Node;
    });
    
    beamNodes.push(...intermediateNodes);
    
    // Create elements for this beam segment (convert to 0-based for FEM)
    if (intermediateNodes.length === 0) {
      // Direct connection if no intermediate nodes
      beamElementsArray.push([startNodeIndex - 1, endNodeIndex - 1]);
    } else {
      // Connect: start -> intermediate nodes -> end
      beamElementsArray.push([startNodeIndex - 1, segmentStartIndex - 1]);
      for (let i = 0; i < intermediateNodes.length - 1; i++) {
        beamElementsArray.push([segmentStartIndex - 1 + i, segmentStartIndex - 1 + i + 1]);
      }
      beamElementsArray.push([segmentStartIndex - 1 + intermediateNodes.length - 1, endNodeIndex - 1]);
    }
    
    // Update femNodeIndex for next segment
    femNodeIndex += intermediateNodes.length;
  }
  
  let surfaceNodes: Node[] = [];
  let surfaceElements: Element[] = [];
  for (const polygon of surfacePolygon.val) {
    const cleanIds = polygon.filter((id) => typeof id === "number" && !isNaN(id));
    const indices = cleanIds.map((i) => i - 1);
    const usedPoints: Node[] = indices.map((i) => [points[i][0] as number, points[i][1] as number, points[i][2] as number]).filter(point => point[0] !== undefined);
    if (usedPoints.length >= 3) {
      const surfaceMesh = getMesh({
        points: usedPoints,
        polygon: [...Array(usedPoints.length).keys()],
      });
      const offset = beamNodes.length + surfaceNodes.length;
      
      // Map surface structural points to FEM node indices (only if not already mapped)
      for (let i = 0; i < usedPoints.length; i++) {
        const originalPointIndex = indices[i];
        if (!structuralToNodeMap.has(originalPointIndex)) {
          structuralToNodeMap.set(originalPointIndex, offset + i);
        }
      }
      
      surfaceNodes.push(...surfaceMesh.nodes);
      surfaceElements.push(
        ...surfaceMesh.elements.map((el) => el.map((i) => i + offset) as Element)
      );
    }
  }

  // --- Combine ---
  meshedNodes.val = [...beamNodes, ...surfaceNodes];
  beamElements.val = beamElementsArray;
  elements.val = [...beamElementsArray, ...surfaceElements];
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
  
  // Apply supports only to structural points that have support constraints (zeros in dx-drz)
  const supports = new Map<number, boolean[]>();
  const points = allPoints.val;
  
  for (const [structuralPointIndex, femNodeIndex] of structuralToNode) {
    const point = points[structuralPointIndex];
    
    // Check if this structural point has support constraints (dx, dy, dz, drx, dry, drz)
    if (point) {
      const supportDofs = [
        point[3] === 0, // dx: 0 = fixed (true), non-zero or undefined = free (false)
        point[4] === 0, // dy: 0 = fixed (true), non-zero or undefined = free (false)
        point[5] === 0, // dz: 0 = fixed (true), non-zero or undefined = free (false)
        point[6] === 0, // drx: 0 = fixed (true), non-zero or undefined = free (false)
        point[7] === 0, // dry: 0 = fixed (true), non-zero or undefined = free (false)
        point[8] === 0, // drz: 0 = fixed (true), non-zero or undefined = free (false)
      ];
      
      // Only add support if at least one constraint is fixed (true)
      if (supportDofs.some(constraint => constraint)) {
        supports.set(femNodeIndex, supportDofs);
      }
    }
  }

  // No loads for now
  const loads = new Map<number, number[]>();
  
  // Add a sample load on a free node (point 1 which is structural point index 0, mapped to FEM node)
  const sampleLoadNodeIndex = structuralToNode.get(1); // Point 1 (index 0) 
  if (sampleLoadNodeIndex !== undefined) {
    loads.set(sampleLoadNodeIndex, [0, 0, -100, 0, 0, 0]); // 100N downward load
  }

  // Material properties for all elements (following 3d-structure example)
  const elasticities = new Map(elems.map((_, i) => [i, 200000])); // 200 GPa steel
  const areas = new Map(elems.map((_, i) => [i, 0.01])); // 100 cm²
  
  // Additional properties for beam elements (following 1d-mesh example)
  const shearModuli = new Map(elems.map((_, i) => [i, 80000])); // 80 GPa
  const torsionalConstants = new Map(elems.map((_, i) => [i, 0.0001]));
  const momentsOfInertiaY = new Map(elems.map((_, i) => [i, 0.0001]));
  const momentsOfInertiaZ = new Map(elems.map((_, i) => [i, 0.0001]));

  const nodeInputs: NodeInputs = { supports, loads };
  const elementInputs: ElementInputs = { 
    elasticities, 
    areas, 
    shearModuli, 
    torsionalConstants, 
    momentsOfInertiaY, 
    momentsOfInertiaZ 
  };

  // Perform actual FEM calculation
  const deformOutputs = deform(meshedNodes.val, elements.val, nodeInputs, elementInputs);
  const analyzeOutputs = analyze(meshedNodes.val, elements.val, elementInputs, deformOutputs);

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
  // Don't draw any lines - let the viewer handle all mesh rendering
  const lineSegments: number[] = [];

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
