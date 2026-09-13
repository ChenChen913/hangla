import type { Item } from "../types";
import { useBoard } from "../store/board";
import { toast } from "../store/toast";
import { downscaleImage, readFileAsDataURL, uid } from "./utils";

/** 读取图片文件（压缩后）作为图片项目加入项目库 */
export async function addImageFilesToPool(files: FileList | File[] | null) {
  const imgs = [...(files ?? [])].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  const items: Item[] = [];
  for (const f of imgs) {
    const raw = await readFileAsDataURL(f);
    items.push({ id: uid(), name: f.name.replace(/\.[a-z0-9]+$/i, "") || "图片", image: await downscaleImage(raw) });
  }
  useBoard.getState().addImagesToPool(items);
  toast("图片已加入项目库，拖进档位即可");
}
