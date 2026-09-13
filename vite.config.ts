import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// viteSingleFile：构建产物内联为单个 dist/index.html，双击即可离线演示
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  base: "./",
});
