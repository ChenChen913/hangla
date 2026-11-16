import { Download, Hand, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { currentSavePlan, downloadBlob, shareBlob } from "../lib/saveImage";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * 手机端导出 PNG 后的「保存图片」面板。
 *
 * 为什么不直接把文件塞给浏览器：iOS 在 `await` 之后已经脱离用户手势，
 * 程序化的 `a.click()` 会被静默拦截；微信 / QQ 的内置浏览器更是直接忽略 `download`。
 * 这里先把图摆出来，面板里的按钮是**新的**用户手势，分享 / 下载都能正常触发；
 * 都不可用时，长按图片保存是任何手机浏览器都支持的最后一条路。
 *
 * 按钮不是固定的：`planSaveUi` 会按当前环境给出主入口——
 * iOS 走系统分享、内置浏览器只提示长按、桌面 / Android 才显示直接下载。
 * 已经知道不可靠的按钮不会再出现在面板里，避免"点了没反应"。
 */
export function SaveImageDialog() {
  const pending = useUi(s => s.pendingImage);
  const setPending = useUi(s => s.setPendingImage);
  const [busy, setBusy] = useState(false);
  // 每次打开面板时按当前环境计算入口；不能在组件首次挂载时算一次就固定
  // （移动端 UA 不会变，但测试 / 内置浏览器切环境时需要如实反映）
  const maybePlan = pending ? currentSavePlan() : null;
  const close = () => setPending(null);

  // 面板关闭 / 换一张图时释放上一张的 object URL，避免几 MB 的位图一直挂在内存里
  useEffect(() => {
    const url = pending?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending]);

  if (!pending || !maybePlan) return null;
  const plan = maybePlan;

  async function share() {
    if (!pending || busy || !plan.showShare) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof shareBlob>>;
    try {
      result = await shareBlob(pending.blob, pending.filename, "排行榜图片");
    } finally {
      // 无论分享 API 抛什么，都不能把按钮永远留在"正在打开…"
      setBusy(false);
    }
    if (result === "shared") {
      toast("已交给系统，选「存储图像」即可存进相册");
      close();
    } else if (result === "cancelled") {
      // 用户主动取消不是失败，面板保持打开，可以再试或长按保存
      toast("已取消");
    } else {
      toast("这个浏览器不支持系统分享，长按上面的图片保存即可", 4800);
    }
  }

  function download() {
    if (!pending || !plan.showDownload) return;
    try {
      downloadBlob(pending.blob, pending.filename);
      toast("已开始下载，请在下载目录查看");
    } catch {
      // 不能把一次没发生的下载说成"已保存"
      toast("下载没有启动，请长按上面的图片保存", 4800);
    }
  }

  const showSecondaryShare = plan.showShare && plan.primary !== "share";
  const showSecondaryDownload = plan.showDownload && plan.primary !== "download";
  const secondaryCount = Number(showSecondaryShare) + Number(showSecondaryDownload);

  return (
    <Dialog open onOpenChange={open => !open && close()}>
      <DialogContent>
        <DialogTitle>保存排行榜图片</DialogTitle>
        <DialogDescription>
          {plan.primary === "longpress" ? (
            <>
              当前浏览器不支持可靠的下载。请把手指放在下面的图片上<strong className="font-semibold text-ink">长按</strong>
              ，选「存储图像 / 保存图片」就能存进相册。
            </>
          ) : plan.primary === "share" ? (
            <>
              点下面的按钮打开系统分享，选「存储图像」即可进相册；也可以
              <strong className="font-semibold text-ink">长按图片</strong>保存。
            </>
          ) : (
            <>图片已生成，点下面的按钮保存到本地；手机上也支持长按图片保存。</>
          )}
        </DialogDescription>

        <div className="mt-4 max-h-[44vh] overflow-hidden rounded-xl border border-line bg-panel2">
          <img src={pending.url} alt="排行榜图片" className="mx-auto max-h-[44vh] w-auto max-w-full" />
        </div>

        {/* 两列网格：320px 也能一行放下两个次要按钮，主操作独占一行（拇指最顺手） */}
        <div className="sticky bottom-0 -mx-4 mt-4 grid grid-cols-2 gap-2 border-t border-line bg-panel px-4 pb-1 pt-3 md:-mx-5 md:px-5">
          {plan.primary === "download" && (
            <Button variant="primary" className="col-span-2" onClick={download}>
              <Download /> 下载图片
            </Button>
          )}
          {plan.primary === "share" && (
            <Button variant="primary" className="col-span-2" disabled={busy} onClick={() => void share()}>
              <Share2 /> {busy ? "正在打开…" : "保存 / 分享"}
            </Button>
          )}
          {plan.primary === "longpress" && (
            <p className="col-span-2 flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-line bg-panel2 px-3 py-3 text-center text-[13px] text-ink">
              <Hand className="size-4 shrink-0 text-accent" />
              长按上方图片 →「存储图像 / 保存图片」
            </p>
          )}
          {showSecondaryShare && (
            <Button variant="default" disabled={busy} onClick={() => void share()}>
              <Share2 /> 系统分享
            </Button>
          )}
          {showSecondaryDownload && (
            <Button variant="default" onClick={download}>
              <Download /> 直接下载
            </Button>
          )}
          <Button variant="ghost" className={secondaryCount === 0 ? "col-span-2" : undefined} onClick={close}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
