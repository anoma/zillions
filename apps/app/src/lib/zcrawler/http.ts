/**
 * Statuses worth asking again: CloudFront's rate limit answers 403, and the
 * rest are the server or a proxy struggling rather than refusing.
 */
const TRANSIENT = new Set([403, 408, 429, 500, 502, 503, 504]);

/** Waits before each retry, in ms: about a minute in all. */
const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];

/**
 * `fetch`, asked again with backoff on a network error or a transient status.
 * Any other response, a 404 included, comes back as it is; the last
 * transient one too, once the retries run out.
 */
export async function fetchWithRetry(url: string, init?: RequestInit) {
  for (let attempt = 0; ; attempt++) {
    const wait = BACKOFF[attempt];
    try {
      const res = await fetch(url, init);
      if (!TRANSIENT.has(res.status) || wait === undefined) return res;
    } catch (err) {
      if (wait === undefined) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
