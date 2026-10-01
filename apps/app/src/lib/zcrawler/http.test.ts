import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { fetchWithRetry } from "./http";

const respond = (status: number) => new Response(null, { status });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("asks again after a rate limit or a dropped connection", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(respond(403))
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(respond(200));
  vi.stubGlobal("fetch", fetch);

  const res = fetchWithRetry("https://indexer/x");
  await vi.runAllTimersAsync();
  expect((await res).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("hands back a meaningful status at once", async () => {
  const fetch = vi.fn().mockResolvedValue(respond(404));
  vi.stubGlobal("fetch", fetch);

  expect((await fetchWithRetry("https://indexer/x")).status).toBe(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("gives up after about a minute", async () => {
  const fetch = vi.fn().mockResolvedValue(respond(503));
  vi.stubGlobal("fetch", fetch);

  const res = fetchWithRetry("https://indexer/x");
  await vi.runAllTimersAsync();
  expect((await res).status).toBe(503);
  expect(fetch).toHaveBeenCalledTimes(7);
});
