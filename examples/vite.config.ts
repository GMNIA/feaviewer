import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 4600,
    open: "building/index.html",
    watch: {
      usePolling: true,
      interval: 100
    },
    // Allow requests from any origin for development
    cors: true,
    // Add allowed hosts for proxy access
    allowedHosts: ["feaviewer", "develop.feacivil.cloud", "feacivil.cloud", "localhost"],
    // Add allowed origins for proxy access
    hmr: {
      clientPort: 4600
    }
  },
  base: "./",
  root: "./src",
  resolve: {
    alias: {
      "awatif-ui": path.resolve(__dirname, "../awatif-ui/src"),
    },
  },
  build: {
    outDir: "../../website/src/examples",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "3d-structure": "src/3d-structure/index.html",
        "advanced-truss": "src/advanced-truss/index.html",
        beams: "src/beams/index.html",
        curves: "src/curves/index.html",
        "1d-mesh": "src/1d-mesh/index.html",
        truss: "src/truss/index.html",
        tables: "src/tables/index.html",
        "2d-mesh": "src/2d-mesh/index.html",
        drawing: "src/drawing/index.html",
        report: "src/report/index.html",
        plate: "src/plate/index.html",
        building: "src/building/index.html",
        "slab-designer": "src/slab-designer/index.html",
        "color-map": "src/color-map/index.html",
        "plate-ortho": "src/plate-ortho/index.html",
        myexample: "src/myexample/index.html",
      },
    },
  },
  plugins: [topLevelAwait()], // used by awatif-fem & awatif-mesh to load wasm at top level
});
