import { useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { Download, Eye, Library, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import type { Board, Snapshot } from "../types";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialog";
import { BOARD_LIMITS, timestamp } from "../lib/utils";
import { currentSaveChannel, downloadBlob, shareBlob } from "../lib/saveImage";

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
    const filename = `hangla-board-${timestamp()}.json`;
    // 与 PNG 导出同一套平台判断：iOS 的 a[download] 不可靠，改走系统分享（存到「文件」）
    if (currentSaveChannel() === "download") {
      downloadBlob(blob, filename);
      toast("已导出榜单 JSON");
      return;
    }
    void shareBlob(blob, filename, "榜单 JSON").then(result => {
      if (result === "shared") {
        toast("已打开系统分享，存到「文件」即可");
        return;
      }
      if (result === "cancelled") return;
      // 内置浏览器没有系统分享：再试一次下载，成不成至少给了明确反馈
      downloadBlob(blob, filename);
      toast("已开始下载，去「文件 / 下载」里看看", 4000);
    });
  }

  async function importJson(file: File) {
    // 先看体积再读内容：一个 500MB 的 .json 被 file.text() 读进来，主线程会直接卡死。
    // 正常榜单（含几十张图）也只有几 MB，8MB 足够宽松。
    if (file.size > BOARD_LIMITS.importBytes) {
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
      toast(`导入失败：文件 ${mb(file.size)}MB，超过 ${mb(BOARD_LIMITS.importBytes)}MB 上限`, 4500);
      return;
    }
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
    // 只存快照，不碰编辑器：失败不会覆盖任何东西，成功也不会改写正在编辑的榜单，
    // 更不会在撤销栈里留下两条"导入→还原"的假历史
    try {
      const result = useBoard.getState().importBoardAsSnapshot(parsed);
      if (!result.ok) {
        toast(`导入失败：${result.reason}`, 4000);
        return;
      }
      toast(`已导入「${result.title}」并保存为快照`, 3500);
    } catch {
      toast("导入失败：数据无法解析成榜单", 4000);
    }
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 先清空 value，同一个文件才能连续导入第二次
    e.target.value = "";
    if (file) void importJson(file);
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-16 pt-6 md:px-5 md:pb-20 md:pt-10">
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
        description={
          pendingRestore?.display
            ? "当前编辑器里的榜单会被这份快照覆盖，快照里保存的显示设置（字号、图片显隐、歪斜等）也会一并恢复（快照本身不受影响）。"
            : "当前编辑器里的榜单会被这份快照覆盖（快照本身不受影响）；这份旧快照没有保存显示设置，本机显示设置保持不变。"
        }
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
