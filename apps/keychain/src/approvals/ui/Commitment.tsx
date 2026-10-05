/**
 * PCZT summary renderer. Shows transparent inputs/outputs and
 * sapling/orchard/ironwood value flows derived from `pczt.to_json()`, plus the fee from `pczt.fee()`.
 */
import { ReactNode } from "react";
import { FaArrowDown, FaArrowUp } from "react-icons/fa6";
import { GoStack } from "react-icons/go";
import { PiDotsNineBold } from "react-icons/pi";

import { PcztShieldedIo, PcztSummary, PcztTransparentIo } from "@zillions/types";
import { shortenAddress, zatoshiToZec } from "@zillions/utils";

import { TransactionCard } from "./TransactionCard";

type CommitmentProps = {
  summary: PcztSummary;
};

const formatAddress = (address?: string): string =>
  address ? shortenAddress(address) : "unknown";

const formatValue = (value?: string | number): string =>
  value === undefined ? "" : ` (${zatoshiToZec(value)} ZEC)`;

const ioContent = (io: PcztTransparentIo | PcztShieldedIo): ReactNode => (
  <>
    {formatAddress(io.address)}
    {formatValue(io.value)}
  </>
);

/**
 * Render a single section (transparent / sapling / orchard / ironwood) of a PCZT as a set
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
}) => {
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

export const Commitment = ({ summary }: CommitmentProps) => {
  const empty =
    summary.transparentInputs.length === 0 &&
    summary.transparentOutputs.length === 0 &&
    summary.saplingInputs.length === 0 &&
    summary.saplingOutputs.length === 0 &&
    summary.orchardInputs.length === 0 &&
    summary.orchardOutputs.length === 0 &&
    summary.ironwoodInputs.length === 0 &&
    summary.ironwoodOutputs.length === 0;

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
      <Section
        title="Ironwood"
        inputs={summary.ironwoodInputs}
        outputs={summary.ironwoodOutputs}
      />
      <TransactionCard
        title="Fee"
        content={`${zatoshiToZec(summary.fee)} ZEC`}
        icon={<GoStack />}
      />
      {empty && (
        <TransactionCard
          title="PCZT"
          content="No decodable inputs/outputs. See raw data."
          icon={<PiDotsNineBold />}
        />
      )}
    </>
  );
};
