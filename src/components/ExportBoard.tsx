import { exportPalette } from "../lib/themes";
import { itemAngle, labelTextColor, lighten, mixColors } from "../lib/utils";
import type { Board, DisplaySettings, Item } from "../types";
import { useBoard } from "../store/board";

/** 供 html-to-image 截图的固定宽度导出画布（挂在屏幕外）。
 *  只保留主标题 + 榜单主体 + 品牌页脚；副标题、统计、评级徽章等网页说明信息一律不上图 */
export function ExportBoardInner({ board, display }: { board: Board; display: DisplaySettings }) {
  const pal = exportPalette(board.style as never, board.mode as never);

  const chip = (item: Item) => {
    const showImg = display.showImages && item.image;
    const showName = display.showNames || !showImg; // 避免出现完全空白的卡片
    if (!showImg && !showName) return null;
    const tiltRot = display.tiltImages && item.image ? `rotate(${itemAngle(item, display)}deg)` : undefined;
    // 与编辑器条目卡完全一致的样式（p-1 pr-3 / px-3 py-2 / gap-2 / shadow / 圆角）
    return (
      <div
        key={item.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: pal.chipBg,
          border: `1px solid ${pal.chipBorder}`,
          color: pal.chipText,
          borderRadius: 12,
          fontFamily: display.cardFont || undefined,
          boxShadow: "0 1px 3px rgba(16,24,40,.08)",
          transform: tiltRot,
          // 右侧留白只在显示名称时需要，避免隐藏名称后图片右侧多出一条底色边
          padding: showImg ? (showName ? "4px 12px 4px 4px" : "4px") : "8px 12px",
        }}
      >
        {showImg && (
          <img
            src={item.image}
            alt=""
            style={{
              width: display.cardImageSize,
              height: display.cardImageSize,
              borderRadius: 10,
              objectFit: "cover",
            }}
          />
        )}
        {showName && (
          <span
            style={{
              fontSize: display.cardFontSize,
              fontWeight: display.cardFontWeight,
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        background: pal.pageBg,
        padding: 40,
        width: 1200,
        fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, color: pal.text, lineHeight: 1.2 }}>
          {board.title || "从夯到拉"}
        </h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: display.rowGap }}>
        {board.tiers.map(t => {
          const isTierStyle = board.style === "tier";
          const labelFlat = isTierStyle || display.labelFlat;
          const labelBg = labelFlat ? t.color : `linear-gradient(160deg, ${lighten(t.color)}, ${t.color})`;
          const labelColor = labelFlat ? "#141414" : labelTextColor(t.color);
          return (
          <div
            key={t.id}
            style={{
              display: "flex",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: labelFlat ? undefined : "0 2px 12px rgba(16,24,40,.06)",
            }}
          >
            <div
              style={{
                width: 190,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: labelBg,
                color: labelColor,
                padding: "12px",
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  lineHeight: 1.15,
                  letterSpacing: "0.02em",
                  fontFamily: display.labelFont === "artistic" ? '"Smiley Sans", "Microsoft YaHei", sans-serif' : undefined,
                  fontWeight: display.labelFont === "artistic" ? 400 : 900,
                }}
              >
                {t.name}
              </span>
            </div>
            <div
              style={{
                flex: 1,
                background: mixColors(t.color, pal.panel, 0.1),
                padding: 14,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "flex-start",
                minHeight: 88,
              }}
            >
              {board.tiers.find(x => x.id === t.id)!.items.map(chip)}
            </div>
          </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 26 }}>
        <span style={{ color: pal.muted, fontSize: 16 }}>{new Date().toLocaleDateString("zh-CN")}</span>
      </div>
    </div>
  );
}

/** 编辑器挂载的屏幕外导出节点（分享弹窗 / 导出 PNG 对它截图） */
export function ExportBoardMount() {
  const title = useBoard(s => s.title);
  const subtitle = useBoard(s => s.subtitle);
  const style = useBoard(s => s.style);
  const mode = useBoard(s => s.mode);
  const presetId = useBoard(s => s.presetId);
  const tiers = useBoard(s => s.tiers);
  const pool = useBoard(s => s.pool);
  const display = useBoard(s => s.display);
  return <ExportBoardInner board={{ title, subtitle, style, mode, presetId, tiers, pool }} display={display} />;
}
