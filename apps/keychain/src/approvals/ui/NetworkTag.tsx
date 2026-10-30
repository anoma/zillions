import { Tag } from "../../popup/ui/Tag";

/** The network a transaction targets, read from the PCZT itself. */
export const NetworkTag = ({ network }: { network?: string }) => {
  if (!network) return null;
  return (
    <Tag tone={network === "main" ? "neutral" : "soft"}>
      {network === "main" ? "Mainnet" : network === "test" ? "Testnet" : network}
    </Tag>
  );
};
