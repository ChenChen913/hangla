#!/usr/bin/env node
/* ============================================================
 * build.js —— 零依赖构建：把 index.html 引用的 css/js 内联，
 * 产出 dist/hangla.html 单文件版（双击即用、方便展示与分享）。
 * 用法：node build.js  或  npm run build
 * ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const root = __dirname;

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
let inlined = 0;

html = html.replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>(?:<\/link>)?/g, (m, href) => {
  inlined++;
  return "<style>\n" + read(href) + "\n</style>";
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = read(src);
  if (code.includes("</script>")) throw new Error("内联失败：" + src + " 中含有 </script>");
  inlined++;
  return "<script>\n" + code + "\n</script>";
});

const out = path.join(root, "dist", "hangla.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`✔ 构建完成 dist/hangla.html（${(html.length / 1024).toFixed(1)} KB，内联 ${inlined} 个文件）`);
