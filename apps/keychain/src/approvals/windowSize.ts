/** The approval window's size as the background creates it (outer, CSS px). */
export const APPROVAL_WINDOW = { width: 396, height: 640 } as const;

/** Slack for window frames and rounding on scaled displays. */
const SLACK = 8;

type Geometry = {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
};
type Available = {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
};

/**
 * Whether the approval window is as big as it was made (or as the screen
 * allows) and wholly on screen. Another extension can shrink or push it half
 * off-screen without taking its focus, leaving Approve pinned in view while
 * the request scrolls out of it.
 */
export const windowFits = (w: Geometry, s: Available): boolean => {
  const width = Math.min(APPROVAL_WINDOW.width, s.availWidth) - SLACK;
  const height = Math.min(APPROVAL_WINDOW.height, s.availHeight) - SLACK;
  return (
    w.outerWidth >= width &&
    w.outerHeight >= height &&
    w.screenX >= s.availLeft - SLACK &&
    w.screenY >= s.availTop - SLACK &&
    w.screenX + w.outerWidth <= s.availLeft + s.availWidth + SLACK &&
    w.screenY + w.outerHeight <= s.availTop + s.availHeight + SLACK
  );
};
