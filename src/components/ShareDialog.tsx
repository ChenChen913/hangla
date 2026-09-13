import { useEffect, useState } from "react";
import { toPng } from "html-to-image";
import { Check, Download, Link2 } from "lucide-react";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { copyText, encodeBoard, timestamp } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { exportBoardRef } from "../pages/EditorPage";

/** 分享弹窗：分享卡片预览 + 复制链接 + 下载 PNG */
export function ShareDialog() {
  const open = useUi(s => s.shareOpen);
  const setShareOpen = useUi(s => s.setShareOpen);
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const title = useBoard(s => s.title);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // 打开时生成分享卡片预览（导出节点常驻零高裁剪容器，直接截图即可）
  useEffect(() => {
    if (!open) {
      setCardUrl(null);
      setLinkCopied(false);
      return;
    }
    const node = exportBoardRef.current;
    if (!node) return;
    toPng(node, { pixelRatio: 2, backgroundColor: exportPalette(style as never, mode as never).pageBg })
      .then(url => setCardUrl(url))
      .catch(() => setCardUrl(null));
  }, [open, style, mode]);

  function shareUrl() {
    const s = useBoard.getState();
    const payload = encodeBoard({
      title: s.title,
      subtitle: s.subtitle,
      style: s.style,
      mode: s.mode,
      presetId: s.presetId,
      tiers: s.tiers,
      pool: s.pool,
    });
    return location.href.split("#")[0] + "#/r/" + payload;
  }

  async function copyLink() {
    const url = shareUrl();
    if (url.length > 80000) toast("提示：榜单含较多图片，链接可能过长");
    const ok = await copyText(url);
    setLinkCopied(ok);
    toast(ok ? "分享链接已复制" : "复制失败，链接已打印到控制台");
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

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={copyLink}>
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
