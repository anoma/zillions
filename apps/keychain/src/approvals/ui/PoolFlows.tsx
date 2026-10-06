import { FaArrowDown, FaArrowUp } from "react-icons/fa6";

import { ioLabel } from "../utils/format";
import type { PcztIo } from "../utils/pczt";
import { TransactionCard } from "./TransactionCard";

type PoolFlowsProps = {
  title: string;
  inputs: PcztIo[];
  outputs: PcztIo[];
};

/**
 * One pool's (transparent / sapling / orchard / ironwood) inputs and outputs
 * as cards; nothing for a pool the transaction doesn't touch.
 */
export const PoolFlows = ({ title, inputs, outputs }: PoolFlowsProps) => (
  <>
    {inputs.map((io, i) => (
      <TransactionCard
        key={`${title}-in-${i}`}
        title={`${title} input`}
        content={ioLabel(io)}
        icon={<FaArrowUp />}
      />
    ))}
    {outputs.map((io, i) => (
      <TransactionCard
        key={`${title}-out-${i}`}
        title={`${title} output`}
        content={ioLabel(io)}
        icon={<FaArrowDown />}
      />
    ))}
  </>
);
