import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { PencilLine } from "lucide-react";
import type { Board } from "../types";
import { decodeBoard } from "../lib/utils";
import { TIER_PRESETS } from "../lib/presets";
import { applyTheme, exportPalette } from "../lib/themes";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { TierRowReadonly } from "../components/TierRow";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialog";

/** 只读榜单渲染：/preview 展示当前榜单，/preview?snap=id 展示快照，/r/:data 展示分享链接 */
export function PreviewPage() {
  const { data } = useParams();
  const [searchParams] = useSearchParams();
  const snapId = searchParams.get("snap");
  const navigate = useNavigate();
  const snapshots = useBoard(s => s.snapshots);
  const storeTitle = useBoard(s => s.title);
  const storeSubtitle = useBoard(s => s.subtitle);
  const storeStyle = useBoard(s => s.style);
  const storeMode = useBoard(s => s.mode);
  const storePresetId = useBoard(s => s.presetId);
  const storeTiers = useBoard(s => s.tiers);
  const storePool = useBoard(s => s.pool);
  const display = useBoard(s => s.display);
  const [copied, setCopied] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  // 分享链接数据只解码一次：data 不变就不重复 atob + JSON.parse（图片多时解码很贵）
  const shared = useMemo(() => (!snapId && data ? decodeBoard(data) : null), [snapId, data]);
  // 快照预览走内存里的 snapshots，不再把整份榜单 encode 进 URL
  const snap = useMemo(
    () => (snapId ? snapshots.find(s => s.id === snapId) ?? null : null),
    [snapId, snapshots],
  );
  const snapBoard = snap?.board;

  const viewStyle = snapBoard?.style ?? shared?.style;
  const viewMode = snapBoard?.mode ?? shared?.mode;

  // 分享链接 / 快照要按"分享者那套主题"渲染，而不是打开者本机的主题；
  // 离开这个页面再还原成本机主题
  useEffect(() => {
    if (!viewStyle || !viewMode) return;
    applyTheme(viewStyle, viewMode);
    return () => applyTheme(storeStyle, storeMode);
  }, [viewStyle, viewMode, storeStyle, storeMode]);

  if (snapId && !snap) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-24 text-center">
        <p className="text-lg font-bold">快照不存在或已被删除</p>
        <p className="mt-2 text-sm text-muted">这份快照可能已在「我的排名」里被删除，请回列表重新选择。</p>
        <Button className="mt-6" onClick={() => navigate("/mine")}>
          回到我的排名
        </Button>
      </div>
    );
  }

  if (!snapId && data && !shared) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-24 text-center">
        <p className="text-lg font-bold">分享链接无效或已损坏</p>
        <p className="mt-2 text-sm text-muted">链接里的榜单数据解析失败，请让分享者重新生成。</p>
        <Button className="mt-6" onClick={() => navigate("/")}>
          回到编辑器
        </Button>
      </div>
    );
  }

  const board: Board = snapBoard ?? shared ?? {
    title: storeTitle,
    subtitle: storeSubtitle,
    style: storeStyle,
    mode: storeMode,
    presetId: storePresetId,
    tiers: storeTiers,
    pool: storePool,
  };
  const pal = exportPalette(board.style, board.mode);
  const presetName = TIER_PRESETS[board.presetId]?.name ?? "TIER LIST";
  const items = board.tiers.reduce((a, t) => a + t.items.length, 0);

  function applyShared() {
    if (!shared) return;
    useBoard.getState().importBoard(shared);
    toast("已复制到编辑器，可以开始改了");
    setCopied(true);
    navigate("/");
  }

  function copyToEditor() {
    if (!shared) return;
    // 当前编辑器有内容时先自动备份，再让用户确认覆盖，避免误点丢榜单
    const hasContent = storeTiers.some(t => t.items.length > 0) || storePool.length > 0;
    if (!hasContent) {
      applyShared();
      return;
    }
    useBoard.getState().saveSnapshot();
    setOverwriteOpen(true);
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-12 md:px-5">
      <div className="mb-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h1 className="text-3xl font-extrabold md:text-4xl">{board.title || "从夯到拉"}</h1>
          <span className="rounded-full bg-gradient-to-br from-accent2 to-accent px-4 py-1 text-sm font-bold text-white shadow-[0_2px_12px_rgba(255,106,61,.35)]">
            {presetName}
          </span>
        </div>
        {board.subtitle && <p className="mt-2 text-sm text-muted">{board.subtitle}</p>}
        <p className="mt-1.5 text-[12.5px] text-muted">
          {board.tiers.length} 档 · {items} 个项目 · 只读{snap ? "快照" : data ? "分享" : "展示"}视图
        </p>
      </div>

      <div className="flex flex-col" style={{ gap: display.rowGap }}>
        {board.tiers.map(t => (
          <TierRowReadonly key={t.id} tier={t} style={board.style} panel={pal.panel} display={display} />
        ))}
      </div>

      <div className="mt-10 flex justify-center gap-3">
        {snap ? (
          <>
            <Button variant="primary" onClick={() => navigate("/mine")}>
              返回我的排名
            </Button>
            <Button onClick={() => navigate("/")}>回到编辑器</Button>
          </>
        ) : shared ? (
          <>
            <Button variant="primary" disabled={copied} onClick={copyToEditor}>
              <PencilLine /> 复制一份来编辑
            </Button>
            <Button onClick={() => navigate("/")}>回到编辑器</Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => navigate("/")}>
              <PencilLine /> 返回编辑
            </Button>
            <Button onClick={() => navigate("/mine")}>我的排名</Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={overwriteOpen}
        onOpenChange={setOverwriteOpen}
        title="覆盖当前编辑器里的榜单？"
        description="将用分享的榜单覆盖当前编辑器内容，当前榜单已自动保存到「我的排名」。"
        confirmText="覆盖并编辑"
        onConfirm={applyShared}
      />
    </div>
  );
}
