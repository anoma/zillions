/**
 * The page ↔ content-script wire protocol (`window.postMessage` envelopes).
 * `ProxyMethod` derives from the shared `Zillions` interface so the protocol
 * stays in lockstep with what dapps can call.
 */
import type { Zillions } from "@zillions/types";

export type ProxyMethod = keyof Omit<Zillions, "version">;

export enum ProxyRequestTypes {
  Request = "zillions-proxy-request",
  Response = "zillions-proxy-request-response",
}

/** Result envelope: exactly one of `return` / `error` is set. */
export type ProxyResult = {
  return?: unknown;
  /** Error message (kept as a string so it survives structured clone). */
  error?: string;
};

export interface ProxyRequest<T = unknown> {
  type: ProxyRequestTypes;
  id: string;
  method: ProxyMethod;
  args?: T;
}

export interface ProxyRequestResponse {
  type: ProxyRequestTypes.Response;
  id: string;
  result: ProxyResult | undefined;
}
