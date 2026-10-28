import { useState } from "react";
import { GoArrowDown, GoArrowUp } from "react-icons/go";

import type { PcztSummary } from "@zillions/types";
import { zatoshiToZec } from "@zillions/utils";

import { Row } from "../../popup/ui/Row";
import { formatAddress } from "../utils/format";
import { flowCount, isEmpty, poolFlows, summaryAsText, type PcztIo } from "../utils/pczt";

const FlowRow = ({ pool, io, input }: { pool: string; io: PcztIo; input: boolean }) => (
  <Row
    className="min-h-12 py-2.5"
    lead={
      <span className="size-7 grid place-items-center rounded-pill bg-card text-muted [&_svg]:size-3.5">
        {input ? <GoArrowUp /> : <GoArrowDown />}
      </span>
    }
    title={`${pool} ${input ? "input" : "output"}`}
    subtitle={io.mine ? "Your wallet" : formatAddress(io.address)}
    trail={
      io.value !== undefined && (
        <span className="text-[12.5px] font-semibold tabular-nums">
          {zatoshiToZec(io.value)} <span className="text-muted">ZEC</span>
        </span>
      )
    }
  />
);

/**
 * Every input and output of the PCZT, pool by pool, always shown; the raw
 * summary is one toggle away.
 */
export const TransactionDetails = ({ summary }: { summary: PcztSummary }) => {
  const [raw, setRaw] = useState(false);
  const count = flowCount(summary);
  return (
    <section className="mt-2">
      <header className="flex items-center justify-between mt-[18px] mb-1">
        <h2 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          Details · {count} {count === 1 ? "flow" : "flows"}
        </h2>
        <button
          type="button"
          className="text-[11.5px] font-semibold text-ink-2 cursor-pointer hover:text-black"
          onClick={() => setRaw(!raw)}
        >
          {raw ? "Show flows" : "Raw data"}
        </button>
      </header>
      {raw ? (
        <pre className="m-0 mt-1 max-h-64 overflow-auto rounded-xl bg-card p-3 font-mono text-[10.5px] leading-relaxed">
          {summaryAsText(summary)}
        </pre>
      ) : isEmpty(summary) ? (
        <p className="m-0 py-3 text-[12px] text-muted">
          No decodable inputs or outputs. See the raw data.
        </p>
      ) : (
        poolFlows(summary).map(({ title, inputs, outputs }) => (
          <div key={title}>
            {inputs.map((io, i) => (
              <FlowRow key={`in-${i}`} pool={title} io={io} input />
            ))}
            {outputs.map((io, i) => (
              <FlowRow key={`out-${i}`} pool={title} io={io} input={false} />
            ))}
          </div>
        ))
      )}
    </section>
  );
};
