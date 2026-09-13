import { Library } from "lucide-react";
import { TIER_PRESETS } from "../lib/presets";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

/** 切换评级模式确认：有项目时让用户选「带着项目切」还是「清空到项目库」 */
export function PresetSwitchDialog({
  presetId,
  onClose,
}: {
  presetId: string | null;
  onClose(): void;
}) {
  const preset = presetId ? TIER_PRESETS[presetId] : null;
  const itemCount = useBoard(s => s.tiers.reduce((a, t) => a + t.items.length, 0));

  function apply(keepItems: boolean) {
    if (!presetId) return;
    useBoard.getState().applyPreset(presetId, keepItems);
    toast(
      keepItems
        ? `已切换为「${TIER_PRESETS[presetId].name}」，项目按档位顺序保留`
        : `已切换为「${TIER_PRESETS[presetId].name}」，项目已移回项目库`,
    );
    onClose();
  }

  return (
    <Dialog open={presetId !== null} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogTitle>切换到「{preset?.name ?? ""}」？</DialogTitle>
        <DialogDescription>
          当前 {itemCount} 个项目还在档位里。切换后怎么处理这些项目？
        </DialogDescription>

        <div className="mt-4 space-y-2">
          <Button
            variant="primary"
            className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left"
            onClick={() => apply(true)}
          >
            <span className="text-sm">保留项目，跟着切</span>
            <span className="text-xs font-normal opacity-80">项目按档位顺序带到新档位，装不下的回项目库</span>
          </Button>
          <Button
            className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-left"
            onClick={() => apply(false)}
          >
            <span className="text-sm">清空到项目库</span>
            <span className="flex items-center gap-1 text-xs font-normal text-muted">
              <Library className="size-3.5" /> 全部移回项目库，切过去重新排
            </span>
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
