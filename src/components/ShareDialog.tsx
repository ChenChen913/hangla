import { useEffect, useMemo, useState } from "react";
import { toPng } from "html-to-image";
import { Check, Download, Link2 } from "lucide-react";
import type { Board } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { copyText, timestamp } from "../lib/utils";
import { SHARE_URL_HARD_LIMIT, SHARE_URL_SOFT_LIMIT, buildShareUrl, shareLinkNotice } from "../lib/share";
import { exportBoardRef } from "../lib/exportNode";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

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
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const notice = shareLinkNotice();

  // 分享链接只在弹窗打开且榜单变化时编码一次：encodeBoard 对大榜单是同步重活，
  // 不能每次点「复制链接」都重新算一遍
  const shareUrl = useMemo(() => {
    if (!open) return "";
    const board: Board = { title, subtitle, style, mode, presetId, tiers, pool };
    return buildShareUrl(board);
  }, [open, title, subtitle, style, mode, presetId, tiers, pool]);

  const overHardLimit = shareUrl.length > SHARE_URL_HARD_LIMIT;
  const overSoftLimit = shareUrl.length > SHARE_URL_SOFT_LIMIT;
  // 硬上限时复制按钮直接禁用：超长 URL 在多数聊天软件里必被截断，改用 PNG 才不会白发
  const copyDisabled = notice.disabled || overHardLimit;
  const linkHint = overHardLimit
    ? "榜单里的图片太多，分享链接已超过长度上限，复制出去一定会被截断——请改用「下载 PNG」。"
    : notice.hint;

  // 打开时生成分享卡片预览（导出节点常驻零高裁剪容器，直接截图即可）
  useEffect(() => {
    if (!open) {
      setCardUrl(null);
      setLinkCopied(false);
      return;
    }
    const node = exportBoardRef.current;
    if (!node) return;
    toPng(node, { pixelRatio: 2, backgroundColor: exportPalette(style, mode).pageBg })
      .then(url => setCardUrl(url))
      .catch(() => {
        setCardUrl(null);
        toast("分享卡片生成失败，可以直接用顶栏的「导出 PNG」", 4000);
      });
  }, [open, style, mode]);

  async function copyLink() {
    if (!shareUrl || copyDisabled) return;
    if (overSoftLimit) {
      toast("榜单含较多图片，链接会很长，部分聊天软件可能截断——建议改用「下载 PNG」", 5000);
    }
    const ok = await copyText(shareUrl);
    setLinkCopied(ok);
    // 复制失败时把链接打到控制台，作为最后一条兜底通道（弹窗里也提示了）
    toast(ok ? "分享链接已复制" : "复制失败，链接已打印到浏览器控制台", 4000);
    if (!ok) console.log("分享链接：", shareUrl);
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
        <DialogDescription>复制链接给朋友看可交互版本，或下载图片直接发群 / 朋友圈 / 小红书。</DialogDescription>

        <div className="mt-4 max-h-[46vh] overflow-hidden rounded-xl border border-line bg-panel2">
          {cardUrl ? (
            <img src={cardUrl} alt="分享卡片预览" className="w-full" />
          ) : (
            <div className="grid h-40 place-items-center text-sm text-muted">正在生成分享卡片…</div>
          )}
        </div>

        {linkHint && <p className="mt-3 text-[12px] leading-relaxed text-muted">{linkHint}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={copyLink} disabled={copyDisabled} title={linkHint || undefined}>
            {linkCopied ? <Check /> : <Link2 />} {linkCopied ? "链接已复制" : "复制链接"}
          </Button>
          <Button variant="primary" disabled={!cardUrl} onClick={downloadPng}>
            <Download /> 下载 PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
