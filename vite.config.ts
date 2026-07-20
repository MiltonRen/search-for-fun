import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "studio/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/studio",
    assetsDir: "studio-assets",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@studio": `${projectRoot}studio`,
      "@search-for-fun/runtime": `${projectRoot}studio/runtime/contract.ts`,
    },
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
});
