import { describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: {} }));
vi.mock("./handlers", () => ({ handlers: {}, TRUSTED_SENDER: { trusted: true } }));

import { classifySender } from "./server";

const BASE = "chrome-extension://ours/";
const tab = (url: string) => ({ url, tab: { id: 3 } }) as never;

describe("classifySender", () => {
  it("names an https page's site by its origin", () => {
    expect(classifySender(tab("https://app.zillions.money/send"), BASE)).toEqual({
      trusted: false,
      origin: "https://app.zillions.money",
      tabId: 3,
    });
  });

  it("refuses a plaintext page off this machine", () => {
    expect(classifySender(tab("http://app.zillions.money/"), BASE)).toBeUndefined();
  });

  it("accepts a plaintext page on this machine", () => {
    expect(classifySender(tab("http://localhost:5173/"), BASE)).toMatchObject({
      origin: "http://localhost:5173",
    });
  });
});
