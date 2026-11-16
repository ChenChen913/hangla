import { useEffect, useState } from "react";
import { Check, Download, Link2 } from "lucide-react";
import type { Board } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { copyText, timestamp } from "../lib/utils";
import { planShare, shareLengthInfo, shareLinkNotice, type SharePlan } from "../lib/share";
import { exportBoardRef } from "../lib/exportNode";
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
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [share, setShare] = useState<ShareState>({ kind: "idle" });
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
      setCardUrl(null);
      return;
    }
    const node = exportBoardRef.current;
    if (!node) return;
    let alive = true;
    // 与「导出 PNG」共用按需加载的 html-to-image，首屏不背这个包
    import("html-to-image")
      .then(({ toPng }) => toPng(node, { pixelRatio: 2, backgroundColor: exportPalette(style, mode).pageBg }))
      .then(url => {
        if (alive) setCardUrl(url);
      })
      .catch(() => {
        if (!alive) return;
        setCardUrl(null);
        toast("分享卡片生成失败，可以直接用顶栏的「导出 PNG」", 4000);
      });
    return () => {
      alive = false;
    };
  }, [open, style, mode]);

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

  function downloadPng() {
    if (!cardUrl) return;
    const name = (title || "从夯到拉").replace(/[\\/:*?"<>|]/g, "").trim() || "从夯到拉";
    const a = document.createElement("a");
    a.href = cardUrl;
    a.download = `${timestamp()}-${name}-排行榜.png`;
    a.click();
    toast("已下载 PNG，去下载目录看看");
  }

  return (
    <Dialog open={open} onOpenChange={setShareOpen}>
      <DialogContent className="w-[min(92vw,560px)]">
        <DialogTitle>分享你的排名</DialogTitle>
        <DialogDescription>
          复制链接给朋友看可交互版本（会带上你的显示设置），或下载图片直接发群 / 朋友圈 / 小红书。
        </DialogDescription>

        <div className="mt-4 max-h-[46vh] overflow-hidden rounded-xl border border-line bg-panel2">
          {cardUrl ? (
            <img src={cardUrl} alt="分享卡片预览" className="w-full" />
          ) : (
            <div className="grid h-40 place-items-center text-sm text-muted">正在生成分享卡片…</div>
          )}
        </div>

        {linkHint && <p className="mt-3 text-[12px] leading-relaxed text-muted">{linkHint}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {/* 长链接时把「下载 PNG」放到前面：默认焦点落在真能发出去的那个按钮上 */}
          {preferPng && (
            <Button variant="primary" disabled={!cardUrl} onClick={downloadPng}>
              <Download /> 下载 PNG（推荐）
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
          {!preferPng && (
            <Button variant="primary" disabled={!cardUrl} onClick={downloadPng}>
              <Download /> 下载 PNG
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
