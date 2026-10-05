import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { metadataPlugin } from "./metadata-plugin";
export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, envDir, "VITE_");
  return {
    envDir,
    plugins: [react(), tailwindcss(), metadataPlugin(env.VITE_PUBLIC_SITE_URL)],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: process.env.WHERETO_API_TARGET || "http://127.0.0.1:3001",
        },
        "/files": {
          target: process.env.WHERETO_API_TARGET || "http://127.0.0.1:3001",
        },
      },
    },
    build: { chunkSizeWarningLimit: 900 },
  };
});
