import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { Download, Eye, Library, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import type { Board, Snapshot } from "../types";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialog";
import { normalizeBoard, timestamp } from "../lib/utils";

export function MinePage() {
  const navigate = useNavigate();
  const snapshots = useBoard(s => s.snapshots);
  // 恢复会直接覆盖当前榜单，先让用户确认一次
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  /** 当前编辑器里的榜单：与分享链接 / JSON 导出同一份数据形状 */
  function currentBoard(): Board {
    const s = useBoard.getState();
    return {
      title: s.title,
      subtitle: s.subtitle,
      style: s.style,
      mode: s.mode,
      presetId: s.presetId,
      tiers: s.tiers,
      pool: s.pool,
    };
  }

  function exportJson() {
    const board = currentBoard();
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hangla-board-${timestamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 立刻 revoke 在部分浏览器会取消下载，留一点缓冲
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出榜单 JSON");
  }

  async function importJson(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast("导入失败：读取文件失败", 4000);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast("导入失败：文件不是合法的 JSON", 4000);
      return;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { tiers?: unknown }).tiers)) {
      toast("导入失败：这不是榜单 JSON（缺少 tiers 数组）", 4000);
      return;
    }
    const board = normalizeBoard(parsed);
    if (board.tiers.length === 0) {
      toast("导入失败：榜单里没有任何有效档位", 4000);
      return;
    }
    // 借道编辑器状态把导入的榜单存成快照，再还原编辑器：
    // 导入只进「我的排名」（可预览 / 手动恢复），不会悄悄覆盖正在编辑的榜单
    const store = useBoard.getState();
    const prev = currentBoard();
    store.importBoard(board);
    store.saveSnapshot();
    // 直接写回旧状态而不是再走 importBoard：normalizeBoard 会套用体量上限，
    // 编辑器里已有的超限数据（如手动加了三十多个档位）不该因为一次导入被截断
    useBoard.setState(prev);
    toast(`已导入「${board.title || "未命名榜单"}」并保存为快照`, 3500);
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 先清空 value，同一个文件才能连续导入第二次
    e.target.value = "";
    if (file) void importJson(file);
  }

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10">
      <div className="mb-8 text-center">
        <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold">
          <Library className="size-6 text-accent" /> 我的排名
        </h1>
        <p className="mt-2 text-sm text-muted">
          保存的榜单快照（本机浏览器，最多保留 30 份）。导出的 JSON 可备份 / 迁移，导入后存为快照。分享出去的链接不受这里影响。
        </p>
      </div>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            useBoard.getState().saveSnapshot();
            toast("已保存当前榜单快照");
          }}
        >
          <Save /> 保存快照
        </Button>
        <Button onClick={exportJson}>
          <Download /> 导出 JSON
        </Button>
        <Button onClick={() => importRef.current?.click()}>
          <Upload /> 导入 JSON
        </Button>
      </div>
      <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={onPickFile} />

      {snapshots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
          还没有快照——在编辑器点上面的「保存快照」把当前榜单存一份。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {snapshots.map(snap => {
            const items = snap.board.tiers.reduce((a, t) => a + t.items.length, 0);
            return (
              <div key={snap.id} className="rounded-2xl border border-line bg-panel p-4 shadow-[0_4px_16px_rgba(0,0,0,.2)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{snap.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(snap.savedAt).toLocaleString("zh-CN")} · {snap.board.tiers.length} 档 · {items} 个条目
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => navigate("/preview?snap=" + snap.id)}>
                    <Eye /> 预览
                  </Button>
                  <Button size="sm" onClick={() => setPendingRestore(snap)}>
                    <RotateCcw /> 恢复到编辑器
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      useBoard.getState().deleteSnapshot(snap.id);
                      toast("快照已删除");
                    }}
                  >
                    <Trash2 /> 删除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={open => !open && setPendingRestore(null)}
        title={`恢复到「${pendingRestore?.title ?? ""}」？`}
        description="当前编辑器里的榜单会被这份快照覆盖（快照本身不受影响）。"
        confirmText="恢复"
        onConfirm={() => {
          if (!pendingRestore) return;
          useBoard.getState().loadSnapshot(pendingRestore.id);
          toast("已恢复到编辑器");
          navigate("/");
        }}
      />
    </div>
  );
}
