import type { Item } from "../types";
import { useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { toast } from "../store/toast";
import { BOARD_LIMITS, IMAGE_MAX_BYTES, encodeImage, readFileAsDataURL, truncateText, uid } from "./utils";

/**
 * 同时处理的图片数量。
 *
 * 串行（1）太慢：10 张照片要等十轮 decode + canvas；不设上限又会让 20 张大图
 * 同时解码，手机浏览器直接 OOM。3 是"解码内存 × 吞吐"的折中。
 */
const MAX_CONCURRENT = 3;

/** 有限并发执行，结果按原始下标回填，保证加入项目库的顺序与选择顺序一致 */
async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/** 单张图片：读文件 → 按内容挑格式重编码（照片走 JPEG，透明插画走 PNG） */
export async function fileToImageItem(file: File): Promise<Item | null> {
  try {
    const raw = await readFileAsDataURL(file);
    return {
      id: uid(),
      name: truncateText(file.name.replace(/\.[a-z0-9]+$/i, ""), BOARD_LIMITS.itemName) || "图片",
      image: await encodeImage(raw),
    };
  } catch {
    return null; // 单张失败不影响同一批里的其他图片
  }
}

/**
 * 读取图片文件（重编码后）作为图片项目加入项目库 / 指定档位。
 *
 * - 单张失败只影响它自己：读不出来、解码失败都返回 null，其余继续；
 * - 整批只写一次 store：避免 20 张图触发 20 次 persist（每次都要整份序列化 + 写盘）；
 * - 进度只更新一个内存态，不写 localStorage。
 */
export async function addImageFilesToPool(files: FileList | File[] | null, toTierId?: string) {
  const all = [...(files ?? [])].filter(f => f.type.startsWith("image/"));
  if (!all.length) return;

  const tooBig = all.filter(f => f.size > IMAGE_MAX_BYTES);
  if (tooBig.length) {
    toast(`${tooBig.length} 张图片超过 ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB 已跳过（${tooBig[0].name}…）`, 3600);
  }
  const usable = all.filter(f => f.size <= IMAGE_MAX_BYTES);
  if (!usable.length) return;

  if (usable.length > 1) useUi.getState().setImageProgress({ done: 0, total: usable.length });

  const results: (Item | null)[] = new Array(usable.length).fill(null);
  let done = 0;
  try {
    await runPool(usable, MAX_CONCURRENT, async (file, index) => {
      results[index] = await fileToImageItem(file);
      done += 1;
      if (usable.length > 1) useUi.getState().setImageProgress({ done, total: usable.length });
    });
  } finally {
    // 无论中途发生什么（包括未来有人在这里抛错）都要把进度条收掉
    useUi.getState().setImageProgress(null);
  }

  const items = results.filter((x): x is Item => x !== null);
  const failed = usable.length - items.length;
  if (!items.length) {
    toast("图片读取失败，换一张试试", 3600);
    return;
  }

  useBoard.getState().addImagesToPool(items, toTierId);
  const where = toTierId ? "这个档位" : "项目库，拖进档位即可";
  if (failed > 0) toast(`${items.length} 张图片已加入${where}，${failed} 张读取失败已跳过`, 4200);
  else toast(`${items.length} 张图片已加入${where}`);
}
