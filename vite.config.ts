import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 双构建：
// - 默认模式（npm run build）：react + tailwindcss + viteSingleFile，所有资源内联成单个
//   dist/index.html，双击即可离线演示。
// - web 模式（npm run build:web）：不加 singlefile 插件，产出常规多文件结构到 dist-web/，
//   字体保留为独立静态资源，供 GitHub Pages 等在线部署。
// base 两种模式都保持 "./"，确保部署在仓库子路径（/hangla/）下也能正确加载。
export default defineConfig(({ mode }) => {
  const isWeb = mode === "web";
  return {
    plugins: isWeb ? [react(), tailwindcss()] : [react(), tailwindcss(), viteSingleFile()],
    base: "./",
    // web 模式输出到 dist-web/，与单文件 dist/ 互不覆盖
    build: isWeb ? { outDir: "dist-web" } : {},
  };
});
