import { tv, type VariantProps } from "tailwind-variants";
import { Logo } from "./assets/Logo";

const loading = tv({
  slots: {
    container:
      "block h-full w-full min-h-[50vh] transition-opacity duration-150",
    panel:
      "flex flex-col items-center bg-primary text-black gap-10 absolute top-0 left-0 h-full w-full py-24 px-12 z-50",
    header:
      "flex items-end text-2xl font-medium min-h-[2.5em] text-center uppercase text-balance text-black",
    image: "block max-w-[80%] -mt-6 w-full mx-auto",
  },
  variants: {
    visible: {
      false: {
        container: "opacity-0 pointer-events-none absolute",
      },
    },
    variant: {
      contained: {},
      full: { container: "absolute left-0 top-0" },
    },
  },
});

type LoadingProps = {
  status: string;
  imageUrl?: string;
  className?: string;
} & VariantProps<typeof loading>;

export const Loading = ({
  status,
  visible = true,
  imageUrl = "",
  variant = "contained",
  className,
}: LoadingProps): JSX.Element => {
  const { container, panel, header, image } = loading({ variant, visible });

  return (
    <div className={container({ class: className })}>
      <div className={panel()}>
        <header className={header()}>{status}</header>
        {imageUrl && (
          <img src={imageUrl} alt="Loading..." className={image()} />
        )}
        {!imageUrl && <Logo className="w-[70%] max-w-[500px] py-12" />}
      </div>
    </div>
  );
};
