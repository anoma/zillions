import { shortenAddress, zatoshiToZec } from "@zillions/utils";

import type { PcztIo } from "./pczt";

// Shielded inputs are per-pool totals, with no single address to name.
export const formatAddress = (address?: string): string =>
  address ? shortenAddress(address) : "Shielded funds";

export const formatValue = (value?: string | number): string =>
  value === undefined ? "" : ` (${zatoshiToZec(value)} ZEC)`;

export const formatZec = (zatoshi: bigint | number | string): string =>
  `${zatoshiToZec(zatoshi)} ZEC`;

/** An input or output as a list row reads: who, then how much. */
export const ioLabel = (io: PcztIo): string =>
  `${io.mine ? "Your wallet" : formatAddress(io.address)}${formatValue(io.value)}`;
