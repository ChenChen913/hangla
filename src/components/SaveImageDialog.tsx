import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { downloadBlob, shareBlob } from "../lib/saveImage";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * 手机端导出 PNG 后的「保存图片」面板。
 *
 * 为什么不直接把文件塞给浏览器：iOS 在 `await` 之后已经脱离用户手势，
 * 程序化的 `a.click()` 会被静默拦截；微信 / QQ 的内置浏览器更是直接忽略 `download`。
 * 这里先把图摆出来，面板里的按钮是**新的**用户手势，分享 / 下载都能正常触发；
 * 都不可用时，长按图片保存是任何手机浏览器都支持的最后一条路。
 */
export function SaveImageDialog() {
  const pending = useUi(s => s.pendingImage);
  const setPending = useUi(s => s.setPendingImage);
  const [busy, setBusy] = useState(false);

  // 面板关闭 / 换一张图时释放上一张的 object URL，避免几 MB 的位图一直挂在内存里
  useEffect(() => {
    const url = pending?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending]);

  if (!pending) return null;

  async function share() {
    if (!pending || busy) return;
    setBusy(true);
    const result = await shareBlob(pending.blob, pending.filename, "排行榜图片");
    setBusy(false);
    if (result === "shared") {
      toast("已打开系统分享，选「存储图像」即可进相册");
      setPending(null);
    } else if (result === "cancelled") {
      toast("已取消");
    } else {
      toast("这个浏览器不支持系统分享，长按上面的图片保存即可", 4200);
    }
  }

  function download() {
    if (!pending) return;
    downloadBlob(pending.blob, pending.filename);
    toast("已开始下载，去相册 / 下载目录看看");
  }

  return (
    <Dialog open onOpenChange={open => !open && setPending(null)}>
      <DialogContent>
        <DialogTitle>保存排行榜图片</DialogTitle>
        <DialogDescription>
          图片已生成。<strong className="font-semibold text-ink">长按图片</strong>选「存储图像 / 保存图片」
          就能存进相册（iPhone、微信里都适用）；也可以点下面的按钮。
        </DialogDescription>

        <div className="mt-4 max-h-[44vh] overflow-hidden rounded-xl border border-line bg-panel2">
          <img src={pending.url} alt="排行榜图片" className="mx-auto max-h-[44vh] w-auto max-w-full" />
        </div>

        {/* 两列网格：320px 也能一行放下两个次要按钮，主操作独占一行（拇指最顺手） */}
        <div className="sticky bottom-0 -mx-4 mt-4 grid grid-cols-2 gap-2 border-t border-line bg-panel px-4 pb-1 pt-3 md:-mx-5 md:px-5">
          <Button variant="primary" className="col-span-2" disabled={busy} onClick={() => void share()}>
            <Share2 /> {busy ? "正在打开…" : "保存 / 分享"}
          </Button>
          <Button variant="default" onClick={download}>
            <Download /> 直接下载
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
