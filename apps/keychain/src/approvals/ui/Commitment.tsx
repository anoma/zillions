/**
 * PCZT summary renderer. Shows transparent inputs/outputs, sapling/orchard
 * value flows and the fee (where present), all derived from `pczt.to_json()`.
 */
import { ReactNode } from "react";
import { FaArrowDown, FaArrowUp } from "react-icons/fa6";
import { GoStack } from "react-icons/go";
import { PiDotsNineBold } from "react-icons/pi";

import { PcztShieldedIo, PcztSummary, PcztTransparentIo } from "@zillions/types";
import { shortenAddress } from "@zillions/utils";

import { TransactionCard } from "./TransactionCard";

type CommitmentProps = {
  summary: PcztSummary;
};

const formatAddress = (address?: string): string =>
  address ? shortenAddress(address, 6, 6) : "unknown";

const formatValue = (value?: string | number): string =>
  value === undefined ? "" : ` (${String(value)} zat)`;

const ioContent = (io: PcztTransparentIo | PcztShieldedIo): ReactNode => (
  <>
    {formatAddress(io.address)}
    {formatValue(io.value)}
  </>
);

/**
 * Render a single section (transparent / sapling / orchard) of a PCZT as a set
 * of input/output cards. Sections with no flows are omitted.
 */
const Section = ({
  title,
  inputs,
  outputs,
}: {
  title: string;
  inputs: (PcztTransparentIo | PcztShieldedIo)[];
  outputs: (PcztTransparentIo | PcztShieldedIo)[];
}): JSX.Element | null => {
  if (inputs.length === 0 && outputs.length === 0) {
    return null;
  }
  return (
    <>
      {inputs.map((io, i) => (
        <TransactionCard
          key={`${title}-in-${i}`}
          title={`${title} input`}
          content={ioContent(io)}
          icon={<FaArrowUp />}
        />
      ))}
      {outputs.map((io, i) => (
        <TransactionCard
          key={`${title}-out-${i}`}
          title={`${title} output`}
          content={ioContent(io)}
          icon={<FaArrowDown />}
        />
      ))}
    </>
  );
};

export const Commitment = ({ summary }: CommitmentProps): JSX.Element => {
  const empty =
    summary.transparentInputs.length === 0 &&
    summary.transparentOutputs.length === 0 &&
    summary.saplingInputs.length === 0 &&
    summary.saplingOutputs.length === 0 &&
    summary.orchardInputs.length === 0 &&
    summary.orchardOutputs.length === 0;

  return (
    <>
      <Section
        title="Transparent"
        inputs={summary.transparentInputs}
        outputs={summary.transparentOutputs}
      />
      <Section
        title="Sapling"
        inputs={summary.saplingInputs}
        outputs={summary.saplingOutputs}
      />
      <Section
        title="Orchard"
        inputs={summary.orchardInputs}
        outputs={summary.orchardOutputs}
      />
      {summary.fee !== undefined && (
        <TransactionCard
          title="Fee"
          content={`${summary.fee} zat`}
          icon={<GoStack />}
        />
      )}
      {empty && summary.fee === undefined && (
        <TransactionCard
          title="PCZT"
          content="No decodable inputs/outputs. See raw data."
          icon={<PiDotsNineBold />}
        />
      )}
    </>
  );
};
