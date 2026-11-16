import { Download, LayoutTemplate, Library, Link2, Moon, PencilLine, Redo2, RotateCcw, Sun, Undo2 } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { STYLE_NAMES, exportPalette } from "../lib/themes";
import type { Mode, StyleId } from "../lib/themes";
import type { Tier } from "../types";
import { TIER_PRESETS } from "../lib/presets";
import { cn, timestamp } from "../lib/utils";
import { ConfirmDialog } from "./ui/dialog";
import { PresetSwitchDialog } from "./PresetSwitchDialog";
import { FancySelect, type FancyOption } from "./FancySelect";
import { DisplaySettings } from "./DisplaySettings";
import { exportBoardRef } from "../lib/exportNode";
import { currentSaveChannel, downloadBlob, exportFileName, exportPixelRatio } from "../lib/saveImage";

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

/** 视觉风格下拉选项（桌面工具栏与移动端设置抽屉共用） */
export function buildStyleOptions(mode: Mode): FancyOption[] {
  return (Object.keys(STYLE_NAMES) as StyleId[]).map(id => ({
    value: id,
    label: STYLE_NAMES[id],
    swatch: <StyleSwatch id={id} mode={mode} />,
  }));
}

/** 评级模式下拉选项（桌面工具栏与移动端设置抽屉共用） */
export function buildPresetOptions(presetId: string): FancyOption[] {
  return [
    ...Object.entries(TIER_PRESETS).map(([id, p]) => ({
      value: id,
      label: p.name,
      swatch: <PresetSwatch id={id} />,
    })),
    { value: "custom", label: "自定义", disabled: presetId !== "custom" },
  ];
}

/** 档位名是否为默认「从夯到拉」五档：风格↔配色联动只动默认模板，避免覆盖自定义榜单 */
function isHanglaTierNames(tiers: Tier[]) {
  return tiers.map(t => t.name).join("") === "夯顶级人上人NPC拉完了";
}

/**
 * 当前档位颜色是否与「经典梗图」预设的对应档位逐一相同。
 * 不能用 presetId === "tier" 判断：applyPresetColors 会把 presetId 改成 custom，
 * 那样「切出经典梗图时换回夯拉配色」的分支永远不成立。
 */
export function hasTierPresetColors(tiers: Tier[]) {
  const preset = TIER_PRESETS.tier.tiers;
  return (
    tiers.length === preset.length &&
    preset.every(([, color], i) => tiers[i].color.toLowerCase() === color.toLowerCase())
  );
}

/** 切换视觉风格；切到/切出「经典梗图」时，档位配色与风格自动配对（项目与档位名保留） */
export function changeStyle(v: StyleId) {
  const s = useBoard.getState();
  const isHanglaNames = isHanglaTierNames(s.tiers);
  if (v === "tier" && isHanglaNames) {
    s.applyPresetColors("tier");
    s.setStyle("tier");
    toast("已切换为经典梗图风格，档位配色同步更新");
    return;
  }
  if (v !== "tier" && isHanglaNames && hasTierPresetColors(s.tiers)) {
    s.applyPresetColors("hangla");
    s.setStyle(v);
    toast(`已切换为「${STYLE_NAMES[v]}」，档位配色同步更新`);
    return;
  }
  s.setStyle(v);
}

/** 切换评级模式：有项目时交给确认弹窗选「保留/清空」，否则直接应用 */
export function requestPresetChange(id: string, onNeedConfirm: (id: string) => void) {
  if (!TIER_PRESETS[id]) return;
  const s = useBoard.getState();
  if (s.tiers.some(t => t.items.length)) onNeedConfirm(id);
  else {
    s.applyPreset(id);
    toast(`已切换为「${TIER_PRESETS[id].name}」模式`);
  }
}

