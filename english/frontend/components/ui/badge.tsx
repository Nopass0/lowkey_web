import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border border-input",
        gradient: "border-transparent bg-gradient-to-r from-red-500 to-blue-500 text-white",
        new: "border-transparent bg-blue-500/20 text-blue-400 border border-blue-500/30",
        learning: "border-transparent bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
        review: "border-transparent bg-purple-500/20 text-purple-400 border border-purple-500/30",
        mastered: "border-transparent bg-green-500/20 text-green-400 border border-green-500/30",
        premium: "border-transparent bg-gradient-to-r from-amber-500 to-orange-500 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
