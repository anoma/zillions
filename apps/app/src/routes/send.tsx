import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { Toggle } from "../components/Toggle";
import { useGetBalance } from "../hooks/useGetBalance";

export const Route = createFileRoute("/send")({
  component: SendRoute,
});

function SendRoute() {
  const balance = useGetBalance();
  const [isTransparent, setIsTransparent] = useState(false);

  const onSubmit = () => {
    // TODO
  };

  const availableBalance = (() => {
    if (!balance.data) {
      return 0;
    }
    if (isTransparent) {
      return balance.data.unshieldedBalance;
    }
    return balance.data.orchardBalance + balance.data.saplingBalance;
  })();

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Send</h1>
      <form
        className="w-full max-w-125 mx-auto mt-10 flex flex-col gap-4"
        onSubmit={onSubmit}
      >
        <label>
          <div className="text-xs font-medium mb-1">From</div>
          <div>
            <Toggle
              className="h-11 w-full border border-gray-300"
              toggleClassList="w-1/2"
              active={isTransparent}
              onChange={(v) => setIsTransparent(v)}
            >
              <div className="h-full grid grid-cols-2 items-center font-medium">
                <div>Shielded</div>
                <div>Transparent</div>
              </div>
            </Toggle>
          </div>
        </label>
        <div className="text-xs font-medium text-center">
          Available: {availableBalance.toLocaleString()} ZEC
        </div>
        <div>
          <input
            name="amount"
            type="text"
            placeholder="0"
            autoComplete="off"
            className="w-full text-center text-8xl leading-none font-medium outline-none placeholder:text-black focus:placeholder:text-transparent"
          />
        </div>
        <div>
          <label>
            <div className="text-xs font-medium mb-1">To</div>
            <input
              name="to"
              type="text"
              placeholder="Enter Zcash address..."
              className="w-full px-4 py-2 font-medium rounded-lg border border-gray-300 outline-none placeholder:text-black focus:border-gray-600 focus:placeholder:text-transparent"
            />
          </label>
        </div>
        <div className="flex items-center justify-between text-xs font-medium">
          <div>Fee</div>
          <div>{0.00001} ZEC</div>
        </div>
        <div>
          <ActionButton className="w-full">Send</ActionButton>
        </div>
      </form>
    </div>
  );
}
