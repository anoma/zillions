import { OneClickService } from "@defuse-protocol/one-click-sdk-typescript";
import { queryOptions, useQuery } from "@tanstack/react-query";

/**
 * How long a token list is reused. The swap form takes its estimates from
 * the prices in it (the quote itself is always fresh), so a minute is close
 * enough; history only needs the symbols, which don't change.
 */
const TOKENS_STALE_MS = 60_000;

/**
 * 1Click's token list, shared by everything that shows tokens: one request
 * serves them all, and leaving a screen cancels a request still under way.
 */
export const getTokens = queryOptions({
  queryKey: ["oneClickTokens"],
  queryFn: () => OneClickService.getTokens(),
  staleTime: TOKENS_STALE_MS,
});

/**
 * The token list, fetched only while `enabled`: asking 1Click tells it this
 * IP runs the wallet, so a caller that may not need it (history, with no
 * swaps) should wait until it does.
 */
export function useGetTokens(enabled = true) {
  return useQuery({ ...getTokens, enabled });
}
