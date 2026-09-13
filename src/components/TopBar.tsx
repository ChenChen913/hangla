import { toPng } from "html-to-image";
import { Download, LayoutTemplate, Library, Link2, Moon, PencilLine, RotateCcw, Sun } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { STYLE_NAMES, exportPalette } from "../lib/themes";
import type { Mode, StyleId } from "../lib/themes";
import { TIER_PRESETS } from "../lib/presets";
import { cn, timestamp } from "../lib/utils";
import { ConfirmDialog } from "./ui/dialog";
import { PresetSwitchDialog } from "./PresetSwitchDialog";
import { FancySelect, type FancyOption } from "./FancySelect";
import { DisplaySettings } from "./DisplaySettings";
import { exportBoardRef } from "../lib/exportNode";

const NAV = [
  { to: "/", label: "编辑器", icon: PencilLine },
  { to: "/templates", label: "模板", icon: LayoutTemplate },
  { to: "/mine", label: "我的排名", icon: Library },
];

/** 风格选项：左侧小圆点预览该风格在当前日夜下的底色与强调色 */
function StyleSwatch({ id, mode }: { id: StyleId; mode: Mode }) {
  const pal = exportPalette(id, mode);
  return (
    <span
      className="grid size-4 place-items-center rounded-full border border-line"
      style={{ background: pal.pageBg }}
    >
      <span className="size-2 rounded-full" style={{ background: pal.badgeTo }} />
    </span>
  );
}

/** 评级预设选项：左侧三段色条预览档位配色 */
function PresetSwatch({ id }: { id: string }) {
  const p = TIER_PRESETS[id];
  if (!p) return null;
  return (
    <span className="flex gap-0.5">
      {p.tiers.slice(0, 4).map(([, c], i) => (
        <span key={i} className="h-4 w-1.5 rounded-[3px]" style={{ background: c }} />
      ))}
    </span>
  );
}

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const presetId = useBoard(s => s.presetId);
  const toggleMode = useBoard(s => s.toggleMode);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const setShareOpen = useUi(s => s.setShareOpen);
  const onEditor = pathname === "/";

  const styleOptions: FancyOption[] = (Object.keys(STYLE_NAMES) as StyleId[]).map(id => ({
    value: id,
    label: STYLE_NAMES[id],
    swatch: <StyleSwatch id={id} mode={mode} />,
  }));

  const presetOptions: FancyOption[] = [
    ...Object.entries(TIER_PRESETS).map(([id, p]) => ({
      value: id,
      label: p.name,
      swatch: <PresetSwatch id={id} />,
    })),
    { value: "custom", label: "自定义", disabled: presetId !== "custom" },
  ];

  function requestPreset(id: string) {
    if (!TIER_PRESETS[id]) return;
    const s = useBoard.getState();
    if (s.tiers.some(t => t.items.length)) setPendingPreset(id);
    else {
      s.applyPreset(id);
      toast(`已切换为「${TIER_PRESETS[id].name}」模式`);
    }
  }

  /** 切换风格；切到/切出「经典梗图」时，档位配色与风格自动配对（项目与档位名保留） */
  function changeStyle(v: StyleId) {
    const s = useBoard.getState();
    const isHanglaNames = s.tiers.map(t => t.name).join("") === "夯顶级人上人NPC拉完了";
    if (v === "tier" && isHanglaNames) {
      s.applyPresetColors("tier");
      s.setStyle("tier");
      toast("已切换为经典梗图风格，档位配色同步更新");
      return;
    }
    if (v !== "tier" && s.presetId === "tier" && isHanglaNames) {
      s.applyPresetColors("hangla");
      s.setStyle(v);
      toast(`已切换为「${STYLE_NAMES[v]}」，档位配色同步更新`);
      return;
    }
    s.setStyle(v);
  }

  async function handleExport() {
    const node = exportBoardRef.current;
    if (!node) return;
    toast("正在生成图片…");
    try {
      // 导出节点常驻于零高裁剪容器内（不可见、无需移动），此处直接截图即可，页面无任何抖动
      const pal = exportPalette(style, mode);
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: pal.pageBg });
      const name = (useBoard.getState().title || "从夯到拉").replace(/[\\/:*?"<>|]/g, "").trim() || "从夯到拉";
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${timestamp()}-${name}-排行榜.png`;
      a.click();
      toast("已导出 PNG，去下载目录看看");
    } catch (err) {
      toast("导出失败：" + (err as Error).message);
    }
  }

  return (
    <header className="topbar sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-2.5">
        {/* 品牌 + 导航 */}
        <div className="flex min-w-0 items-center gap-4">
          <button onClick={() => navigate("/")} className="flex cursor-pointer items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-gradient-to-br from-accent2 to-accent text-[15px] font-extrabold text-white shadow-[0_2px_12px_rgba(255,106,61,.35)]">
              夯
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <b className="text-base tracking-wide">夯拉榜</b>
              <span className="text-[9.5px] tracking-[0.18em] text-muted">HANGLA TIER LIST</span>
            </span>
          </button>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 rounded-[10px] border border-transparent px-3 py-2 text-[13.5px] text-muted transition-colors hover:bg-panel2 hover:text-ink [&_svg]:size-4",
                    isActive && "border-line bg-panel2 font-semibold text-ink",
                  )
                }
              >
                <Icon /> {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* 编辑器工具区（移动端收进底部操作栏） */}
        {onEditor && (
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FancySelect
              value={TIER_PRESETS[presetId] ? presetId : "custom"}
              options={presetOptions}
              onChange={requestPreset}
              title="评级模式：切换整套档位方案"
            />
            <FancySelect
              value={style}
              options={styleOptions}
              onChange={changeStyle}
              title="视觉风格（每种风格都有白天和黑夜配色，用旁边的按钮切换）"
            />

            {/* 白天 / 黑夜一键切换：只切当前风格的明暗，不换风格 */}
            <button
              onClick={toggleMode}
              title={mode === "day" ? "切换到黑夜配色" : "切换到白天配色"}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-panel text-ink hover:border-accent/60 [&_svg]:size-4"
            >
              {mode === "day" ? <Moon /> : <Sun />}
            </button>

            <DisplaySettings />

            <span className="mx-1 hidden h-[22px] w-px bg-line lg:block" />

            <button
              onClick={() => setShareOpen(true)}
              title="复制链接 / 下载图片"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3.5 text-[13.5px] text-ink hover:border-accent/60 [&_svg]:size-4"
            >
              <Link2 /> 分享
            </button>
            <button
              onClick={handleExport}
              title="下载高清排行图"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-transparent bg-gradient-to-br from-accent2 to-accent px-3.5 text-[13.5px] font-semibold text-white shadow-[0_2px_14px_rgba(255,106,61,.3)] hover:brightness-105 [&_svg]:size-4"
            >
              <Download /> 导出 PNG
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              title="恢复示例榜单"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-panel2 hover:text-ink [&_svg]:size-4"
            >
              <RotateCcw />
            </button>
          </div>
        )}
      </div>

      {/* 切换评级模式：保留项目 / 清空到项目库 */}
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
        }}
      />
    </header>
  );
}
