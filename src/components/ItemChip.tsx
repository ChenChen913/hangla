import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil } from "lucide-react";
import type { DisplaySettings, Item } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { cn, itemAngle } from "../lib/utils";

/** 条目卡：图片(可选) + 名称，受显示设置控制（显示图片/名称、歪着放、字体大小/字体/粗细、图片大小） */
export function ChipView({ item, display }: { item: Item; display: DisplaySettings }) {
  const showImg = display.showImages && item.image;
  const showName = display.showNames || !showImg; // 避免出现完全空白的卡片
  if (!showImg && !showName) return <span className="text-[13px] text-muted">?</span>;
  return (
    <>
      {showImg && (
        <img
          src={item.image}
          alt=""
          draggable={false}
          className="block shrink-0 rounded-[10px] object-cover"
          style={{ width: display.cardImageSize, height: display.cardImageSize }}
        />
      )}
      {showName && (
        <span
          className="max-w-[220px] truncate"
          style={{
            fontFamily: display.cardFont || undefined,
            fontSize: display.cardFontSize,
            fontWeight: display.cardFontWeight,
          }}
        >
          {item.name}
        </span>
      )}
    </>
  );
}

export function ItemChip({ item, overlay = false }: { item: Item; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item" },
    disabled: overlay,
  });
  const removeItem = useBoard(s => s.removeItem);
  const openItemDialog = useUi(s => s.openItemDialog);
  const display = useBoard(s => s.display);
  // 歪着放：旋转整个项目卡（背景/边框/图/名一起斜，像贴纸）；dnd-kit 的拖拽位移与其合并
  const tiltRot = display.tiltImages && item.image ? `rotate(${itemAngle(item, display)}deg)` : undefined;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={
        overlay
          ? undefined
          : { transform: `${CSS.Translate.toString(transform) || ""} ${tiltRot ?? ""}`.trim() || undefined, transition }
      }
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      title={item.desc || item.name}
      className={cn(
        "group relative inline-flex select-none items-center gap-2 rounded-xl border border-chipline bg-chip text-chipink shadow-[0_1px_3px_rgba(16,24,40,.08)]",
        // 有图时内边距均匀；右侧留白只在显示名称时需要（给图和文字之间留间距），
        // 否则隐藏名称后图片右侧会多出一条底色边
        item.image && display.showImages
          ? cn("cursor-grab p-1 active:cursor-grabbing", display.showNames && "pr-3")
          : "cursor-grab px-3 py-2 active:cursor-grabbing",
        !overlay && "transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_6px_16px_rgba(16,24,40,.10)]",
        isDragging && "opacity-40",
        overlay && "rotate-2 shadow-[0_16px_32px_rgba(16,24,40,.22)]",
      )}
    >
      <ChipView item={item} display={display} />
      {!overlay && (
        <span className="absolute -right-1.5 -top-1.5 hidden items-center gap-0.5 rounded-full border border-line bg-panel shadow-sm group-hover:flex">
          <button
            title="编辑"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              openItemDialog(item);
            }}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-full text-muted hover:text-accent"
          >
            <Pencil className="size-3" />
          </button>
          <button
            title="删除"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              removeItem(item.id);
              toast("已删除");
            }}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-full text-muted hover:text-danger"
          >
            ×
          </button>
        </span>
      )}
    </div>
  );
}
