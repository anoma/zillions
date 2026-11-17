/**
 * Whether `url`'s origin may be a site the Keychain talks to: `https:`, or
 * `http:` on this machine for development. A plaintext page on any other host
 * is whatever the network says it is, and its window would name the real
 * site's host.
 */
export const isSiteOrigin = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
};
