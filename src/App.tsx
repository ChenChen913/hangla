import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { TopBar } from "./components/TopBar";
import { Toaster } from "./components/Toaster";
import { EditorPage } from "./pages/EditorPage";
import { applyTheme } from "./lib/themes";
import { useBoard } from "./store/board";

// 首屏只加载编辑器；模板库 / 我的排名 / 只读预览按需拉取，砍掉首包体积。
// （页面是具名导出，这里转成 lazy 需要的 default）
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then(m => ({ default: m.TemplatesPage })));
const MinePage = lazy(() => import("./pages/MinePage").then(m => ({ default: m.MinePage })));
const PreviewPage = lazy(() => import("./pages/PreviewPage").then(m => ({ default: m.PreviewPage })));

/** 懒加载占位：撑住高度，避免分包到达时页面高度跳一下 */
function RouteFallback() {
  return <div className="min-h-[60vh]" aria-busy="true" />;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.main>
  );
}

function AppShell() {
  const location = useLocation();
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  useEffect(() => applyTheme(style as never, mode as never), [style, mode]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Page><EditorPage /></Page>} />
          {/*
            Suspense 放在 Page 内部而不是外层：外层会让整个 motion.main 挂起再重挂，
            入场动画的 animate 阶段会丢掉，页面停在 opacity:0（看起来就是白屏）。
            放在里面，外壳照常挂载，只有页面内容在等分包。
          */}
          <Route path="/templates" element={<Page><Suspense fallback={<RouteFallback />}><TemplatesPage /></Suspense></Page>} />
          <Route path="/mine" element={<Page><Suspense fallback={<RouteFallback />}><MinePage /></Suspense></Page>} />
          {/* 只读预览当前榜单：移动端底部操作栏的「预览」按钮走这里 */}
          <Route path="/preview" element={<Page><Suspense fallback={<RouteFallback />}><PreviewPage /></Suspense></Page>} />
          <Route path="/r/:data" element={<Page><Suspense fallback={<RouteFallback />}><PreviewPage /></Suspense></Page>} />
          {/* 未知路由回编辑器，避免落到一个没有工具栏的「裸」编辑页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
