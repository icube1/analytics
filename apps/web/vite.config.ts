import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.dirname(fileURLToPath(import.meta.url)), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000";
  const analyzeBundle = process.env.ANALYZE_BUNDLE === "1";

  return {
    root: path.dirname(fileURLToPath(import.meta.url)),
    publicDir: path.resolve(rootDir, "public"),
    envDir: path.dirname(fileURLToPath(import.meta.url)),
    define: {
      __VITE_API_BASE__: JSON.stringify(env.VITE_API_BASE ?? ""),
      __VITE_WEB_SESSION_SYNC__: JSON.stringify(env.VITE_WEB_SESSION_SYNC ?? ""),
    },
    resolve: {
      alias: {
        "@": rootDir,
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      analyzeBundle
        ? visualizer({
            filename: "dist/bundle-stats.html",
            gzipSize: true,
            brotliSize: true,
            open: false,
          })
        : undefined,
    ].filter(Boolean),
    worker: {
      format: "es",
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules") && id.includes("recharts")) {
              return "recharts";
            }
            return undefined;
          },
        },
      },
    },
  };
});
