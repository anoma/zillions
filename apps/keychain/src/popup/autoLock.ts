/** Auto-lock choices, in minutes; 0 never. Mirrors `AUTO_LOCK_OPTIONS`. */
export const AUTO_LOCK_CHOICES = [5, 15, 30, 60, 0] as const;

export const autoLockLabel = (minutes: number): string =>
  minutes === 0 ? "Never"
  : minutes === 60 ? "1 hour"
  : `${minutes} minutes`;
