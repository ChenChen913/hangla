/**
 * 屏幕外导出画布的引用。
 * 编辑器挂载时写入，TopBar 的「导出 PNG」和分享弹窗按它截图。
 * 单独放一个模块，避免 components 反向 import pages（循环依赖方向也别扭）。
 */
export const exportBoardRef: { current: HTMLElement | null } = { current: null };
