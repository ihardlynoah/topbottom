import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/ as well as at a domain root.
  base: "./",
  test: {
    environment: "jsdom",
  },
});
