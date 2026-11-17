import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { QRCode } from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { AmountDisplay } from "../components/AmountInput";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { FormPage } from "../components/FormPage";
import { PageError } from "../components/PageError";
import { AmountField, FormCard, SubmitBlock } from "../components/TransferForm";
import { ActionButton } from "../components/ui/ActionButton";
import { inputClassName, qrClassName } from "../components/ui/utils";
import { useFreshAddress } from "../hooks/useAddresses";
import { useSendPlan } from "../hooks/useSend";
import { useWallet } from "../hooks/useWallet";
import { BitcoinIcon } from "../icons/BitcoinIcon";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { UnknownIcon } from "../icons/UnknownIcon";
import { USDCoinIcon } from "../icons/USDCoinIcon";
import { ZcashIcon } from "../icons/ZcashIcon";
import {
  atomicToWhole,
  shortenAddress,
  wholeToAtomic,
  zatoshiToZec,
} from "../lib/utils";
import type { Token } from "../lib/wallet/types";

const Stage = {
  Swap: "SWAP",
  ReviewQuote: "REVIEW_QUOTE",
  DepositAmount: "DEPOSIT_AMOUNT",
};

// Touch screens only: on desktops, reading the clipboard asks for a
// permission, and pasting into the field is already one shortcut away.
const canPaste =
  Boolean(navigator.clipboard?.readText) &&
  matchMedia("(pointer: coarse)").matches;

const ZEC_TOKEN_ASSET_ID = "nep141:zec.omft.near";
const UNKNOWN_SYMBOL_LOGO: React.JSX.Element = <UnknownIcon />;
const UNKNOWN_BLOCKCHAIN_LOGO: React.JSX.Element = <UnknownIcon />;
// Map blockchains to logo paths
const blockchainLogos = new Map<string, React.JSX.Element>([
  ["btc", <BitcoinIcon />],
  ["zec", <ZcashIcon />],
]);
// Map cryptocurrency symbols to logo paths
const symbolLogos = new Map<string, React.JSX.Element>([
  ["BTC", <BitcoinIcon />],
  ["ZEC", <ZcashIcon />],
  ["USDC", <USDCoinIcon width={64} height={64} />],
]);

export const Route = createFileRoute("/swap")({
  component: SwapRoute,
});

function TokenIcon({ token }: { token: Token }) {
  return (
    <div className="relative inline-flex">
      {/* Main cryptocurrency logo */}
      {symbolLogos.get(token.symbol) ?? UNKNOWN_SYMBOL_LOGO}
      {/* Blockchain logo overlaid on bottom right */}
      <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-1/2 h-1/2 bg-white rounded-full border border-gray-100 shadow-sm overflow-hidden">
        {blockchainLogos.get(token.blockchain) ?? UNKNOWN_BLOCKCHAIN_LOGO}
      </div>
    </div>
  );
}

function abbreviateString(str: string, maxLength: number) {
  return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
}

function LabelledTokenIcon({ token }: { token: Token }) {
  return (
    <div
      className="flex items-center gap-3"
      title={`${token.symbol} on ${token.blockchain}`}
    >
      <TokenIcon token={token} />
      <div className="flex flex-col items-start">
        <span className="font-bold">{abbreviateString(token.symbol, 5)}</span>
        <span className="text-xs text-neutral-500">{token.blockchain}</span>
      </div>
    </div>
  );
}

