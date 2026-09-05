import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Let bb dev-server shares (getbb.app) and the tailnet reach the dev
    // server; Vite rejects unknown Host headers with a 403 otherwise.
    allowedHosts: [".getbb.app", ".tail06618c.ts.net"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
})
