import type { Mode, StyleId } from "./lib/themes";

/** 项目条目：名称必填，图片/一句话描述可选 */
export type Item = {
  id: string;
  name: string;
  desc?: string;
  /** 内联图片（data:image/…）；不允许外链，避免打开分享链接时请求第三方地址 */
  image?: string;
  /** 单独设置的歪斜角度（度）；未设置时跟随全局随机角度 */
  tilt?: number;
};

/** 档位：只有名称和颜色，标签保持纯文字大字 */
export type Tier = {
  id: string;
  name: string;
  color: string;
  items: Item[];
};

/** 等级标签字体模式：standard = 系统字体，artistic = 得意黑艺术字体 */
export type LabelFontMode = "standard" | "artistic";
/** 等级标签动效强度 */
export type LabelAnimMode = "off" | "subtle" | "standard" | "strong";

/** 显示设置：只影响呈现（编辑器/预览/导出一致），不进分享数据 */
export type DisplaySettings = {
  showImages: boolean;   // 是否显示项目图片
  showNames: boolean;    // 是否显示项目名称
  tiltImages: boolean;   // 图片歪着放总开关
  tiltMax: number;       // 全局最大歪斜角度（度），每张图在 ±范围内随机
  cardFont: string;      // 标签字体（CSS font-family，空 = 默认字体栈）
  cardFontSize: number;  // 标签文字大小（px）
  cardFontWeight: number; // 标签文字粗细（300/400/500/700/900）
  cardImageSize: number; // 标签图片大小（px）
  labelFont: LabelFontMode; // 等级标签字体模式
  labelAnim: LabelAnimMode; // 等级标签动效强度
  labelFlat: boolean;    // 档位标签纯色（实体色）；false = 渐变
  rowGap: number;        // 档位行之间的间距（px）
};

export type Board = {
  title: string;
  subtitle?: string;
  style: StyleId; // 视觉风格（classic / tier / hype / neon）
  mode: Mode;     // 日夜（day / night）
  presetId: string;
  tiers: Tier[];
  pool: Item[];
};

export type Snapshot = {
  id: string;
  title: string;
  savedAt: number;
  board: Board;
};
