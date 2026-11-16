import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ImagePlus, Trash2 } from "lucide-react";
import type { Item } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { BOARD_LIMITS, uid } from "../lib/utils";
import { locateItem } from "../lib/drag";
import { fileToImageItem } from "../lib/images";
import { Button } from "./ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Toggle } from "./DisplaySettings";

/**
 * 添加 / 编辑项目弹窗：名称 + 图片（可选）+ 一句话描述（可选）+ 单独歪斜角度（可选）。
 *
 * 手机上没有拖拽也能完成全部操作：编辑态提供「上移 / 下移 / 换到相邻档位 / 删除」，
 * 全部是 44px 按钮；桌面保持原有交互（悬停出现编辑/删除、直接拖拽）。
 */
export function ItemDialog() {
  const { open, item } = useUi(s => s.itemDialog);
  const closeItemDialog = useUi(s => s.closeItemDialog);
  const tiltImagesOn = useBoard(s => s.display.tiltImages);
  // 位置按钮要随移动实时更新，必须订阅 tiers / pool
  const tiers = useBoard(s => s.tiers);
  const pool = useBoard(s => s.pool);
  const editing = item !== null;

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [tiltCustom, setTiltCustom] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setDesc(item?.desc ?? "");
      setImage(item?.image);
      setTiltCustom(typeof item?.tilt === "number");
      setTilt(typeof item?.tilt === "number" ? item.tilt : 0);
      setConfirmDel(false);
    }
  }, [open, item]);

  async function pickImage(files: FileList | null) {
    const f = files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    // 与项目库走同一条重编码路径：照片转 JPEG、透明插画留 PNG，超大原图也不会原样塞进存档
    const next = await fileToImageItem(f);
    if (!next?.image) {
      toast("这张图片读不出来，换一张试试", 3600);
      return;
    }
    setImage(next.image);
  }

  /** 把表单里的改动写进 store；返回 false 表示名称不合法，调用方不要再继续移动/关闭 */
  function applyEdits(): boolean {
    const n = name.trim();
    if (!n) {
      toast("先给项目起个名字");
      return false;
    }
    const patch: Omit<Item, "id"> = {
      name: n,
      desc: desc.trim() || undefined,
      image,
      tilt: tiltCustom ? tilt : undefined,
    };
    if (editing && item) useBoard.getState().updateItem(item.id, patch);
    else useBoard.getState().addItemToPool({ id: uid(), ...patch });
    return true;
  }

  function submit() {
    if (!applyEdits()) return;
    toast(editing ? "已更新项目" : `「${name.trim()}」已加入项目库，拖进档位即可`);
    closeItemDialog();
  }

  /** 非拖拽的移动方式：先落盘当前编辑，再移动，弹窗不关（可以连续调） */
  function move(kind: "up" | "down" | "prev" | "next") {
    if (!item) return;
    if (!applyEdits()) return;
    const s = useBoard.getState();
    const ok =
      kind === "up"
        ? s.nudgeItem(item.id, -1)
        : kind === "down"
          ? s.nudgeItem(item.id, 1)
          : kind === "prev"
            ? s.shiftItem(item.id, -1)
            : s.shiftItem(item.id, 1);
    if (!ok) {
      toast(kind === "up" || kind === "prev" ? "已经到最前面了" : "已经到最后面了");
      return;
    }
    toast(
      kind === "up" ? "已上移一位" : kind === "down" ? "已下移一位" : kind === "prev" ? "已移到上一档" : "已移到下一档",
    );
  }

  const loc = editing && item ? locateItem({ tiers, pool }, item.id) : null;
  const listLength = loc ? (loc.container === "pool" ? pool.length : tiers[loc.tierIndex!].items.length) : 0;
  const order = [...tiers.map(t => t.id), "pool"];
  const containerIndex = loc ? order.indexOf(loc.container) : -1;
  const canMoveUp = !!loc && loc.index > 0;
  const canMoveDown = !!loc && loc.index < listLength - 1;
  const canPrevTier = containerIndex > 0;
  const canNextTier = containerIndex >= 0 && containerIndex < order.length - 1;

  return (
    <Dialog open={open} onOpenChange={v => !v && closeItemDialog()}>
      <DialogContent>
        <DialogTitle>{editing ? "编辑项目" : "添加项目"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "改完点保存。手机上也可以直接点卡片进来，用下面的按钮换位置。"
            : "名称必填；图片和一句话描述可选。加图的项目卡在排行榜里更有辨识度。"}
        </DialogDescription>

        <div className="mt-4 space-y-3.5">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-line text-muted hover:border-accent/60 hover:text-accent"
              title="上传 Logo / 图片"
            >
              {image ? (
                <img src={image} alt="" className="h-full w-full object-contain" />
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
                maxLength={BOARD_LIMITS.itemName}
                className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent md:py-2 md:text-sm"
              />
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="一句话描述（可选，如：通用型 AI 助手）"
                maxLength={BOARD_LIMITS.desc}
                className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent md:py-2 md:text-sm"
              />
            </div>
          </div>
          {image && (
            <button
              type="button"
              onClick={() => setImage(undefined)}
              className="min-h-10 cursor-pointer px-1 text-xs text-muted hover:text-danger"
            >
              移除图片
            </button>
          )}

          {/* 位置：没有拖拽也能换位（触屏用户的主要路径） */}
          {editing && loc && (
            <div className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink">位置</span>
                <span className="text-[11px] text-muted">
                  {loc.container === "pool" ? "项目库" : `第 ${loc.tierIndex! + 1} 档 · 第 ${loc.index + 1} 位`}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="default" disabled={!canMoveUp} onClick={() => move("up")}>
                  <ArrowUp /> 上移
                </Button>
                <Button variant="default" disabled={!canMoveDown} onClick={() => move("down")}>
                  <ArrowDown /> 下移
                </Button>
                <Button variant="default" disabled={!canPrevTier} onClick={() => move("prev")}>
                  <ChevronUp /> 移到上一档
                </Button>
                <Button variant="default" disabled={!canNextTier} onClick={() => move("next")}>
                  <ChevronDown /> 移到下一档
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                也可以长按卡片 0.2 秒后直接拖到别的档位；项目库的上一档是最后一个档位。
              </p>
            </div>
          )}

          {/* 单独歪斜角度 */}
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">单独设置歪斜角度</span>
                <span className="block text-[11px] text-muted">
                  {tiltImagesOn
                    ? "开启后这张图固定用下面的角度，不走全局随机"
                    : "需先在「显示与样式」里开启「图片歪着放」才会生效"}
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
                  className="min-h-10 shrink-0 cursor-pointer px-1 text-[11px] text-muted hover:text-ink"
                >
                  归零
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部操作条：手机抽屉里粘在底部，内容再长也够得到保存 */}
        <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-2 border-t border-line bg-panel px-4 pb-1 pt-3 md:-mx-5 md:px-5">
          {editing && item ? (
            <Button variant="danger" onClick={() => setConfirmDel(true)} aria-label={`删除「${item.name}」`}>
              <Trash2 /> 删除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeItemDialog}>
              取消
            </Button>
            <Button variant="primary" onClick={submit}>
              {editing ? "保存" : "添加"}
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmDel}
          onOpenChange={setConfirmDel}
          title={`删除「${item?.name ?? ""}」？`}
          description="删除后这个项目会从榜单和项目库里一起消失，撤销可以找回。"
          confirmText="删除"
          danger
          onConfirm={() => {
            if (!item) return;
            useBoard.getState().removeItem(item.id);
            toast("项目已删除");
            closeItemDialog();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
