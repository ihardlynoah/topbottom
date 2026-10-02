import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/ as well as at a domain root.
  base: "./",
  // Classic, self-contained worker: no module imports for the browser to fail on (Safari: "Importing a module script failed").
  worker: { format: "iife" },
  test: {
    environment: "jsdom",
  },
});
