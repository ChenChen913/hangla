import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { Tier } from "../types";
import { BOARD_LIMITS } from "../lib/utils";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "./ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/**
 * 档位编辑弹窗：名称 + 颜色 + 顺序，以及删除档位。
 * 顺序按钮是触屏用户的备用路径（桌面也可以直接点档位行右上角的上移/下移）。
 */
export function TierEditDialog({ tier, onClose }: { tier: Tier | null; onClose(): void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#9AA5B1");
  const [confirmDel, setConfirmDel] = useState(false);
  const tiers = useBoard(s => s.tiers);
  const index = tier ? tiers.findIndex(t => t.id === tier.id) : -1;

  useEffect(() => {
    if (tier) {
      setName(tier.name);
      setColor(tier.color);
      setConfirmDel(false);
    }
  }, [tier]);

  function save() {
    if (!tier) return;
    useBoard.getState().updateTier(tier.id, {
      name: name.trim() || tier.name,
      color,
    });
    toast("档位已更新");
    onClose();
  }

  return (
    <>
      <Dialog open={tier !== null} onOpenChange={v => !v && onClose()}>
        <DialogContent>
          <DialogTitle>编辑档位</DialogTitle>
          <DialogDescription>档位名称和颜色都可以自定义——「从夯到拉」只是默认模板。</DialogDescription>

          <div className="mt-4 flex items-center gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-black text-white"
              style={{ background: color }}
            >
              {name.trim().slice(0, 2) || "档"}
            </span>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && save()}
              placeholder="档位名称（如：夯）"
              maxLength={BOARD_LIMITS.tierName}
              className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[16px] text-ink outline-none focus:border-accent md:py-2 md:text-sm"
            />
          </div>
          <div className="mt-3.5 flex items-center gap-3">
            <span className="text-sm text-muted">颜色</span>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1"
            />
          </div>

          <div className="mt-3.5 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">顺序</span>
              <span className="text-[11px] text-muted">
                {index >= 0 ? `第 ${index + 1} / ${tiers.length} 档` : ""}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="default"
                disabled={index <= 0}
                onClick={() => {
                  if (!tier) return;
                  useBoard.getState().moveTier(tier.id, -1);
                  toast("档位已上移");
                }}
              >
                <ChevronUp /> 上移
              </Button>
              <Button
                variant="default"
                disabled={index < 0 || index >= tiers.length - 1}
                onClick={() => {
                  if (!tier) return;
                  useBoard.getState().moveTier(tier.id, 1);
                  toast("档位已下移");
                }}
              >
                <ChevronDown /> 下移
              </Button>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 mt-5 flex items-center justify-between gap-2 border-t border-line bg-panel px-4 pb-1 pt-3 md:-mx-5 md:px-5">
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 /> 删除档位
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button variant="primary" onClick={save}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`删除档位「${tier?.name ?? ""}」？`}
        description="档位里的项目会移回项目库，不会丢失。"
        confirmText="删除"
        danger
        onConfirm={() => {
          if (!tier) return;
          useBoard.getState().deleteTier(tier.id);
          toast("档位已删除，项目移回项目库");
          setConfirmDel(false);
          onClose();
        }}
      />
    </>
  );
}