/** 截图屏幕外导出画布（顶栏「导出 PNG」与移动端设置抽屉共用） */
export async function exportBoardPng() {
  const node = exportBoardRef.current;
  if (!node) return;
  toast("正在生成图片…");
  try {
    // 按需加载：html-to-image 只在导出时才需要，不能拖累首屏
    const { toBlob } = await import("html-to-image");
    const s = useBoard.getState();
    const pal = exportPalette(s.style, s.mode);
    // 画布按设备上限自适应：长榜单按 2 倍会超过 iOS 单边 4096，得到一张空白图
    const width = node.clientWidth || 1200;
    const height = node.clientHeight || 1;
    const blob = await toBlob(node, {
      pixelRatio: exportPixelRatio(width, height),
      backgroundColor: pal.pageBg,
      // 只有「艺术」档位标签用得到得意黑（1.1MB 的网络字体）。
      // 不嵌字体时省下约 1.5MB 的 base64，手机导出明显更稳、更快；系统字体本来就能直接渲染
      skipFonts: s.display.labelFont !== "artistic",
    });
    if (!blob) throw new Error("画布生成失败，可能是图片过大");
    const filename = exportFileName(s.title, timestamp());

    // 桌面 / Android 浏览器直接下载；iOS 与微信等内置浏览器改成先出预览面板。
    // （原因见 lib/saveImage.ts 顶部注释：await 之后 a.click() 在 iOS 会被静默拦截）
    if (currentSaveChannel() === "download") {
      downloadBlob(blob, filename);
      toast("已导出 PNG，去下载目录看看");
      return;
    }
    useUi.getState().setPendingImage({ url: URL.createObjectURL(blob), blob, filename });
  } catch (err) {
    // 手机端失败最常见的原因是位图太大（图片多 + 档位多），给出能立刻照做的建议
    const message = (err as Error)?.message || "未知原因";
    toast(`导出失败：${message.slice(0, 60)}。图太多太大时，先删掉几张图片再试`, 5200);
  }
}

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const presetId = useBoard(s => s.presetId);
  const toggleMode = useBoard(s => s.toggleMode);
  const past = useBoard(s => s.history.past);
  const future = useBoard(s => s.history.future);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const setShareOpen = useUi(s => s.setShareOpen);
  const onEditor = pathname === "/";

  const styleOptions = buildStyleOptions(mode);
  const presetOptions = buildPresetOptions(presetId);

  return (
    <header className="topbar sticky top-0 z-50 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-nowrap items-center justify-between gap-2 px-3 py-1.5 md:flex-wrap md:gap-3 md:px-5 md:py-2.5">
        {/* 品牌 + 导航：手机上必须一行放下（320px 也不许把「编辑器」拆成两行） */}
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <button
            onClick={() => navigate("/")}
            aria-label="夯拉榜首页"
            className="-mx-1 -my-1 flex shrink-0 cursor-pointer items-center gap-2.5 px-1 py-1"
          >
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent2 to-accent text-[14px] font-extrabold text-white shadow-[0_2px_12px_rgba(255,106,61,.35)] md:h-[34px] md:w-[34px] md:text-[15px]">
              夯
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <b className="text-base tracking-wide">夯拉榜</b>
              <span className="text-[9.5px] tracking-[0.18em] text-muted">HANGLA TIER LIST</span>
            </span>
          </button>
          <nav className="flex items-center gap-0.5 md:gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-[10px] border border-transparent px-1.5 text-[12.5px] text-muted transition-colors hover:bg-panel2 hover:text-ink md:h-auto md:gap-1.5 md:px-3 md:py-2 md:text-[13.5px] [&_svg]:size-4 [&_svg]:shrink-0",
                    isActive && "border-line bg-panel2 font-semibold text-ink",
                  )
                }
              >
                <Icon /> {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* 编辑器工具区（移动端收进设置抽屉） */}
        {onEditor && (
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FancySelect
              value={TIER_PRESETS[presetId] ? presetId : "custom"}
              options={presetOptions}
              onChange={id => requestPresetChange(id, setPendingPreset)}
              title="评级模式：切换整套档位方案"
              ariaLabel="评级模式"
            />
            <FancySelect
              value={style}
              options={styleOptions}
              onChange={changeStyle}
              title="视觉风格（每种风格都有白天和黑夜配色，用旁边的按钮切换）"
              ariaLabel="视觉风格"
            />

            {/* 白天 / 黑夜一键切换：只切当前风格的明暗，不换风格 */}
            <button
              onClick={toggleMode}
              title={mode === "day" ? "切换到黑夜配色" : "切换到白天配色"}
              aria-label={mode === "day" ? "切换到黑夜配色" : "切换到白天配色"}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-line bg-panel text-ink hover:border-accent/60 [&_svg]:size-4"
            >
              {mode === "day" ? <Moon /> : <Sun />}
            </button>

            <DisplaySettings />

            {/* 撤销 / 重做：键盘 Ctrl+Z / Ctrl+Shift+Z 也有，这里给鼠标用户一个入口 */}
            <div className="inline-flex overflow-hidden rounded-[10px] border border-line bg-panel">
              <button
                onClick={() => useBoard.getState().undo()}
                disabled={!past}
                title="撤销（Ctrl+Z）"
                aria-label="撤销"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center text-ink hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-4"
              >
                <Undo2 />
              </button>
              <span aria-hidden className="w-px bg-line" />
              <button
                onClick={() => useBoard.getState().redo()}
                disabled={!future}
                title="重做（Ctrl+Shift+Z）"
                aria-label="重做"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center text-ink hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-4"
              >
                <Redo2 />
              </button>
            </div>

            <span className="mx-1 hidden h-[22px] w-px bg-line lg:block" />

            <button
              onClick={() => setShareOpen(true)}
              title="复制链接 / 下载图片"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3.5 text-[13.5px] text-ink hover:border-accent/60 [&_svg]:size-4"
            >
              <Link2 /> 分享
            </button>
            <button
              onClick={() => void exportBoardPng()}
              title="下载高清排行图"
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-transparent bg-gradient-to-br from-accent2 to-accent px-3.5 text-[13.5px] font-semibold text-white shadow-[0_2px_14px_rgba(255,106,61,.3)] hover:brightness-105 [&_svg]:size-4"
            >
              <Download /> 导出 PNG
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              title="恢复示例榜单"
              aria-label="恢复示例榜单"
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
