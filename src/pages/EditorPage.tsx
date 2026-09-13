import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Eye, PanelTopClose, PanelTopOpen, Plus, Share2 } from "lucide-react";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { TierBoard } from "../components/TierBoard";
import { TitleBlock } from "../components/TitleBlock";
import { ExportBoardInner } from "../components/ExportBoard";
import { ItemDialog } from "../components/ItemDialog";
import { ShareDialog } from "../components/ShareDialog";
import { addImageFilesToPool } from "../lib/images";
import { exportBoardRef } from "../lib/exportNode";
import { cn } from "../lib/utils";

export function EditorPage() {
  const exportRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const openItemDialog = useUi(s => s.openItemDialog);
  const setShareOpen = useUi(s => s.setShareOpen);
  const title = useBoard(s => s.title);
  const subtitle = useBoard(s => s.subtitle);
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const presetId = useBoard(s => s.presetId);
  const tiers = useBoard(s => s.tiers);
  const pool = useBoard(s => s.pool);
  const display = useBoard(s => s.display);
  // 一键全屏：隐藏顶部导航栏（直播 / 录屏时只展示排行榜本身）
  const [hideNav, setHideNav] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("hide-topbar", hideNav);
    return () => document.body.classList.remove("hide-topbar");
  }, [hideNav]);

  useEffect(() => {
    exportBoardRef.current = exportRef.current;
    return () => {
      exportBoardRef.current = null;
    };
  }, []);

  // 粘贴 / 拖入图片 → 项目库；如果拖到某个档位上，就直接进那个档位
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter(i => i.kind === "file" && i.type.startsWith("image/"))
        .map(i => i.getAsFile())
        .filter(Boolean) as File[];
      if (files.length) {
        e.preventDefault();
        addImageFilesToPool(files);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const tierId = under?.closest?.("[data-tier-id]")?.getAttribute("data-tier-id") ?? undefined;
      addImageFilesToPool(e.dataTransfer.files, tierId);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-28 pt-7 md:px-5 md:pb-16">
      <TitleBlock />
      <TierBoard />
      <button
        onClick={() => useBoard.getState().addTier()}
        className="mt-3.5 w-full cursor-pointer rounded-2xl border-[1.5px] border-dashed border-line py-3 text-[13.5px] text-muted transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
      >
        ＋ 添加档位
      </button>

      {/* 底部说明区：副标题（可选，显示在预览页）+ 统计 */}
      <div className="mt-6 space-y-1.5 text-center">
        <input
          value={subtitle ?? ""}
          onChange={e => useBoard.getState().setSubtitle(e.target.value)}
          placeholder="添加一句说明（可选，会显示在预览页）"
          maxLength={60}
          className="w-full rounded-lg border border-dashed border-transparent bg-transparent px-3 py-1 text-center text-[13px] text-muted placeholder:text-muted/60 hover:border-line focus:border-accent focus:outline-none"
        />
        <p className="text-[12px] text-muted">
          {tiers.length} 档 · {tiers.reduce((a, t) => a + t.items.length, 0)} 个项目 · 项目库 {pool.length} 项 ·
          数据自动保存在本浏览器 · 项目可拖进任意档位
        </p>
      </div>

      {/* 移动端底部操作栏 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-panel/95 backdrop-blur md:hidden">
        {[
          {
            label: "添加项目",
            icon: Plus,
            onClick: () => openItemDialog(),
          },
          {
            label: "预览",
            icon: Eye,
            onClick: () => navigate("/preview"),
          },
          {
            label: "分享",
            icon: Share2,
            onClick: () => setShareOpen(true),
          },
        ].map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2.5 text-[11px] text-ink active:text-accent"
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>

      {/* 一键全屏：隐藏顶部导航栏（直播 / 录屏时只展示排行榜） */}
      <button
        onClick={() => setHideNav(v => !v)}
        title={hideNav ? "显示导航栏" : "隐藏导航栏（全屏排版）"}
        className={cn(
          "fixed right-4 bottom-24 z-[80] grid size-11 cursor-pointer place-items-center rounded-full border shadow-lg backdrop-blur transition-colors md:bottom-6",
          hideNav
            ? "border-accent/60 bg-accent text-white hover:brightness-105"
            : "border-line bg-panel/95 text-ink hover:border-accent/60",
        )}
      >
        {hideNav ? <PanelTopOpen className="size-5" /> : <PanelTopClose className="size-5" />}
      </button>

      {/* 屏幕外的导出画布：外层零高裁剪使其不可见，节点本身无需移动（导出/分享直接截图，页面无抖动） */}
      <div aria-hidden style={{ height: 0, overflow: "hidden" }}>
        <div ref={exportRef} style={{ width: 1200 }}>
          <ExportBoardInner board={{ title, subtitle, style, mode, presetId, tiers, pool }} display={display} />
        </div>
      </div>

      <ItemDialog />
      <ShareDialog />
    </div>
  );
}
