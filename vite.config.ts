import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        "content-styles": resolve(__dirname, "src/content/styles.css"),
        options: resolve(__dirname, "src/options/index.html")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: ({ name }) => {
          if (!name) {
            return "assets/[name][extname]";
          }

          if (name.endsWith(".css")) {
            return "[name][extname]";
          }

          return "assets/[name][extname]";
        }
      }
    }
  },
  test: {
    environment: "jsdom"
  }
});
