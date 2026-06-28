import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Allows: import { Button } from "@/components/ui/button"
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    host: "0.0.0.0",  // Required for Docker
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy /api requests to the FastAPI backend during development
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      // Proxy WebSocket connections
      "/ws": {
        target: process.env.VITE_WS_URL || "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: "0.0.0.0",
    port: 4173,
  },

  build: {
    outDir: "dist",
    sourcemap: true,
    // Raise the chunk size warning limit slightly for Monaco Editor
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk splitting for better caching
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "ui-vendor": [
            "framer-motion",
            "lucide-react",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          "editor-vendor": ["@monaco-editor/react"],
          "chart-vendor": ["recharts"],
          "form-vendor": ["react-hook-form", "zod", "@hookform/resolvers"],
          "utils-vendor": ["date-fns", "clsx", "tailwind-merge", "class-variance-authority"],
        },
      },
    },
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "axios",
      "zustand",
      "socket.io-client",
      "framer-motion",
    ],
  },

  // Test config (Vitest)
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "src/**/*.d.ts",
        "src/main.tsx",
        "vite.config.ts",
      ],
    },
  },
});
