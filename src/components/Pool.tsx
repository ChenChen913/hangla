import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ImagePlus, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { addImageFilesToPool } from "../lib/images";
import { uid } from "../lib/utils";
import { ItemChip } from "./ItemChip";

/** 项目库（未排名）：搜索、添加项目、快速文字回车、图片批量入池 */
export function Pool() {
  const pool = useBoard(s => s.pool);
  const { setNodeRef, isOver } = useDroppable({ id: "pool", data: { type: "container" } });
  const openItemDialog = useUi(s => s.openItemDialog);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(i => i.name.toLowerCase().includes(q) || (i.desc ?? "").toLowerCase().includes(q));
  }, [pool, query]);

  return (
    <section className="mt-6 rounded-2xl border border-line bg-panel/80 p-4">
      {/* 手机上分两行：标题 + 操作按钮；搜索独占一行。≥sm 再合回一行，避免 320px 把输入框挤没 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">
          项目库 <span className="font-medium text-muted">（未排名 {pool.length ? `· ${pool.length}` : ""}）</span>
        </span>
        <span className="hidden min-w-0 flex-1 text-xs text-muted md:block">
          拖进上方档位即可排名 · 悬停条目可编辑
        </span>

        <div className="order-last flex w-full items-center gap-2 md:order-none md:ml-auto md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-36 md:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索项目…"
              aria-label="搜索项目"
              className="h-11 w-full rounded-[10px] border border-line bg-panel2 pl-8 pr-2 text-xs text-ink outline-none focus:border-accent md:h-8"
            />
          </div>
          <button
            onClick={() => openItemDialog()}
            className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-panel px-2.5 text-xs font-medium text-ink hover:border-accent/60 hover:text-accent md:h-8 [&_svg]:size-3.5"
          >
            <Plus /> 添加项目
          </button>
          <label className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-panel px-2.5 text-xs text-ink hover:border-accent/60 md:h-8 [&_svg]:size-3.5">
            <ImagePlus /> 图片
            <input
              hidden
              type="file"
              accept="image/*"
              multiple
              onChange={e => {
                addImageFilesToPool(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="w-full text-[11px] leading-snug text-muted md:hidden">
          拖进上方档位即可排名 · 点条目可编辑（长按后拖动）
        </p>
      </div>

      <div
        ref={setNodeRef}
        className={
          "flex min-h-[64px] flex-wrap content-start items-start gap-2.5 rounded-[12px] border-[1.5px] border-dashed p-3 transition-colors " +
          (isOver ? "border-accent bg-accent/5" : "border-line bg-panel2/50")
        }
      >
        <SortableContext items={filtered.map(i => i.id)} strategy={horizontalListSortingStrategy}>
          {filtered.map(item => (
            <ItemChip key={item.id} item={item} allowDoubleClickDelete />
          ))}
        </SortableContext>
        {pool.length === 0 && (
          <span className="text-[13px] text-muted">
            项目库空了——点「添加项目」或输入名称回车，也可以直接粘贴 / 拖入图片
          </span>
        )}
        {pool.length > 0 && filtered.length === 0 && (
          <span className="text-[13px] text-muted">没有匹配「{query}」的项目</span>
        )}
      </div>

      <input
        className="mt-3 min-h-11 w-full rounded-[10px] border border-line bg-panel2 px-3 py-3 text-[16px] text-ink outline-none focus:border-accent md:py-2.5 md:text-[13.5px]"
        placeholder="快速添加：输入名称回车（比如：豆包）"
        onKeyDown={e => {
          if (e.key !== "Enter") return;
          const v = e.currentTarget.value.trim();
          if (!v) return;
          useBoard.getState().addItemToPool({ id: uid(), name: v });
          e.currentTarget.value = "";
        }}
      />
    </section>
  );
}
