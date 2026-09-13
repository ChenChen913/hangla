import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Tier } from "../types";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "./ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/** 档位编辑弹窗：名称 + 颜色，以及删除档位 */
export function TierEditDialog({ tier, onClose }: { tier: Tier | null; onClose(): void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#9AA5B1");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (tier) {
      setName(tier.name);
      setColor(tier.color);
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
              className="w-full rounded-[10px] border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="mt-3.5 flex items-center gap-3">
            <span className="text-sm text-muted">颜色</span>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded-lg border border-line bg-transparent p-1"
            />
          </div>

          <div className="mt-5 flex items-center justify-between">
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
          onClose();
        }}
      />
    </>
  );
}
