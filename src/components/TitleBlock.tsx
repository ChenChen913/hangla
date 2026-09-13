import { useBoard } from "../store/board";

/** 主标题（可编辑）。副标题与统计说明已移到页面底部，避免喧宾夺主 */
export function TitleBlock() {
  const title = useBoard(s => s.title);
  const setTitle = useBoard(s => s.setTitle);

  return (
    <div className="mb-6 text-center">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="点此给榜单起个名字（如：2026 年国产 AI 排名）"
        maxLength={60}
        className="w-full rounded-xl border border-dashed border-transparent bg-transparent px-3.5 py-2 text-center text-[26px] font-extrabold text-ink placeholder:text-muted/70 hover:border-line focus:border-accent focus:outline-none md:text-3xl"
      />
    </div>
  );
}
