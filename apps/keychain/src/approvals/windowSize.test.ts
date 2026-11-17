import { describe, expect, it } from "vitest";

import { windowFits } from "./windowSize";

const screen = { availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875 };
const made = { screenX: 500, screenY: 120, outerWidth: 396, outerHeight: 640 };

describe("windowFits", () => {
  it("accepts the window as it was made", () => {
    expect(windowFits(made, screen)).toBe(true);
  });

  it("refuses a window shrunk below its made size", () => {
    expect(windowFits({ ...made, outerHeight: 150 }, screen)).toBe(false);
    expect(windowFits({ ...made, outerWidth: 200 }, screen)).toBe(false);
  });

  it("refuses a window partly off screen", () => {
    expect(windowFits({ ...made, screenY: -330 }, screen)).toBe(false);
    expect(windowFits({ ...made, screenX: 1300 }, screen)).toBe(false);
    expect(windowFits({ ...made, screenY: 400 }, screen)).toBe(false);
  });

  it("asks a small screen only for what it can hold", () => {
    const small = { availLeft: 0, availTop: 0, availWidth: 1024, availHeight: 600 };
    expect(windowFits({ screenX: 0, screenY: 0, outerWidth: 396, outerHeight: 600 }, small)).toBe(
      true
    );
  });

  it("allows a few pixels of frame and rounding", () => {
    expect(windowFits({ ...made, screenX: -4, outerHeight: 636 }, screen)).toBe(true);
  });

  it("checks against a second screen's own bounds", () => {
    const right = { availLeft: 1440, availTop: 0, availWidth: 1920, availHeight: 1080 };
    expect(windowFits({ ...made, screenX: 2000, screenY: 100 }, right)).toBe(true);
  });
});
