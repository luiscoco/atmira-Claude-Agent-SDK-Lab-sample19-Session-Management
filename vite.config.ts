import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app runs on :5173 and forwards /api calls to the Node server on :3001,
// because the Agent SDK must run in Node (it spawns a Claude Code process).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
});
