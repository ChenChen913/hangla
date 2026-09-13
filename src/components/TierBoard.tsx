import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { motion } from "motion/react";
import type { Item } from "../types";
import { useBoard } from "../store/board";
import { TierRow } from "./TierRow";
import { Pool } from "./Pool";
import { ItemChip } from "./ItemChip";

function findContainer(id: unknown): string | null {
  const s = useBoard.getState();
  const key = String(id);
  if (key === "pool") return "pool";
  if (s.tiers.some(t => t.id === key)) return key;
  const tier = s.tiers.find(t => t.items.some(i => i.id === key));
  if (tier) return tier.id;
  if (s.pool.some(i => i.id === key)) return "pool";
  return null;
}

function findItem(id: unknown): Item | null {
  const s = useBoard.getState();
  const key = String(id);
  for (const t of s.tiers) {
    const hit = t.items.find(i => i.id === key);
    if (hit) return hit;
  }
  return s.pool.find(i => i.id === key) ?? null;
}

export function TierBoard() {
  const tiers = useBoard(s => s.tiers);
  const rowGap = useBoard(s => s.display.rowGap);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // 碰撞检测：指针落在哪个容器就算哪个（最可预测），
  // 指针悬空时回退到矩形相交（拖到容器边缘也能吸附）
  const collisionDetection: CollisionDetection = args => {
    const byPointer = pointerWithin(args);
    if (byPointer.length) return byPointer;
    return rectIntersection(args);
  };

  function moveInto(activeId: string, overId: unknown, to: string) {
    const s = useBoard.getState();
    const targetItems = to === "pool" ? s.pool : s.tiers.find(t => t.id === to)!.items;
    let index = targetItems.length;
    if (String(overId) !== to) {
      const i = targetItems.findIndex(it => it.id === overId);
      if (i >= 0) index = i;
    }
    s.moveItem(activeId, to === "pool" ? null : to, index);
  }

  // 跨容器：拖经其他档位/素材池时实时移动（dnd-kit 多容器标准做法）
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to) return;
    moveInto(String(active.id), over.id, to);
  }

  // 收尾：同容器内排序；跨容器兜底（防止 over 变化未被 onDragOver 捕获）
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveItem(null);
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to) return;

    if (from === to) {
      if (active.id === over.id) return;
      const s = useBoard.getState();
      const list = from === "pool" ? s.pool : s.tiers.find(t => t.id === from)!.items;
      const newIndex =
        String(over.id) === from ? list.length - 1 : Math.max(0, list.findIndex(i => i.id === over.id));
      s.moveItem(String(active.id), from === "pool" ? null : from, newIndex);
    } else {
      moveInto(String(active.id), over.id, to);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e: DragStartEvent) => setActiveItem(findItem(e.active.id))}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      <div className="flex flex-col" style={{ gap: rowGap }}>
        {tiers.map(tier => (
          <TierRow key={tier.id} tier={tier} />
        ))}
      </div>
      <Pool />

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.9,.3,1)" }}>
        {activeItem ? (
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1.04 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
            <ItemChip item={activeItem} overlay />
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
