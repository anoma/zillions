import { useEffect, useState } from "react";
import { useAccount } from "../hooks/useAccount";

export function TotalBalance() {
  const [loading, setIsLoading] = useState(true);

  const [shieldedBalance, setShieldedBalance] = useState(0);
  const [unshieldedBalance, setUnshieldedBalance] = useState(0);
  const [saplingBalance, setSaplingBalance] = useState(0);

  const account = useAccount();

  useEffect(() => {
    (async () => {
      try {
        account.wallet.sync();

        const balances = await account.wallet.getBalances();
        console.log(">>>>>", { balances });
        setShieldedBalance(balances.orchardBalance);
        setUnshieldedBalance(balances.unshieldedBalance);
        setSaplingBalance(balances.saplingBalance);
      } catch (e) {
        console.error(e);
      }
      setIsLoading(false);
    })();
  }, [account]);

  return (
    <div className="wrap-anywhere">
      <div className="flex flex-col gap-4 my-4">
        {loading ? (
          <div className="font-light">Loading...</div>
        ) : (
          <>
            <div>
              <>
                <div>Shielded Balance: {shieldedBalance} ZEC</div>
                <div>UnshieldedBalance: {unshieldedBalance} ZEC</div>
                {saplingBalance > 0 && (
                  <div>
                    <div>Sapling balance: {saplingBalance} ZEC</div>
                    <button>Migrate sapling balance to orchard</button>
                  </div>
                )}
              </>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
