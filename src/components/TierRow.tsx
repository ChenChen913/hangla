import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DisplaySettings, Tier } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { exportPalette } from "../lib/themes";
import { itemAngle, labelTextColor, lighten, mixColors } from "../lib/utils";
import { cn } from "../lib/utils";
import { ItemChip } from "./ItemChip";
import { TierEditDialog } from "./TierEditDialog";
import { TierLabel } from "./TierLabel";

export function TierRow({ tier }: { tier: Tier }) {
  const { setNodeRef, isOver } = useDroppable({ id: tier.id, data: { type: "container" } });
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const display = useBoard(s => s.display);
  const panel = exportPalette(style as never, mode as never).panel;
  const namesKey = useBoard(s => s.tiers.map(t => t.name).join("|"));
  const [editing, setEditing] = useState(false);

  // 经典梗图风格：扁平纯色块 + 黑色粗体标签（无渐变、无阴影），保留"彩色色块+黑色大字"的梗图结构
  const isTierStyle = style === "tier";
  // 显示设置：labelFlat 开启时也使用实体色（纯色）
  const labelFlat = isTierStyle || display.labelFlat;
  const labelColor = labelFlat ? "#141414" : labelTextColor(tier.color);
  const labelBg = labelFlat ? tier.color : `linear-gradient(160deg, ${lighten(tier.color)}, ${tier.color})`;

  // 项目拖入该档位时，标签重放一次动效（拖入 → 标签 pop 反馈）
  const prevCount = useRef(tier.items.length);
  const [replayKey, setReplayKey] = useState(0);
  useEffect(() => {
    if (tier.items.length > prevCount.current) setReplayKey(k => k + 1);
    prevCount.current = tier.items.length;
  }, [tier.items.length]);

  const names = namesKey.split("|");

  return (
    <div
      className={cn(
        "group flex items-stretch overflow-hidden rounded-2xl border border-line bg-panel",
        isTierStyle || display.labelFlat ? "shadow-none" : "shadow-[0_2px_12px_rgba(16,24,40,.06)]",
      )}
    >
      {/* 左侧档位标签：纯文字大字，点击打开档位编辑 */}
      <button
        onClick={() => setEditing(true)}
        title="点击编辑档位"
        className={cn(
          "flex w-[104px] shrink-0 cursor-pointer items-center justify-center px-2 py-4 text-center transition-[filter] md:w-[176px] md:py-5",
          !isTierStyle && "hover:brightness-105",
          isOver && "brightness-110",
        )}
        style={{
          background: labelBg,
          color: labelColor,
        }}
      >
        <TierLabel
          key={replayKey}
          name={tier.name}
          display={display}
          names={names}
          replayKey={replayKey}
          sizeClass="text-2xl font-black tracking-wide md:text-[32px]"
        />
      </button>

      {/* 条目区（droppable） */}
      <div
        ref={setNodeRef}
        className="relative flex min-h-[88px] flex-1 flex-wrap content-start items-start gap-2.5 p-3.5 pr-12"
        style={{
          background: mixColors(tier.color, panel, 0.08),
          outline: isOver ? `2px dashed ${tier.color}` : undefined,
          outlineOffset: -5,
        }}
      >
        <SortableContext items={tier.items.map(i => i.id)} strategy={horizontalListSortingStrategy}>
          {tier.items.map(item => (
            <ItemChip key={item.id} item={item} />
          ))}
        </SortableContext>

        {/* 快捷工具条：2×2，收在行内 */}
        <div className="absolute right-2 top-2 z-10 grid grid-cols-[26px_26px] gap-1 rounded-[9px] border border-line bg-panel/90 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            title="上移档位"
            onClick={() => useBoard.getState().moveTier(tier.id, -1)}
            className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[7px] text-muted hover:bg-black/5"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            title="档位颜色（更多设置点左侧档位名）"
            onClick={() => setEditing(true)}
            className="h-[26px] w-[26px] cursor-pointer rounded-[7px] p-1 hover:bg-black/5"
          >
            <span className="block h-full w-full rounded-full" style={{ background: tier.color }} />
          </button>
          <button
            title="下移档位"
            onClick={() => useBoard.getState().moveTier(tier.id, 1)}
            className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[7px] text-muted hover:bg-black/5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            title="删除档位（项目移回项目库）"
            onClick={() => {
              useBoard.getState().deleteTier(tier.id);
              toast("档位已删除，项目移回项目库");
            }}
            className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[7px] text-muted hover:bg-danger/15 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <TierEditDialog tier={editing ? tier : null} onClose={() => setEditing(false)} />
    </div>
  );
}

/** 只读行（预览 / 分享落地页） */
export function TierRowReadonly({
  tier,
  panel,
  display,
  names,
}: {
  tier: Tier;
  panel: string;
  display: DisplaySettings;
  names: string[];
}) {
  const style = useBoard(s => s.style);
  const isTierStyle = style === "tier";
  const labelFlat = isTierStyle || display.labelFlat;
  const labelColor = labelFlat ? "#141414" : labelTextColor(tier.color);
  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-2xl border border-line bg-panel",
        labelFlat ? "shadow-none" : "shadow-[0_2px_12px_rgba(16,24,40,.06)]",
      )}
    >
      <div
        className="flex w-[104px] shrink-0 items-center justify-center px-2 py-4 text-center md:w-[168px]"
        style={{
          background: labelFlat ? tier.color : `linear-gradient(160deg, ${lighten(tier.color)}, ${tier.color})`,
          color: labelColor,
        }}
      >
        <span className="text-2xl font-black leading-none tracking-wide md:text-[30px]">
          <TierLabel name={tier.name} display={display} names={names} replayKey={0} />
        </span>
      </div>
      <div
        className="flex min-h-[72px] flex-1 flex-wrap content-start items-start gap-2.5 p-3.5"
        style={{ background: mixColors(tier.color, panel, 0.08) }}
      >
        {tier.items.length === 0 && <span className="self-center text-[13px] text-ink/25">空</span>}
        {tier.items.map(item => {
          const showImg = display.showImages && item.image;
          const showName = display.showNames || !showImg; // 避免出现完全空白的卡片
          if (!showImg && !showName) return null;
          const tiltRot = display.tiltImages && item.image ? `rotate(${itemAngle(item, display)}deg)` : undefined;
          return (
            <span
              key={item.id}
              title={item.desc || item.name}
              className="inline-flex max-w-[260px] items-center gap-2 truncate rounded-xl border border-chipline bg-chip px-3 py-1.5 text-chipink shadow-[0_1px_3px_rgba(16,24,40,.08)]"
              style={{
                fontFamily: display.cardFont || undefined,
                fontSize: display.cardFontSize,
                fontWeight: display.cardFontWeight,
                paddingRight: showName ? undefined : 12,
                transform: tiltRot,
              }}
            >
              {showImg && (
                <img
                  src={item.image}
                  alt=""
                  className="shrink-0 rounded-lg object-cover"
                  style={{ width: display.cardImageSize, height: display.cardImageSize }}
                />
              )}
              {showName && <span className="truncate">{item.name}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
