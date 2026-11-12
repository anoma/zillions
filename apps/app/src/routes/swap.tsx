import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QRCode } from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { FormPage } from "../components/FormPage";
import { PageError } from "../components/PageError";
import { FormCard, SubmitBlock } from "../components/TransferForm";
import { ActionButton } from "../components/ui/ActionButton";
import { qrClassName } from "../components/ui/utils";
import { useFreshAddress } from "../hooks/useAddresses";
import { useWallet } from "../hooks/useWallet";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { shortenAddress } from "../lib/utils";
import type { Token } from "../lib/wallet/types";

const Stage = {
  Swap: "SWAP",
  ReviewQuote: "REVIEW_QUOTE",
  DepositAmount: "DEPOSIT_AMOUNT",
};

const ZEC_TOKEN_ASSET_ID = "nep141:zec.omft.near";

export const Route = createFileRoute("/swap")({
  component: SwapRoute,
});

function SwapRoute() {
  const UNKNOWN_SYMBOL_LOGO = "/logos/unknown_symbol.svg";
  const UNKNOWN_BLOCKCHAIN_LOGO = "/logos/unknown_blockchain.svg";
  // Map blockchains to logo paths
  const blockchainLogos = new Map<string, string>();
  // Map cryptocurrency symbols to logo paths
  const symbolLogos = new Map<string, string>();
  const wallet = useWallet();
  const shielded = useFreshAddress();
  const [fromToken, setFromToken] = useState({
    assetId: "nep141:btc.omft.near",
    symbol: "BTC",
    blockchain: "btc",
    price: 73978,
    priceUpdatedAt: "2026-11-11T11:20:05.389Z",
    coingeckoId: "bitcoin",
    decimals: 8,
  });
  const [error, setError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fromAmount, setFromAmount] = useState("");
  const [refundAddress, setRefundAddress] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState([]);
  const [toAmount, setToAmount] = useState("--");
  const [zecToken, setZecToken] = useState({
    assetId: ZEC_TOKEN_ASSET_ID,
    decimals: 8,
    blockchain: "zec",
    symbol: "ZEC",
    price: 1315.9,
    priceUpdatedAt: "2026-11-06T13:22:31.003Z",
    coingeckoId: "zcash",
  });

  const [isPending, setIsPending] = useState(false);
  const [stage, setStage] = useState(Stage.Swap);
  const [amountIn, setAmountIn] = useState("0");
  const [amountOut, setAmountOut] = useState("0");
  const [depositAddress, setDepositAddress] = useState("");

  // New state variables for USD values
  const [amountInUsd, setAmountInUsd] = useState("0.00");
  const [amountOutUsd, setAmountOutUsd] = useState("0.00");
  const [withdrawFee, setWithdrawFee] = useState("0");

  const amountRef = useRef<HTMLInputElement>(null);
  const refundRef = useRef<HTMLInputElement>(null);
  const slippageRef = useRef<HTMLInputElement>(null);

  // Placeholders for future computed values
  const [fromTotalPrice, setFromTotalPrice] = useState("0.00");
  const [toTotalPrice, setToTotalPrice] = useState("0.00");
  const [zecPriceInFrom, setZecPriceInFrom] = useState("1");

  const onGetQuote = () => {
    setIsPending(true);
    // Placeholder for fetching quote logic
    setTimeout(() => setIsPending(false), 1000);
    setStage(Stage.ReviewQuote);
    setIsLoading(true);
    //e.preventDefault();
  };

  const onConfirm = () => {
    //e.preventDefault();
    setStage(Stage.DepositAmount);
    //setIsPending(true);
    // Placeholder for executing the actual swap transaction
    /*setTimeout(() => {
      setIsPending(false);
      alert("Swap Confirmed!"); // Or route to a success screen
      }, 2000);*/
  };

  const onFundsSend = () => {
    wallet.pushSwap(depositAddress);
  };

  useEffect(() => {
    (async () => {
      const totalPrice = Number(fromAmount) * fromToken.price;
      setFromTotalPrice(totalPrice.toFixed(2));
      setToTotalPrice(totalPrice.toFixed(2));
      const toAmount = totalPrice / zecToken.price;
      setToAmount(toAmount.toFixed(zecToken.decimals));
      setZecPriceInFrom((zecToken.price / fromToken.price).toString());
    })();
  }, [fromAmount, fromToken, toAmount, zecToken]);

  useEffect(() => {
    if (stage !== Stage.Swap) {
      return;
    }
    fetch("https://1click.chaindefuser.com/v0/tokens")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        setTokens(data);
        setFromToken(data[0]);
        setZecToken(
          data.find((token: Token) => token.assetId == ZEC_TOKEN_ASSET_ID),
        );
        setIsLoading(false);
      })
      .catch((error) => {
        setError(error.message);
        setIsLoading(false);
      });
  }, [stage]);

  useEffect(() => {
    if (stage !== Stage.ReviewQuote) {
      return;
    }
    const deadline = new Date(Date.now() + 60 * 60 * 1000);
    const body = {
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: Number(slippage) * 100,
      originAsset: fromToken.assetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: ZEC_TOKEN_ASSET_ID,
      amount: (Number(fromAmount) * 10 ** fromToken.decimals).toString(),
      recipient: shielded,
      recipientType: "DESTINATION_CHAIN",
      refundTo: refundAddress,
      refundType: "ORIGIN_CHAIN",
      deadline: deadline.toISOString(),
    };
    console.log("Review Quote post request body", body);
    fetch("https://1click.chaindefuser.com/v0/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        console.log("Review Quote post response body", data);
        setAmountIn(data.quote.amountInFormatted);
        setAmountOut(data.quote.amountOutFormatted);

        // Save the deposit address
        setDepositAddress(data.quote.depositAddress);

        // Populate USD equivalents
        setAmountInUsd(Number(data.quote.amountInUsd).toFixed(2));
        setAmountOutUsd(Number(data.quote.amountOutUsd).toFixed(2));

        setWithdrawFee(
          (
            (data.quote.amountInUsd - data.quote.amountOutUsd) /
            fromToken.price
          ).toString(),
        );
        setIsLoading(false);
      })
      .catch((error) => {
        setError(error.message);
        setIsLoading(false);
      });
  }, [stage, fromAmount, fromToken, refundAddress, shielded, slippage]);

  if (error) {
    return <PageError>{error}</PageError>;
  } else if (isLoading) {
    return (
      <div className="size-52 grid place-items-center">
        <SpinnerIcon className="size-5 text-gold" />
      </div>
    );
  } else if (stage == Stage.Swap) {
    return (
      <FormPage title="Swap" onSubmit={onGetQuote}>
        <FormCard heading="From" htmlFor="swap-from-amount">
          <div className="flex flex-col gap-4">
            <div
              className="relative w-full"
              tabIndex={0}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDropdownOpen(false);
                }
              }}
            >
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-card p-3 text-sm focus:border-black focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={
                      symbolLogos.get(fromToken.symbol) ?? UNKNOWN_SYMBOL_LOGO
                    }
                    alt={fromToken.symbol}
                    className="size-5 rounded-full bg-gray-100"
                  />
                  <img
                    src={
                      blockchainLogos.get(fromToken.blockchain) ??
                      UNKNOWN_BLOCKCHAIN_LOGO
                    }
                    alt={fromToken.blockchain}
                    className="size-5 rounded-full bg-gray-100"
                  />
                  <span className="font-medium">
                    {fromToken.symbol} on {fromToken.blockchain}
                  </span>
                </div>
                <span className="text-gray-400">▼</span>
              </button>

              {dropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-card border border-line rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {tokens.map((c: Token) => (
                    <button
                      key={c.assetId}
                      type="button"
                      onClick={() => {
                        setFromToken(c);
                        setDropdownOpen(false);
                      }}
                      className={twMerge(
                        "flex w-full items-center gap-3 p-3 text-sm transition-colors hover:bg-neutral-100",
                        fromToken.assetId === c.assetId ? "bg-neutral-50" : "",
                      )}
                    >
                      <img
                        src={symbolLogos.get(c.symbol) ?? UNKNOWN_SYMBOL_LOGO}
                        alt={c.symbol}
                        className="size-5 rounded-full bg-gray-100"
                      />
                      <img
                        src={
                          blockchainLogos.get(c.blockchain) ??
                          UNKNOWN_BLOCKCHAIN_LOGO
                        }
                        alt={c.blockchain}
                        className="size-5 rounded-full bg-gray-100"
                      />
                      <span>
                        {c.symbol} on {c.blockchain}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <input
                id="swap-from-amount"
                ref={amountRef}
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => {
                  setFromAmount(e.target.value);
                }}
                className="w-full rounded-xl border border-line bg-transparent p-3 text-lg font-medium focus:border-black focus:outline-none"
              />
              <p className="px-1 text-xs text-neutral-500">
                ~ ${fromTotalPrice} USD
              </p>
            </div>
          </div>
        </FormCard>

        <FormCard heading="Refund Address" htmlFor="swap-refund-address">
          <div className="flex flex-col gap-1.5">
            <input
              id="swap-refund-address"
              ref={refundRef}
              type="text"
              placeholder="Address to refund if swap fails"
              value={refundAddress}
              onChange={(e) => setRefundAddress(e.target.value)}
              className="w-full rounded-xl border border-line bg-transparent p-3 text-sm focus:border-black focus:outline-none"
            />
          </div>
        </FormCard>

        <FormCard heading="To">
          <div className="flex flex-col gap-4">
            <div className="flex w-full items-center gap-3 rounded-xl border border-line bg-neutral-50 p-3 text-sm">
              <img
                src="/logos/zec.svg"
                alt="ZEC"
                className="size-5 rounded-full bg-black"
              />
              <span className="font-medium">
                {zecToken.symbol} on {zecToken.blockchain}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex w-full items-center rounded-xl border border-line bg-neutral-50 p-3 text-lg font-medium text-neutral-400">
                {toAmount}
              </div>
              <p className="px-1 text-xs text-neutral-500">
                ~ ${toTotalPrice} USD
              </p>
            </div>
          </div>
        </FormCard>

        <FormCard heading="Swap Settings">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="swap-slippage"
                className="text-sm font-medium text-neutral-700"
              >
                Slippage tolerance (%)
              </label>
              <input
                id="swap-slippage"
                ref={slippageRef}
                type="number"
                min="0.1"
                step="0.1"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-24 rounded-xl border border-line bg-transparent p-2 text-right text-sm focus:border-black focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-700">Rate</span>
              <span className="font-medium">
                1 {zecToken.symbol} = {zecPriceInFrom} {fromToken.symbol}
              </span>
            </div>
          </div>
        </FormCard>

        <SubmitBlock
          label="Get a quote"
          pending={isPending}
          pendingLabel="Getting quote..."
          color="black"
          stages={[]}
        />
      </FormPage>
    );
  } else if (stage == Stage.ReviewQuote) {
    return (
      <FormPage title="Review Quote" onSubmit={onConfirm}>
        <FormCard heading="Swap Summary">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-500">
                You are swapping
              </span>
              <div className="flex flex-col items-end">
                <span className="text-lg font-medium">
                  {amountIn} {fromToken.symbol}
                </span>
                <span className="text-xs text-neutral-500">
                  ~ ${amountInUsd} USD
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-500">
                To receive
              </span>
              <div className="flex flex-col items-end">
                <span className="text-lg font-medium">
                  {amountOut} {zecToken.symbol}
                </span>
                <span className="text-xs text-neutral-500">
                  ~ ${amountOutUsd} USD
                </span>
              </div>
            </div>
          </div>
        </FormCard>

        <FormCard heading="Transaction Details">
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-500">Total fees</span>
              <span className="font-medium">
                {withdrawFee} {fromToken.symbol}
              </span>
            </div>

            <div className="h-px w-full bg-line" />

            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-700">
                Total amount taken
              </span>
              <div className="flex flex-col items-end">
                <span className="text-lg font-bold text-black">
                  {amountIn} {fromToken.symbol}
                </span>
                <span className="text-xs text-neutral-500">
                  ~ ${amountInUsd} USD
                </span>
              </div>
            </div>
          </div>
        </FormCard>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStage(Stage.Swap)}
            className="rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-neutral-50 focus:border-black focus:outline-none"
          >
            Back
          </button>
          <div className="flex-1">
            <SubmitBlock
              label="Confirm"
              pending={isPending}
              pendingLabel="Confirming..."
              color="black"
              stages={[]}
            />
          </div>
        </div>
      </FormPage>
    );
  } else if (stage == Stage.DepositAmount) {
    return (
      <FormPage title="Deposit Funds">
        <section aria-label="Your address" className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-6 py-4">
            {/* Amount Display */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-neutral-700">
                Deposit Amount
              </span>
              <span className="text-3xl font-bold text-black">
                {amountIn} {fromToken.symbol}
              </span>
              <span className="text-sm font-medium text-neutral-500">
                ~ ${amountInUsd} USD
              </span>
            </div>

            {/* QR Code */}
            <div className="mx-auto w-fit flex flex-col items-center gap-3 rounded-xl border border-line bg-card p-4 pb-3">
              {depositAddress ? (
                <QRCode
                  value={depositAddress}
                  size={200}
                  key={depositAddress}
                  bgColor="transparent"
                  fgColor="#000000"
                  level="M"
                  title={`QR code of your deposit address`}
                  className={qrClassName}
                />
              ) : (
                <div className="size-52 grid place-items-center">
                  <SpinnerIcon className="size-5 text-gold" />
                </div>
              )}
              {depositAddress && (
                <CopyToClipboardControl
                  value={depositAddress}
                  className="gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-300 hover:bg-gold/15"
                  iconClassName="size-3.5"
                >
                  <span className="font-mono text-neutral-700">
                    {shortenAddress(depositAddress, 8, 6, "…")}
                  </span>
                </CopyToClipboardControl>
              )}
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => setStage(Stage.ReviewQuote)}
              className="rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-neutral-50 focus:border-black focus:outline-none"
            >
              Back
            </button>
            <ActionButton color="black" onClick={onFundsSend} href="/">
              I've sent the funds
            </ActionButton>
          </div>
        </section>
      </FormPage>
    );
  }
}
