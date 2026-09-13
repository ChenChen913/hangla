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
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="text-sm font-bold">
          项目库 <span className="font-medium text-muted">（未排名 {pool.length ? `· ${pool.length}` : ""}）</span>
        </span>
        <span className="min-w-[180px] flex-1 text-xs text-muted">拖进上方档位即可排名 · 双击条目删除</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索项目…"
            className="h-8 w-36 rounded-[10px] border border-line bg-panel2 pl-8 pr-2 text-xs text-ink outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => openItemDialog()}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-panel px-2.5 text-xs font-medium text-ink hover:border-accent/60 hover:text-accent [&_svg]:size-3.5"
        >
          <Plus /> 添加项目
        </button>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[10px] border border-line bg-panel px-2.5 text-xs text-ink hover:border-accent/60 [&_svg]:size-3.5">
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

      <div
        ref={setNodeRef}
        className={
          "flex min-h-[64px] flex-wrap content-start items-start gap-2.5 rounded-[12px] border-[1.5px] border-dashed p-3 transition-colors " +
          (isOver ? "border-accent bg-accent/5" : "border-line bg-panel2/50")
        }
      >
        <SortableContext items={filtered.map(i => i.id)} strategy={horizontalListSortingStrategy}>
          {filtered.map(item => (
            <ItemChip key={item.id} item={item} />
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
        className="mt-3 w-full rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent"
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
