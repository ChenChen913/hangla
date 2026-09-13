import type { Item } from "../types";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { IMAGE_MAX_BYTES, encodeImage, readFileAsDataURL, uid } from "./utils";

/** 单张图片：读文件 → 按内容挑格式重编码（照片走 JPEG，透明插画走 PNG） */
export async function fileToImageItem(file: File): Promise<Item | null> {
  try {
    const raw = await readFileAsDataURL(file);
    return { id: uid(), name: file.name.replace(/\.[a-z0-9]+$/i, "") || "图片", image: await encodeImage(raw) };
  } catch {
    return null; // 单张失败不影响同一批里的其他图片
  }
}

/** 读取图片文件（重编码后）作为图片项目加入项目库 */
export async function addImageFilesToPool(files: FileList | File[] | null, toTierId?: string) {
  const all = [...(files ?? [])].filter(f => f.type.startsWith("image/"));
  if (!all.length) return;

  const tooBig = all.filter(f => f.size > IMAGE_MAX_BYTES);
  if (tooBig.length) {
    toast(`${tooBig.length} 张图片超过 ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB 已跳过（${tooBig[0].name}…）`, 3600);
  }
  const usable = all.filter(f => f.size <= IMAGE_MAX_BYTES);
  if (!usable.length) return;

  toast(usable.length > 1 ? `正在处理 ${usable.length} 张图片…` : "正在处理图片…", 1200);
  const items: Item[] = [];
  for (const f of usable) {
    const item = await fileToImageItem(f);
    if (item) items.push(item);
  }
  if (!items.length) {
    toast("图片读取失败，换一张试试", 3600);
    return;
  }
  useBoard.getState().addImagesToPool(items, toTierId);
  toast(toTierId ? `${items.length} 张图片已放进这个档位` : `${items.length} 张图片已加入项目库，拖进档位即可`);
}
