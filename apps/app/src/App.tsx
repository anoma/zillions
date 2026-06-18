import { useEffect, useState } from "react";
import { initSdk } from "./lib/sdk";
import { zillionsWallet } from "./lib/wallet";

function App() {
  const [loading, setIsLoading] = useState(true);
  const [shieldedBalance, setShieldedBalance] = useState(0);
  const [unshieldedBalance, setUnshieldedBalance] = useState(0);
  const [saplingBalance, setSaplingBalance] = useState(0);

  useEffect(() => {
    (async () => {
      await initSdk();

      await zillionsWallet.sync();

      const balances = await zillionsWallet.getBalances();
      setShieldedBalance(balances.orchardBalance);
      setUnshieldedBalance(balances.unshieldedBalance);
      setSaplingBalance(balances.saplingBalance);

      setIsLoading(false);
    })();
  }, []);

  return (
    <div className="p-10">
      <header>
        <h1 className="text-2xl font-bold">Zillions</h1>
      </header>
      <main>
        {loading ? (
          <div className="font-light">Loading...</div>
        ) : (
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
        )}
      </main>
    </div>
  );
}

export default App;