function CurrencySelector({
  tokens,
  token,
  setToken,
  readOnly = false,
}: {
  tokens: Token[];
  token: Token;
  setToken: (value: string) => void;
  readOnly?: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  return (
    <div
      className="relative shrink-0 w-50"
      tabIndex={0}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setDropdownOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-card p-3 text-sm focus:border-black focus:outline-none"
      >
        <LabelledTokenIcon token={token} />
        {!readOnly && <span className="text-gray-400">▼</span>}
      </button>

      {dropdownOpen && (
        <div className="absolute z-10 w-full min-w-max mt-1 bg-card border border-line rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {tokens.map((c: Token) => (
            <button
              key={c.assetId}
              type="button"
              onClick={() => {
                setToken(c);
                setDropdownOpen(false);
              }}
              className={twMerge(
                "flex w-full items-center gap-3 p-3 text-sm transition-colors hover:bg-neutral-100",
                token.assetId === c.assetId ? "bg-neutral-50" : "",
              )}
            >
              <LabelledTokenIcon token={c} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SwapRoute() {
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
  const [fromAmount, setFromAmount] = useState("0");
  const [refundAddress, setRefundAddress] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState([]);
  const [toAmount, setToAmount] = useState(0n);
  const [toToken, setToToken] = useState({
    assetId: ZEC_TOKEN_ASSET_ID,
    decimals: 8,
    blockchain: "zec",
    symbol: "ZEC",
    price: 1315.9,
    priceUpdatedAt: "2026-11-06T13:22:31.003Z",
    coingeckoId: "zcash",
  });

  const [isPending, setIsPending] = useState(false);
  const [outbound, setOutbound] = useState(false);
  const [stage, setStage] = useState(Stage.Swap);
  const [amountIn, setAmountIn] = useState("0");
  const [amountInBigInt, setAmountInBigInt] = useState(0n);
  const [amountOut, setAmountOut] = useState("0");
  const [depositAddress, setDepositAddress] = useState("");

  // New state variables for USD values
  const [amountInUsd, setAmountInUsd] = useState(0.0);
  const [amountOutUsd, setAmountOutUsd] = useState(0.0);
  const [conversionFee, setConversionFee] = useState(0);

  const amountRef = useRef<HTMLInputElement>(null);
  const refundRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);
  const slippageRef = useRef<HTMLInputElement>(null);

  // Placeholders for future computed values
  const [fromTotalPrice, setFromTotalPrice] = useState(0n);
  const [toTotalPrice, setToTotalPrice] = useState(0n);
  const [zecPriceInFrom, setZecPriceInFrom] = useState(1n);

  const sendPlan = useSendPlan(
    {
      from: "shielded",
      to: depositAddress,
      amount: amountInBigInt,
      memo: "",
    },
    false,
    0n,
  );

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

  const reverseExchange = () => {
    const tmpToken = fromToken;
    const tmpAmount = atomicToWhole(toAmount, toToken.decimals);
    setFromToken(toToken);
    setToToken(tmpToken);
    setFromAmount(tmpAmount);
    if (!outbound) {
      setRecipientAddress("");
      setRefundAddress(shielded);
    } else {
      setRecipientAddress(shielded);
      setRefundAddress("");
    }
    setOutbound(!outbound);
  };

  useEffect(() => {
    (async () => setRecipientAddress(shielded))();
  }, [shielded]);

  useEffect(() => {
    (async () => {
      const totalPriceAux =
        wholeToAtomic(fromAmount, fromToken.decimals) *
        wholeToAtomic(fromToken.price, 2);
      const totalPrice = totalPriceAux / 10n ** BigInt(fromToken.decimals);
      setFromTotalPrice(totalPrice);
      setToTotalPrice(totalPrice);
      const toAmount =
        (totalPriceAux * 10n ** BigInt(toToken.decimals)) /
        (10n ** BigInt(fromToken.decimals) * wholeToAtomic(toToken.price, 2));
      setToAmount(toAmount);
      setZecPriceInFrom(
        (wholeToAtomic(toToken.price, 2) * 10n ** BigInt(fromToken.decimals)) /
          wholeToAtomic(fromToken.price, 2),
      );
    })();
  }, [fromAmount, fromToken, toAmount, toToken]);

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
        setToToken(
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
    console.log(recipientAddress);
    const body = {
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: Number(slippage) * 100,
      originAsset: fromToken.assetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: toToken.assetId,
      amount: (Number(fromAmount) * 10 ** fromToken.decimals).toString(),
      recipient: recipientAddress,
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
        setAmountInBigInt(BigInt(data.quote.amountIn));
        setAmountIn(data.quote.amountInFormatted);
        setAmountOut(data.quote.amountOutFormatted);

        // Save the deposit address
        setDepositAddress(data.quote.depositAddress);

        // Populate USD equivalents
        setAmountInUsd(Number(data.quote.amountInUsd));
        setAmountOutUsd(Number(data.quote.amountOutUsd));

        setConversionFee(
          (BigInt(
            Math.ceil((data.quote.amountInUsd - data.quote.amountOutUsd) * 100),
          ) *
            10n ** BigInt(fromToken.decimals)) /
            BigInt(Math.ceil(fromToken.price * 100)),
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
          <div className="flex flex-row items-start gap-4 w-full">
            <CurrencySelector
              tokens={tokens}
              token={fromToken}
              setToken={setFromToken}
              readOnly={outbound}
            />

            <div className="flex flex-1 flex-col gap-1.5 min-w-0 text-right w-full">
              <AmountField
                id="swap-from-amount"
                ref={amountRef}
                value={fromAmount}
                describedBy="send-available"
                unit=""
                onChange={setFromAmount}
              />
              <p className="px-1 text-xs text-neutral-500">
                ~ ${atomicToWhole(fromTotalPrice, 2)} USD
              </p>
            </div>
          </div>
        </FormCard>

        {/* Horizontal Lines with Centered, Overlapping, Transparent Down Arrow */}
        <div className="flex items-center justify-center text-black relative z-10">
          <div className="flex-1 h-px bg-line"></div>

          {/* Negative margin (-my-6) makes the arrow extend into the top/bottom divs */}
          <button
            type="button"
            aria-label="Exchange"
            className="px-4 -my-6 cursor-pointer hover:bg-neutral-400 transition-colors focus:outline-none rounded-lg"
            onClick={reverseExchange}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="48"
              viewBox="0 0 39 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Path stretched to 48px to accommodate the overlap */}
              <path d="M12 0v48M19 41l-7 7-7-7" />
              {/* Up arrow (on the right) */}
              <path d="M27 48V0M20 7l7-7 7 7" />
            </svg>
          </button>

          <div className="flex-1 h-px bg-line"></div>
        </div>

        <FormCard heading="To">
          <div className="flex flex-row items-start gap-4 w-full">
            <CurrencySelector
              tokens={tokens}
              token={toToken}
              setToken={setToToken}
              readOnly={!outbound}
            />

            <div className="flex flex-1 flex-col gap-1.5 min-w-0">
              <AmountDisplay
                value={atomicToWhole(toAmount, toToken.decimals)}
                unit=""
              />
              <p className="px-1 text-xs text-neutral-500 text-right w-full">
                ~ ${atomicToWhole(toTotalPrice, 2)} USD
              </p>
            </div>
          </div>
        </FormCard>

        {!outbound && (
          <FormCard heading="Refund Address" htmlFor="swap-refund-address">
            <div className="flex flex-col gap-1.5">
              <input
                id="swap-refund-address"
                ref={refundRef}
                type="text"
                placeholder="Address to refund if swap fails"
                value={refundAddress}
                onChange={(e) => setRefundAddress(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={twMerge(
                  inputClassName,
                  // 16px on phones: iOS zooms into any smaller field on focus.
                  "h-11 text-base sm:text-sm text-ellipsis",
                  !refundAddress && canPaste && "pr-20",
                  "border-black hover:border-black focus:border-black",
                )}
              />
            </div>
          </FormCard>
        )}

        {outbound && (
          <FormCard
            heading="Recipient Address"
            htmlFor="swap-recipient-address"
          >
            <div className="flex flex-col gap-1.5">
              <input
                id="swap-recipient-address"
                ref={recipientRef}
                type="text"
                placeholder="Address to receive swapped tokens"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={twMerge(
                  inputClassName,
                  // 16px on phones: iOS zooms into any smaller field on focus.
                  "h-11 text-base sm:text-sm text-ellipsis",
                  !refundAddress && canPaste && "pr-20",
                  "border-black hover:border-black focus:border-black",
                )}
              />
            </div>
          </FormCard>
        )}

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
                1 {toToken.symbol} ={" "}
                {atomicToWhole(zecPriceInFrom, fromToken.decimals)}{" "}
                {fromToken.symbol}
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
              <TokenIcon token={fromToken} />
              <div className="flex flex-col items-end">
                <span className="text-lg font-medium">
                  {amountIn} {fromToken.symbol}
                </span>
                <span className="text-xs text-neutral-500">
                  ~ ${amountInUsd.toFixed(2)} USD
                </span>
              </div>
            </div>
            {/* Horizontal Lines with Centered, Overlapping, Transparent Down Arrow */}
            <div className="flex items-center justify-center text-neutral-400 relative z-10">
              <div className="flex-1 h-px bg-line"></div>

              {/* Negative margin (-my-6) makes the arrow extend into the top/bottom divs */}
              <div className="px-4 -my-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="48"
                  viewBox="0 0 24 48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Path stretched to 48px to accommodate the overlap */}
                  <path d="M12 0v48M19 41l-7 7-7-7" />
                </svg>
              </div>

              <div className="flex-1 h-px bg-line"></div>
            </div>
            <div className="flex items-center justify-between">
              <TokenIcon token={toToken} />
              <div className="flex flex-col items-end">
                <span className="text-lg font-medium">
                  {amountOut} {toToken.symbol}
                </span>
                <span className="text-xs text-neutral-500">
                  ~ ${amountOutUsd.toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>
        </FormCard>

        <FormCard heading="Transaction Details">
          <div className="flex flex-col gap-4 text-sm">
            {outbound && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-500">
                  Recipient address
                </span>
                <span className="font-medium">{recipientAddress}</span>
              </div>
            )}

            {!outbound && (
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-500">
                  Refund address
                </span>
                <span className="font-medium">{refundAddress}</span>
              </div>
            )}

            <div className="h-px w-full bg-line" />

            {outbound && sendPlan.plan.data?.fee && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-500">
                    Transfer fee
                  </span>
                  <span className="font-medium">
                    {zatoshiToZec(BigInt(sendPlan.plan.data?.fee))}{" "}
                    {fromToken.symbol}
                  </span>
                </div>

                <div className="h-px w-full bg-line" />

                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-500">
                    Conversion fee
                  </span>
                  <span className="font-medium">
                    {zatoshiToZec(BigInt(conversionFee))} {fromToken.symbol}
                  </span>
                </div>

                <div className="h-px w-full bg-line" />

                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-500">
                    Total fee
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-bold text-black">
                      {zatoshiToZec(
                        conversionFee + BigInt(sendPlan.plan.data?.fee),
                      )}{" "}
                      {fromToken.symbol}
                    </span>
                    <span className="text-xs text-neutral-500">
                      ~ $
                      {atomicToWhole(
                        ((conversionFee + BigInt(sendPlan.plan.data?.fee)) *
                          BigInt(Math.ceil(fromToken.price * 100))) /
                          10n ** BigInt(fromToken.decimals),
                        2,
                      )}{" "}
                      USD
                    </span>
                  </div>
                </div>

                <div className="h-px w-full bg-line" />

                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-700">
                    Total amount taken
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-bold text-black">
                      {zatoshiToZec(
                        amountInBigInt + BigInt(sendPlan.plan.data?.fee),
                      )}{" "}
                      {fromToken.symbol}
                    </span>
                    <span className="text-xs text-neutral-500">
                      ~ $
                      {(
                        amountInUsd +
                        (sendPlan.plan.data?.fee * fromToken.price) /
                          10 ** fromToken.decimals
                      ).toFixed(2)}{" "}
                      USD
                    </span>
                  </div>
                </div>
              </>
            )}

            {!outbound && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-500">
                    Total fee
                  </span>
                  <span className="font-medium">
                    {atomicToWhole(BigInt(conversionFee), fromToken.decimals)}{" "}
                    {fromToken.symbol}
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
                      ~ ${amountInUsd.toFixed(2)} USD
                    </span>
                  </div>
                </div>
              </>
            )}
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
