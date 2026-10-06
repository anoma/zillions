import { PiDotsNineBold } from "react-icons/pi";

import type { PcztSummary } from "@zillions/types";

import { isEmpty, poolFlows } from "../utils/pczt";
import { PoolFlows } from "./PoolFlows";
import { TransactionCard } from "./TransactionCard";

type CommitmentProps = {
  summary: PcztSummary;
};

/** Every input and output of a PCZT, pool by pool. */
export const Commitment = ({ summary }: CommitmentProps) => (
  <>
    {poolFlows(summary).map(({ title, inputs, outputs }) => (
      <PoolFlows key={title} title={title} inputs={inputs} outputs={outputs} />
    ))}
    {isEmpty(summary) && (
      <TransactionCard
        title="PCZT"
        content="No decodable inputs/outputs. See raw data."
        icon={<PiDotsNineBold />}
      />
    )}
  </>
);
