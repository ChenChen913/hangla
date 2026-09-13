import { useNavigate } from "react-router";
import { Eye, Library, RotateCcw, Save, Trash2 } from "lucide-react";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { Button } from "../components/ui/button";
import { encodeBoard } from "../lib/utils";

export function MinePage() {
  const navigate = useNavigate();
  const snapshots = useBoard(s => s.snapshots);

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-10">
      <div className="mb-8 text-center">
        <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold">
          <Library className="size-6 text-accent" /> 我的排名
        </h1>
        <p className="mt-2 text-sm text-muted">保存的榜单快照（本机浏览器，最多保留 30 份）。分享出去的链接不受这里影响。</p>
      </div>

      <div className="mb-6 flex justify-center">
        <Button
          onClick={() => {
            useBoard.getState().saveSnapshot();
            toast("已保存当前榜单快照");
          }}
        >
          <Save /> 保存快照
        </Button>
      </div>

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
                  <Button
                    size="sm"
                    onClick={() => navigate("/r/" + encodeBoard(snap.board))}
                  >
                    <Eye /> 预览
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      useBoard.getState().loadSnapshot(snap.id);
                      toast("已恢复到编辑器");
                      navigate("/");
                    }}
                  >
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
    </div>
  );
}
