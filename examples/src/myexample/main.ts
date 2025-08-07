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
  [10, 10, 0, null, null, null, null, null, null], // 13 - fixed
]);
const elementConnectivity = van.state([
  [1, 2, 1, 1],
  [2, 3, 1, 1],
  [3, 4, 2, 1],
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
const surfacePolygon = van.state([[5, 6, 7, 9, 10, 8, 1], [11, 12, 13, 14, 2]]);
tables.set("surface", {
  text: "Surface",
  fields: [
    { field: "A", text: "Point-1", editable: { type: "int" } },
    { field: "B", text: "Point-2", editable: { type: "int" } },
    { field: "C", text: "Point-3", editable: { type: "int" } },
    { field: "D", text: "Point-4", editable: { type: "int" } },
    { field: "E", text: "Point-5", editable: { type: "int" } },
    { field: "F", text: "Point-6", editable: { type: "int" } },
    { field: "G", text: "Surf-Id", editable: { type: "int" } },
  ],
  data: surfacePolygon,
});

const materialsData = van.state([
  [1, "Steel", 200000, 80000, 0.3], // Mat-Id: 1, Name: Steel, E: 200 GPa, G: 80 GPa, ν: 0.3
  [2, "Concrete", 30000, 12500, 0.2], // Mat-Id: 2, Name: Concrete, E: 30 GPa, G: 12.5 GPa, ν: 0.2
]);
tables.set("materials", {
  text: "Materials",
  fields: [
    { field: "A", text: "Mat-Id", editable: { type: "int" } },
    { field: "B", text: "Name", editable: { type: "string" } },
    { field: "C", text: "Elasticity [MPa]", editable: { type: "float" } },
    { field: "D", text: "Shear Modulus [MPa]", editable: { type: "float" } },
    { field: "E", text: "Poisson Ratio", editable: { type: "float" } },
  ],
  data: materialsData,
});

const sectionsData = van.state([
  [1, "IPE200", 0.0028, 0.0001, 0.00002, 0.000002], // Sec-Id: 1, Name: IPE200, Area: 28 cm², Iz: 1943 cm⁴, Iy: 142 cm⁴, J: 4.3 cm⁴
  [2, "HEB240", 0.0106, 0.0011, 0.000089, 0.000032], // Sec-Id: 2, Name: HEB240, Area: 106 cm², Iz: 11259 cm⁴, Iy: 3923 cm⁴, J: 32.5 cm⁴
]);
tables.set("sections", {
  text: "Sections",
  fields: [
    { field: "A", text: "Sec-Id", editable: { type: "int" } },
    { field: "B", text: "Name", editable: { type: "string" } },
    { field: "C", text: "Area [m²]", editable: { type: "float" } },
    { field: "D", text: "Iz [m⁴]", editable: { type: "float" } },
    { field: "E", text: "Iy [m⁴]", editable: { type: "float" } },
    { field: "F", text: "J [m⁴]", editable: { type: "float" } },
  ],
  data: sectionsData,
});

const surfacePropsData = van.state([
  [1, "Slab", 0.2, 2], // Surf-Id: 1, Name: Slab, Thickness: 0.2m, Mat-Id: 2
  [2, "Wall", 0.25, 2], // Surf-Id: 2, Name: Wall, Thickness: 0.25m, Mat-Id: 2
]);
tables.set("surfaceProps", {
  text: "Surface Props",
  fields: [
    { field: "A", text: "Surf-Id", editable: { type: "int" } },
    { field: "B", text: "Name", editable: { type: "string" } },
    { field: "C", text: "Thickness [m]", editable: { type: "float" } },
    { field: "D", text: "Mat-Id", editable: { type: "int" } },
  ],
  data: surfacePropsData,
});
const loadsData = van.state([
  [2, 0, 0, -30, 0, 1, 0], // Point-Id: 2, Fx: 0, Fy: 0, Fz: -10N, Mx: 0, My: 0, Mz: 0
  [4, 0, 0, 1, 0, 0, 0], // Point-Id: 2, Fx: 0, Fy: 0, Fz: -10N, Mx: 0, My: 0, Mz: 0
  [7, 0, 0, -30, 0, 0, 0], // Point-Id: 7, Fx: 0, Fy: 0, Fz: -30N, Mx: 0, My: 0, Mz: 0
  [9, 1000, 50, 0, 0, 0], // Point-Id: 7, Fx: 0, Fy: 0, Fz: -30N, Mx: 0, My: 0, Mz: 0
  [14, 0, 0, -60, 0, 0, 0], // Point-Id: 8, Fx: 0, Fy: 0, Fz: -20N, Mx: 0, My: 0, Mz: 0
]);

tables.set("loads", {
  text: "Loads",
  fields: [
    { field: "A", text: "Point-Id", editable: { type: "int" } },
    { field: "B", text: "Fx [N]", editable: { type: "float" } },
    { field: "C", text: "Fy [N]", editable: { type: "float" } },
    { field: "D", text: "Fz [N]", editable: { type: "float" } },
    { field: "E", text: "Mx [N⋅m]", editable: { type: "float" } },
    { field: "F", text: "My [N⋅m]", editable: { type: "float" } },
    { field: "G", text: "Mz [N⋅m]", editable: { type: "float" } },
  ],
  data: loadsData,
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
    const cleanIds = polygon.slice(0, -1).filter((id) => typeof id === "number" && !isNaN(id)); // Exclude last element (surface ID)
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
  
  // Apply loads from the loads table
  const loadDefinitions = loadsData.val;
  for (const loadDef of loadDefinitions) {
    const pointId = loadDef[0] as number;
    const fx = (loadDef[1] as number) || 0;
    const fy = (loadDef[2] as number) || 0;
    const fz = (loadDef[3] as number) || 0;
    const mx = (loadDef[4] as number) || 0;
    const my = (loadDef[5] as number) || 0;
    const mz = (loadDef[6] as number) || 0;
    
    // Get the FEM node index for this structural point
    const femNodeIndex = structuralToNode.get(pointId - 1); // Convert 1-based point ID to 0-based index
    if (femNodeIndex !== undefined) {
      loads.set(femNodeIndex, [fx, fy, fz, mx, my, mz]);
    }
  }

  // Create lookup maps from table data
  const materialsMap = new Map();
  materialsData.val.forEach(([matId, name, elasticity, shearModulus, poissonRatio]) => {
    materialsMap.set(matId, { name, elasticity, shearModulus, poissonRatio });
  });
  
  const sectionsMap = new Map();
  sectionsData.val.forEach(([secId, name, area, momentZ, momentY, torsional]) => {
    sectionsMap.set(secId, { name, area, momentZ, momentY, torsional });
  });
  
  const surfacePropsMap = new Map();
  surfacePropsData.val.forEach(([surfId, name, thickness, matId]) => {
    surfacePropsMap.set(surfId, { name, thickness, matId });
  });
  
  // Initialize element property maps
  const elasticities = new Map();
  const areas = new Map();
  const shearModuli = new Map();
  const torsionalConstants = new Map();
  const momentsOfInertiaY = new Map();
  const momentsOfInertiaZ = new Map();
  const thicknesses = new Map();
  const poissonsRatios = new Map();
  
  // Apply beam properties from tables
  const numBeamElements = beamElements.val.length;
  const connectivity = elementConnectivity.val;
  
  for (let i = 0; i < numBeamElements; i++) {
    // Get section and material IDs from connectivity table
    const beamConnectivityIndex = Math.floor(i / division); // Map beam element to connectivity row
    if (beamConnectivityIndex < connectivity.length) {
      const [, , sectionId, materialId] = connectivity[beamConnectivityIndex];
      
      // Get material properties
      const material = materialsMap.get(materialId);
      if (material) {
        elasticities.set(i, material.elasticity);
        shearModuli.set(i, material.shearModulus);
      }
      
      // Get section properties
      const section = sectionsMap.get(sectionId);
      if (section) {
        areas.set(i, section.area);
        momentsOfInertiaZ.set(i, section.momentZ);
        momentsOfInertiaY.set(i, section.momentY);
        torsionalConstants.set(i, section.torsional);
      }
    }
  }
  
  // Apply surface/shell properties from tables
  const surfacePolygons = surfacePolygon.val;
  let surfaceElementIndex = numBeamElements;
  
  for (let polyIndex = 0; polyIndex < surfacePolygons.length; polyIndex++) {
    const polygon = surfacePolygons[polyIndex];
    const surfaceId = polygon[polygon.length - 1]; // Last element is surface ID
    
    // Get surface properties
    const surfaceProp = surfacePropsMap.get(surfaceId);
    if (surfaceProp) {
      const material = materialsMap.get(surfaceProp.matId);
      
      // Count surface elements for this polygon
      const cleanIds = polygon.slice(0, -1).filter((id) => typeof id === "number" && !isNaN(id));
      const indices = cleanIds.map((i) => i - 1);
      const usedPoints = indices.map((i) => [allPoints.val[i][0] as number, allPoints.val[i][1] as number, allPoints.val[i][2] as number]).filter(point => point[0] !== undefined);
      
      if (usedPoints.length >= 3) {
        const surfaceMesh = getMesh({
          points: usedPoints,
          polygon: [...Array(usedPoints.length).keys()],
        });
        
        // Apply properties to all elements in this surface
        for (let j = 0; j < surfaceMesh.elements.length; j++) {
          const elemIndex = surfaceElementIndex + j;
          
          if (material) {
            elasticities.set(elemIndex, material.elasticity);
            shearModuli.set(elemIndex, material.shearModulus);
            poissonsRatios.set(elemIndex, material.poissonRatio);
          }
          
          thicknesses.set(elemIndex, surfaceProp.thickness);
        }
        
        surfaceElementIndex += surfaceMesh.elements.length;
      }
    }
  }

  const nodeInputs: NodeInputs = { supports, loads };
  const elementInputs: ElementInputs = { 
    elasticities, 
    areas, 
    shearModuli, 
    torsionalConstants, 
    momentsOfInertiaY, 
    momentsOfInertiaZ,
    thicknesses,
    poissonsRatios
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
    sourceCode: "https://github.com/GMNIA",
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
