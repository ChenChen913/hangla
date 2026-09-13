import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HashRouter, Route, Routes, useLocation } from "react-router";
import { TopBar } from "./components/TopBar";
import { Toaster } from "./components/Toaster";
import { EditorPage } from "./pages/EditorPage";
import { PreviewPage } from "./pages/PreviewPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { MinePage } from "./pages/MinePage";
import { applyTheme } from "./lib/themes";
import { useBoard } from "./store/board";

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
          <Route path="/templates" element={<Page><TemplatesPage /></Page>} />
          <Route path="/mine" element={<Page><MinePage /></Page>} />
          {/* 只读预览当前榜单：移动端底部操作栏的「预览」按钮走这里 */}
          <Route path="/preview" element={<Page><PreviewPage /></Page>} />
          <Route path="/r/:data" element={<Page><PreviewPage /></Page>} />
          <Route path="*" element={<Page><EditorPage /></Page>} />
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
