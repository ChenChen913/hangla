import { useEffect, useRef } from "react";
import { useBoard } from "../store/board";
import { BOARD_LIMITS } from "../lib/utils";

/**
 * 主标题（可编辑）。副标题与统计说明已移到页面底部，避免喧宾夺主。
 *
 * 用自适应高度的 textarea 而不是 input：手机上 input 是单行滚动，
 * 长标题（示例榜就有 20 个字）在 320px 上只能看到一半，看起来像被裁掉了。
 * textarea 会按内容换行、自动长高，桌面端也因此更完整。
 * 换行被替换成空格，标题始终是"一行逻辑文本"，分享 / 导出不受影响。
 */
export function TitleBlock() {
  const title = useBoard(s => s.title);
  const setTitle = useBoard(s => s.setTitle);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [title]);

  return (
    <div className="mb-5 text-center md:mb-6">
      <textarea
        ref={ref}
        rows={1}
        value={title}
        onChange={e => setTitle(e.target.value.replace(/[\r\n]+/g, " "))}
        onKeyDown={e => {
          // Enter 不换行：标题是单行语义，回车直接结束编辑（手机上同时收起键盘）
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="点此给榜单起个名字（如：2026 年国产 AI 排名）"
        maxLength={BOARD_LIMITS.title}
        aria-label="榜单标题"
        className="title-input min-h-11 w-full resize-none overflow-hidden rounded-xl border border-dashed border-transparent bg-transparent px-3.5 py-2 text-center text-[22px] font-extrabold leading-snug text-ink placeholder:text-muted/70 hover:border-line focus:border-accent focus:outline-none sm:text-[26px] md:min-h-0 md:text-3xl"
      />
    </div>
  );
}
