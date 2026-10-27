import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Download,
  Eye,
  Moon,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { TierBoard } from "../components/TierBoard";
import { TitleBlock } from "../components/TitleBlock";
import { ExportBoardInner } from "../components/ExportBoard";
import { ItemDialog } from "../components/ItemDialog";
import { ShareDialog } from "../components/ShareDialog";
import { PresetSwitchDialog } from "../components/PresetSwitchDialog";
import { FancySelect } from "../components/FancySelect";
import { DisplaySettingsPanel } from "../components/DisplaySettings";
import { ConfirmDialog } from "../components/ui/dialog";
import {
  buildPresetOptions,
  buildStyleOptions,
  changeStyle,
  exportBoardPng,
  requestPresetChange,
} from "../components/TopBar";
import { addImageFilesToPool } from "../lib/images";
import { exportBoardRef } from "../lib/exportNode";
import { TIER_PRESETS } from "../lib/presets";
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
  const toggleMode = useBoard(s => s.toggleMode);
  // 一键全屏：隐藏顶部导航栏（直播 / 录屏时只展示排行榜本身）
  const [hideNav, setHideNav] = useState(false);
  // 移动端设置抽屉与它内部的两个确认弹窗
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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

      {/* 移动端底部操作栏：第 4 项「设置」打开底部抽屉（桌面顶栏工具栏在手机上收进这里） */}
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
          {
            label: "设置",
            icon: SlidersHorizontal,
            onClick: () => setSettingsOpen(true),
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

      {/* 移动端设置抽屉：评级模式 / 视觉风格 / 日夜 / 显示与样式 / 恢复示例 / 导出 PNG */}
      <DialogPrimitive.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="sheet-panel fixed inset-x-0 bottom-0 z-50 flex max-h-[86dvh] flex-col rounded-t-2xl border-t border-line bg-panel shadow-[0_-8px_40px_rgba(16,24,40,.28)] outline-none"
          >
            <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line" />
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <DialogPrimitive.Title className="text-[15px] font-bold text-ink">设置</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="关闭设置"
                className="grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-panel2 hover:text-ink"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>

            {/* max-height + 内部滚动：390px 宽的小屏也能完整操作所有控件，底部留出安全区 */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              <div className="space-y-3">
                <div>
                  <p className="pb-1 text-[12px] font-semibold text-muted">评级模式</p>
                  <FancySelect
                    value={TIER_PRESETS[presetId] ? presetId : "custom"}
                    options={buildPresetOptions(presetId)}
                    onChange={id => requestPresetChange(id, setPendingPreset)}
                    title="评级模式：切换整套档位方案"
                    ariaLabel="评级模式"
                    menuAlign="left"
                  />
                </div>
                <div>
                  <p className="pb-1 text-[12px] font-semibold text-muted">视觉风格</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <FancySelect
                      value={style}
                      options={buildStyleOptions(mode)}
                      onChange={changeStyle}
                      title="视觉风格（每种风格都有白天和黑夜配色）"
                      ariaLabel="视觉风格"
                      menuAlign="left"
                    />
                    <button
                      onClick={toggleMode}
                      title={mode === "day" ? "切换到黑夜配色" : "切换到白天配色"}
                      aria-label={mode === "day" ? "切换到黑夜配色" : "切换到白天配色"}
                      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-panel text-ink hover:border-accent/60 [&_svg]:size-4"
                    >
                      {mode === "day" ? <Moon /> : <Sun />}
                    </button>
                    <span className="text-[12.5px] text-muted">{mode === "day" ? "白天" : "黑夜"}</span>
                  </div>
                </div>
              </div>

              <div className="my-4 h-px bg-line" />

              {/* 与桌面顶栏弹层共用同一份面板，避免两套实现走样 */}
              <DisplaySettingsPanel />

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-line bg-panel text-[13px] text-ink hover:border-accent/60 [&_svg]:size-4"
                >
                  <RotateCcw /> 恢复示例
                </button>
                <button
                  type="button"
                  onClick={() => void exportBoardPng()}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-transparent bg-gradient-to-br from-accent2 to-accent text-[13px] font-semibold text-white shadow-[0_2px_14px_rgba(255,106,61,.3)] hover:brightness-105 [&_svg]:size-4"
                >
                  <Download /> 导出 PNG
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* 一键全屏：隐藏顶部导航栏（直播 / 录屏时只展示排行榜） */}
      <button
        onClick={() => setHideNav(v => !v)}
        title={hideNav ? "显示导航栏" : "隐藏导航栏（全屏排版）"}
        className={cn(
          "fixed right-4 bottom-24 z-30 grid size-11 cursor-pointer place-items-center rounded-full border shadow-lg backdrop-blur transition-colors md:bottom-6",
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

      {/* 抽屉里的两个确认弹窗（复用现有组件，层级在抽屉之上） */}
      <PresetSwitchDialog presetId={pendingPreset} onClose={() => setPendingPreset(null)} />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="恢复示例榜单？"
        description="当前内容将丢失（已保存的快照会保留在「我的排名」）。"
        confirmText="恢复示例"
        danger
        onConfirm={() => {
          useBoard.getState().resetBoard();
          toast("已恢复示例榜单");
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
