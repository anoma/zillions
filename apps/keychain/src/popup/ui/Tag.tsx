import { tv, type VariantProps } from "tailwind-variants";

const tag = tv({
  base: "inline-flex items-center gap-1.5 shrink-0 rounded-pill px-2 py-[3px] text-[10.5px] font-semibold leading-none whitespace-nowrap",
  variants: {
    tone: {
      neutral: "bg-card border border-line-strong text-ink-2",
      gold: "bg-gold text-[#111]",
      soft: "bg-gold-soft text-on-gold-soft",
      danger: "bg-danger-soft text-on-danger-soft",
    },
  },
  defaultVariants: { tone: "neutral" },
});

type TagProps = VariantProps<typeof tag> & {
  children: React.ReactNode;
  className?: string;
};

export const Tag = ({ tone, children, className }: TagProps) => (
  <span className={tag({ tone, class: className })}>{children}</span>
);
