import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps, FocusEvent } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * 输入框获得焦点后，等软键盘动画结束再把它滚进可视区。
 * 手机上弹窗变成底部抽屉（见 index.css），键盘会遮住下半屏；
 * 不做这一步时，描述/名称输入框在 iOS 上可能正好被键盘压住。
 */
function keepFieldVisible(e: FocusEvent<HTMLDivElement>) {
  const el = e.target as HTMLElement;
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
  window.setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 260);
}

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dlg-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          // 桌面：居中卡片，内容超高时内部滚动；手机：CSS 把它变成底部抽屉
          "dlg-content fixed inset-0 z-50 mx-auto my-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(92vw,420px)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-5 shadow-2xl focus:outline-none",
          className,
        )}
        onFocusCapture={keepFieldVisible}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-base font-bold text-ink", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1.5 text-[13px] leading-relaxed text-muted", className)} {...props} />;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确定",
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm(): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
