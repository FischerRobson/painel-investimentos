/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O app React fica em /novo enquanto convive com o app atual (index.html em /). No corte, base volta a "/".
export default defineConfig({
  base: "/novo/",
  plugins: [react()],
  build: { outDir: "dist" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
