import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PencilLine } from "lucide-react";
import { decodeBoard } from "../lib/utils";
import { TIER_PRESETS } from "../lib/presets";
import { exportPalette } from "../lib/themes";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { TierRowReadonly } from "../components/TierRow";
import { Button } from "../components/ui/button";

/** 只读榜单渲染（/preview 展示当前榜单，/r/:data 展示分享链接） */
export function PreviewPage() {
  const { data } = useParams();
  const navigate = useNavigate();
  const storeTitle = useBoard(s => s.title);
  const storeSubtitle = useBoard(s => s.subtitle);
  const storeStyle = useBoard(s => s.style);
  const storeMode = useBoard(s => s.mode);
  const storePresetId = useBoard(s => s.presetId);
  const storeTiers = useBoard(s => s.tiers);
  const storePool = useBoard(s => s.pool);
  const storeDisplay = useBoard(s => s.display);
  const [copied, setCopied] = useState(false);

  const shared = data ? decodeBoard(data) : null;
  if (data && !shared) {
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

  const board = shared ?? {
    title: storeTitle,
    subtitle: storeSubtitle,
    style: storeStyle,
    mode: storeMode,
    presetId: storePresetId,
    tiers: storeTiers,
    pool: storePool,
  };
  const display = shared ? storeDisplay : storeDisplay; // 显示设置始终读本机偏好
  const pal = exportPalette(board.style as never, board.mode as never);
  const presetName = TIER_PRESETS[board.presetId]?.name ?? "TIER LIST";
  const items = board.tiers.reduce((a, t) => a + t.items.length, 0);

  function copyToEditor() {
    if (!shared) return;
    useBoard.getState().importBoard(shared);
    toast("已复制到编辑器，可以开始改了");
    setCopied(true);
    navigate("/");
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
          {board.tiers.length} 档 · {items} 个项目 · 只读{data ? "分享" : "展示"}视图
        </p>
      </div>

      <div className="flex flex-col" style={{ gap: storeDisplay.rowGap }}>
        {board.tiers.map(t => (
          <TierRowReadonly
            key={t.id}
            tier={t}
            panel={pal.panel}
            display={display}
            names={board.tiers.map(x => x.name)}
          />
        ))}
      </div>

      <div className="mt-10 flex justify-center gap-3">
        {shared ? (
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
    </div>
  );
}
