import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-[13.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-line bg-panel text-ink hover:border-accent/60",
        primary:
          "border border-transparent bg-gradient-to-br from-accent2 to-accent font-semibold text-[#241304] shadow-[0_2px_14px_rgba(255,122,69,.3)] hover:brightness-105",
        ghost: "border border-transparent text-muted hover:bg-panel2 hover:text-ink",
        danger: "border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
