import { describe, expect, it } from "vitest";

import { isSiteOrigin } from "./origin";

describe("isSiteOrigin", () => {
  it("accepts https anywhere", () => {
    expect(isSiteOrigin("https://app.zillions.money")).toBe(true);
    expect(isSiteOrigin("https://app.zillions.money/send?x=1")).toBe(true);
  });

  it("refuses plaintext off this machine", () => {
    expect(isSiteOrigin("http://app.zillions.money")).toBe(false);
    expect(isSiteOrigin("http://www.app.zillions.money")).toBe(false);
    expect(isSiteOrigin("http://192.168.1.10:8080")).toBe(false);
    // Names that only look local.
    expect(isSiteOrigin("http://localhost.evil.example")).toBe(false);
    expect(isSiteOrigin("http://127.0.0.1.evil.example")).toBe(false);
  });

  it("accepts plaintext on this machine, for development", () => {
    expect(isSiteOrigin("http://localhost:5173")).toBe(true);
    expect(isSiteOrigin("http://app.localhost")).toBe(true);
    expect(isSiteOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isSiteOrigin("http://[::1]:3000")).toBe(true);
  });

  it("refuses other schemes and non-URLs", () => {
    expect(isSiteOrigin("file:///tmp/x.html")).toBe(false);
    expect(isSiteOrigin("data:text/html,hi")).toBe(false);
    expect(isSiteOrigin("not a url")).toBe(false);
    expect(isSiteOrigin("")).toBe(false);
  });
});
