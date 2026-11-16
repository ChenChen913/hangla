import { useEffect, useMemo, useState } from "react";
import { Check, Download, Link2 } from "lucide-react";
import type { Board } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { copyText, timestamp } from "../lib/utils";
import { planShare, shareLengthInfo, shareLinkNotice, type SharePlan } from "../lib/share";
import { exportBoardRef } from "../lib/exportNode";
import { assertExportBlob, currentSavePlan, downloadBlob, exportFailureMessage, exportFileName, exportSizeProblem, planExportSize, shareBlob, withTimeout } from "../lib/saveImage";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

type ShareState = { kind: "idle" } | { kind: "pending" } | { kind: "error" } | { kind: "plan"; plan: SharePlan };

/** 分享弹窗：分享卡片预览 + 复制链接 + 下载 PNG */
export function ShareDialog() {
  const open = useUi(s => s.shareOpen);
  const setShareOpen = useUi(s => s.setShareOpen);
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const title = useBoard(s => s.title);
  const subtitle = useBoard(s => s.subtitle);
  const presetId = useBoard(s => s.presetId);
  const tiers = useBoard(s => s.tiers);
  const pool = useBoard(s => s.pool);
  const display = useBoard(s => s.display);
  /** 分享卡片：Blob + object URL（用对象地址而不是几 MB 的 data URL，手机内存友好） */
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [cardError, setCardError] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [share, setShare] = useState<ShareState>({ kind: "idle" });
  // iOS / 微信里下载不可靠：弹窗里直接提示长按保存，别让用户以为文件已经存好了
  const savePlan = useMemo(() => currentSavePlan(), [open]);
  const notice = shareLinkNotice();

  // 先量长度、再决定要不要编码；大榜单分片异步编码，不卡主线程。
  // 依赖里包含 display：显示设置现在随分享走，改了设置要重新编码。
  useEffect(() => {
    if (!open) {
      setShare({ kind: "idle" });
      setLinkCopied(false);
      return;
    }
    let alive = true;
    setShare({ kind: "pending" });
    const board: Board = { title, subtitle, style, mode, presetId, tiers, pool };
    planShare(board, display)
      .then(plan => {
        if (alive) setShare({ kind: "plan", plan });
      })
      .catch(() => {
        if (alive) setShare({ kind: "error" });
      });
    return () => {
      alive = false;
    };
  }, [open, title, subtitle, style, mode, presetId, tiers, pool, display]);

  const plan = share.kind === "plan" ? share.plan : null;
  const info = plan ? shareLengthInfo(plan.chars) : null;
  // 硬上限时复制按钮直接禁用：超长 URL 在多数聊天软件里必被截断，改用 PNG 才不会白发
  const copyDisabled = notice.disabled || share.kind !== "plan" || !plan || plan.status === "over";
  // 含图榜单编进链接基本都超过聊天软件能收的长度，这里如实报数，并把 PNG 提为主操作
  const linkHint =
    share.kind === "pending" || share.kind === "idle"
      ? "正在估算链接长度…"
      : share.kind === "error"
        ? "分享链接生成失败，请改用「下载 PNG」。"
        : plan?.status === "over"
          ? `链接约 ${plan.kb}KB（${plan.chars.toLocaleString()} 字符），已超过长度上限——${
              plan.estimated ? "按数据体量估算" : "已精确计算"
            }，复制出去一定被截断，请用「下载 PNG」。`
          : info && info.state === "long"
            ? `链接 ${info.kb}KB（${info.chars.toLocaleString()} 字符），微信 / QQ 里多半会被截断。发图更稳：用「下载 PNG」。`
            : notice.hint;
  const preferPng = notice.disabled || !plan || plan.status === "over" || info?.state !== "ok";

  // 打开时生成分享卡片预览（导出节点常驻零高裁剪容器，直接截图即可）
  useEffect(() => {
    if (!open) {
      setCard(null);
      setCardError(false);
      return;
    }
    const node = exportBoardRef.current;
    if (!node) return;
    let alive = true;
    let objectUrl: string | null = null;
    setCardError(false);
    // 与「导出 PNG」共用按需加载的 html-to-image，首屏不背这个包；
    // 分包装载卡住时要有明确失败，不能让预览永远停在"正在生成分享卡片…"
    withTimeout(import("html-to-image"), 15_000, "分享卡片组件加载超时")
      .then(({ toBlob }) => {
        // 与「导出 PNG」同一套尺寸规则：极端长图直接拒绝，不生成超限 / 空白画布
        const sizePlan = planExportSize(node.clientWidth || 1200, node.clientHeight);
        if (!sizePlan.ok) {
          setCard(null);
          setCardError(true);
          toast(exportSizeProblem(sizePlan), 5600);
          return null;
        }
        return withTimeout(
          toBlob(node, {
            pixelRatio: sizePlan.ratio,
            backgroundColor: exportPalette(style, mode).pageBg,
            skipFonts: display.labelFont !== "artistic",
          }),
          30_000,
          "生成分享卡片超时",
        );
      })
      .then(blob => {
        if (!alive || !blob) {
          if (alive) setCardError(true);
          return;
        }
        let safeBlob: Blob;
        try {
          safeBlob = assertExportBlob(blob);
        } catch (error) {
          setCardError(true);
          toast(exportFailureMessage(error), 5200);
          return;
        }
        objectUrl = URL.createObjectURL(safeBlob);
        setCard({ url: objectUrl, blob: safeBlob });
      })
      .catch(error => {
        if (!alive) return;
        setCard(null);
        setCardError(true);
        toast(exportFailureMessage(error), 5200);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, style, mode, display.labelFont]);

  async function copyLink() {
    if (!plan || plan.status !== "ready" || copyDisabled) return;
    if (plan.state === "long") {
      toast("链接偏长，部分聊天软件会截断——建议改用「下载 PNG」", 5000);
    }
    const ok = await copyText(plan.url);
    setLinkCopied(ok);
    // 复制失败时把链接打到控制台，作为最后一条兜底通道（弹窗里也提示了）
    toast(ok ? "分享链接已复制" : "复制失败，链接已打印到浏览器控制台", 4000);
    if (!ok) console.log("分享链接：", plan.url);
  }

  /**
   * 保存分享卡片。
   * iOS / 内置浏览器不可能靠 `a[download]` 落盘，所以走系统分享；
   * 连分享都没有时，弹窗里本来就摆着这张图，长按即可存进相册。
   */
  async function downloadPng() {
    if (!card) return;
    const filename = exportFileName(title, timestamp());
    if (savePlan.primary === "download") {
      try {
        downloadBlob(card.blob, filename);
        toast("已开始下载，请在下载目录查看");
      } catch {
        toast("下载没有启动，请长按上面的图片保存", 4800);
      }
      return;
    }
    if (!savePlan.showShare) {
      toast("当前浏览器不支持可靠下载，长按上面的图片保存即可", 4800);
      return;
    }
    const result = await shareBlob(card.blob, filename, "排行榜图片");
    if (result === "shared") toast("已交给系统，选「存储图像」即可进相册");
    else if (result === "cancelled") toast("已取消");
    else toast("长按上面的图片，选「存储图像 / 保存图片」即可", 5000);
  }

  const saveLabel = savePlan.primary === "download" ? "下载 PNG" : "保存 PNG";
  const canSavePng = savePlan.primary !== "longpress";

  return (
    <Dialog open={open} onOpenChange={setShareOpen}>
      <DialogContent className="w-[min(92vw,560px)]">
        <DialogTitle>分享你的排名</DialogTitle>
        <DialogDescription>
          复制链接给朋友看可交互版本（会带上你的显示设置），或下载图片直接发群 / 朋友圈 / 小红书。
        </DialogDescription>

        <div className="mt-4 max-h-[46vh] overflow-hidden rounded-xl border border-line bg-panel2">
          {card ? (
            <img src={card.url} alt="分享卡片预览" className="w-full" />
          ) : (
            <div className="grid h-40 place-items-center text-sm text-muted">
              {cardError ? "分享卡片生成失败，请用「导出 PNG」重试" : "正在生成分享卡片…"}
            </div>
          )}
        </div>

        {savePlan.showLongPressHint && card && (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            长按上面的图片也能直接存进相册（iOS / 微信里最稳的一条路）。
          </p>
        )}

        {linkHint && <p className="mt-3 text-[12px] leading-relaxed text-muted">{linkHint}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {/* 长链接时把「下载 PNG」放到前面：默认焦点落在真能发出去的那个按钮上 */}
          {preferPng && canSavePng && (
            <Button variant="primary" disabled={!card} onClick={() => void downloadPng()}>
              <Download /> {saveLabel}（推荐）
            </Button>
          )}
          <Button
            variant={preferPng && !copyDisabled ? "ghost" : "default"}
            onClick={copyLink}
            disabled={copyDisabled}
            title={linkHint || undefined}
          >
            {linkCopied ? <Check /> : <Link2 />} {linkCopied ? "链接已复制" : "复制链接"}
          </Button>
          {!preferPng && canSavePng && (
            <Button variant="primary" disabled={!card} onClick={() => void downloadPng()}>
              <Download /> {saveLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
