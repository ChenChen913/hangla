import type { Board } from "../types";
import { probeStorage } from "./storage";
import { STORAGE_KEY, useBoard } from "../store/board";

/** v2（vanilla 版）留下的存档键 */
export const LEGACY_V2_KEY = "hangla.state.v2";

/**
 * v2 存档迁移：hangla.state.v2 → 当前存档。
 *
 * 以前这段逻辑直接写在 main.tsx 的模块顶层，并且裸调 localStorage：
 * 隐私模式 / 禁用站点数据时访问会抛 SecurityError，React 根本挂载不上，整页白屏。
 * 现在存储访问统一走 probeStorage 的探测结果，任何一步失败都只是"没有旧档可迁"，
 * 绝不阻断启动。
 *
 * @returns 是否真的迁移了数据（供测试与日志使用）
 */
export function migrateLegacyBoard(): boolean {
  try {
    // 探测时把旧档键也算作"已有数据"：配额已满但旧档读得出来的情况下，
    // 仍然应该用 localStorage 而不是内存后端，否则旧档会被判成不存在
    const { backend } = probeStorage([STORAGE_KEY, LEGACY_V2_KEY]);
    // 当前版本已有存档：绝不覆盖
    if (backend.getItem(STORAGE_KEY)) return false;
    const legacy = backend.getItem(LEGACY_V2_KEY);
    if (!legacy) return false;
    const parsed = JSON.parse(legacy) as Record<string, unknown> | null;
    if (!parsed || !Array.isArray(parsed.tiers)) return false;
    // 旧档字段不可信，importBoard 内部会走 normalizeBoard 逐项校验
    useBoard.getState().importBoard({
      ...parsed,
      presetId: (parsed.presetId as string) ?? "custom",
    } as Partial<Board>);
    return true;
  } catch {
    // 旧档损坏 / 存储不可读：忽略即可，应用继续用默认榜单启动
    return false;
  }
}
