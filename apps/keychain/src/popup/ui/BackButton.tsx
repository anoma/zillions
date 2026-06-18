/**
 * The popup's standard bottom "back" control: a plain, full-width text button
 * (not an `ActionButton`). `type="button"` is required — several screens wrap
 * their content in a `<form>`, and a typeless button would submit it.
 */
type BackButtonProps = {
  onClick: () => void;
  children?: React.ReactNode;
};

export const BackButton = ({
  onClick,
  children = "Back",
}: BackButtonProps): JSX.Element => (
  <button
    type="button"
    className="w-full text-center text-sm cursor-pointer"
    onClick={onClick}
  >
    {children}
  </button>
);
