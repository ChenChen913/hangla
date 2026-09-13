import { useEffect, useState } from "react";
import { toPng } from "html-to-image";
import { Check, Download, Link2 } from "lucide-react";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { copyText, timestamp } from "../lib/utils";
import { SHARE_URL_SOFT_LIMIT, buildShareUrl, shareLinkNotice } from "../lib/share";
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
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const notice = shareLinkNotice();

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

  function shareUrl() {
    const s = useBoard.getState();
    return buildShareUrl({
      title: s.title,
      subtitle: s.subtitle,
      style: s.style,
      mode: s.mode,
      presetId: s.presetId,
      tiers: s.tiers,
      pool: s.pool,
    });
  }

  async function copyLink() {
    const url = shareUrl();
    if (url.length > SHARE_URL_SOFT_LIMIT) {
      toast("榜单含较多图片，链接会很长，部分聊天软件可能截断——建议改用「下载 PNG」", 5000);
    }
    const ok = await copyText(url);
    setLinkCopied(ok);
    // 复制失败时把链接打到控制台，作为最后一条兜底通道（弹窗里也提示了）
    toast(ok ? "分享链接已复制" : "复制失败，链接已打印到浏览器控制台", 4000);
    if (!ok) console.log("分享链接：", url);
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

        {notice.hint && <p className="mt-3 text-[12px] leading-relaxed text-muted">{notice.hint}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={copyLink} disabled={notice.disabled} title={notice.hint || undefined}>
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
