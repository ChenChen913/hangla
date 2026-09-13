import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { Item } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { uid } from "../lib/utils";
import { fileToImageItem } from "../lib/images";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Toggle } from "./DisplaySettings";

/** 添加 / 编辑项目弹窗：名称 + 图片（可选）+ 一句话描述（可选）+ 单独歪斜角度（可选） */
export function ItemDialog() {
  const { open, item } = useUi(s => s.itemDialog);
  const closeItemDialog = useUi(s => s.closeItemDialog);
  const tiltImagesOn = useBoard(s => s.display.tiltImages);
  const editing = item !== null;

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [tiltCustom, setTiltCustom] = useState(false);
  const [tilt, setTilt] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setDesc(item?.desc ?? "");
      setImage(item?.image);
      setTiltCustom(typeof item?.tilt === "number");
      setTilt(typeof item?.tilt === "number" ? item.tilt : 0);
    }
  }, [open, item]);

  async function pickImage(files: FileList | null) {
    const f = files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    // 与项目库走同一条重编码路径：照片转 JPEG、透明插画留 PNG，超大原图也不会原样塞进存档
    const item = await fileToImageItem(f);
    if (!item?.image) {
      toast("这张图片读不出来，换一张试试", 3600);
      return;
    }
    setImage(item.image);
  }

  function submit() {
    const n = name.trim();
    if (!n) {
      toast("先给项目起个名字");
      return;
    }
    const patch: Omit<Item, "id"> = {
      name: n,
      desc: desc.trim() || undefined,
      image,
      tilt: tiltCustom ? tilt : undefined,
    };
    if (editing && item) {
      useBoard.getState().updateItem(item.id, patch);
      toast("已更新项目");
    } else {
      useBoard.getState().addItemToPool({ id: uid(), ...patch });
      toast(`「${n}」已加入项目库，拖进档位即可`);
    }
    closeItemDialog();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && closeItemDialog()}>
      <DialogContent>
        <DialogTitle>{editing ? "编辑项目" : "添加项目"}</DialogTitle>
        <DialogDescription>名称必填；图片和一句话描述可选。加图的项目卡在排行榜里更有辨识度。</DialogDescription>

        <div className="mt-4 space-y-3.5">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-line text-muted hover:border-accent/60 hover:text-accent"
              title="上传 Logo / 图片"
            >
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="size-5" />
              )}
            </button>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/*"
              onChange={e => {
                pickImage(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex-1 space-y-2">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="项目名称（如：ChatGPT）"
                className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="一句话描述（可选，如：通用型 AI 助手）"
                className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          </div>
          {image && (
            <button
              type="button"
              onClick={() => setImage(undefined)}
              className="cursor-pointer text-xs text-muted hover:text-danger"
            >
              移除图片
            </button>
          )}

          {/* 单独歪斜角度 */}
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">单独设置歪斜角度</span>
                <span className="block text-[11px] text-muted">
                  {tiltImagesOn
                    ? "开启后这张图固定用下面的角度，不走全局随机"
                    : "需先在顶部「显示与样式」里开启「图片歪着放」才会生效"}
                </span>
              </span>
              <Toggle checked={tiltCustom} onChange={setTiltCustom} />
            </div>
            {tiltCustom && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={1}
                  value={tilt}
                  onChange={e => setTilt(Number(e.target.value))}
                  className="flex-1 cursor-pointer accent-[var(--c-accent)]"
                />
                <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-muted">{tilt}°</span>
                <button
                  type="button"
                  onClick={() => setTilt(0)}
                  className="cursor-pointer text-[11px] text-muted hover:text-ink"
                >
                  归零
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={closeItemDialog}>
            取消
          </Button>
          <Button variant="primary" onClick={submit}>
            {editing ? "保存" : "添加"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
