import clsx from "clsx";

type NoticeProps = {
  tone?: "gold" | "danger" | "neutral";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export const Notice = ({ tone = "gold", title, children, className }: NoticeProps) => (
  <div
    role={tone === "danger" ? "alert" : undefined}
    className={clsx(
      "rounded-[10px] px-3 py-2.5 text-[11.5px] leading-[1.45] font-medium",
      tone === "gold" && "bg-gold-soft text-on-gold-soft",
      tone === "danger" && "bg-danger-soft text-on-danger-soft",
      tone === "neutral" && "bg-card text-muted",
      className
    )}
  >
    {title && <strong className="block font-bold mb-0.5">{title}</strong>}
    {children}
  </div>
);
