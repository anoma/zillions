import { ShieldCheckIcon } from "../../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../../icons/ShieldSlashIcon";
import { Notice } from "../TransferForm";
import { ZecValue } from "../ZecValue";

/** Under the Send button: how private this transfer is (product.md 2.3). */
export function PrivacyNotice({
  transparentFrom,
  transparentTo,
  shieldedChange,
}: {
  transparentFrom: boolean;
  transparentTo: boolean;
  shieldedChange: bigint;
}) {
  const transparent = transparentFrom || transparentTo;
  return (
    <>
      <Notice
        icon={
          transparent ? (
            <ShieldSlashIcon aria-hidden="true" className="size-4" />
          ) : (
            <ShieldCheckIcon aria-hidden="true" className="size-4 text-gold" />
          )
        }
      >
        {transparentFrom && transparentTo
          ? "This transfer is transparent"
          : transparent
            ? "This transfer is partly shielded"
            : "This transfer is shielded"}
      </Notice>
      {shieldedChange > 0n && (
        <p className="mt-1 text-xs text-center text-gray-600">
          <ZecValue zat={shieldedChange} /> also moves from your transparent to
          your shielded balance, so the amount you send stays private.
        </p>
      )}
    </>
  );
}
