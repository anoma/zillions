import { useNavigate } from "react-router-dom";

/**
 * Back one screen, or to the root when this screen opened first (the popup
 * starts a fresh history each time it opens).
 */
export const useBack = (): (() => void) => {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };
};
