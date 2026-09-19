import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,

    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,

        // Allow enough time for the backend's 90-second grading limit.
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },

  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    sourcemap: false,
  },
});