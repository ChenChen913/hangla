import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getStorageMode } from "../lib/storage";

/**
 * 存储降级横幅。
 *
 * localStorage 不可用（隐私模式 / 禁用站点数据 / 配额为 0）时，应用会退回内存实现，
 * 一切操作看起来都正常——直到用户刷新。这条横幅是唯一能提前说清"这次不会保存"的地方，
 * 所以它必须常驻、明确，而不是一条几秒后消失的 toast。
 *
 * 模式在会话内不会变（探测发生在 store 创建时），用 useState 固定住避免每次 render 都写探针。
 */
export function StorageNotice() {
  const [mode] = useState(getStorageMode);
  if (mode === "persistent") return null;

  return (
    <div
      role="status"
      className="flex items-start justify-center gap-2 border-b border-line bg-danger/10 px-4 py-2 text-[12.5px] leading-relaxed text-ink"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <p className="max-w-[900px]">
        当前浏览器不允许写入本地存储（隐私模式或站点数据被禁用）——
        <strong className="font-semibold">这次的修改只存在内存里，刷新页面后会丢失</strong>。
        重要内容请先用「导出 PNG」或「导出 JSON」留底。
      </p>
    </div>
  );
}
