import type {
  Quote,
  QuoteResponse,
} from "@defuse-protocol/one-click-sdk-typescript";
import {
  OneClickService,
  QuoteRequest,
  TokenResponse,
} from "@defuse-protocol/one-click-sdk-typescript";
import type { DefaultError, UseMutateFunction } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCode } from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { AmountDisplay } from "../components/AmountInput";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { FormPage } from "../components/FormPage";
import { TransactionReceipt } from "../components/TransactionReceipt";
import {
  AmountField,
  BalanceWithMax,
  FormCard,
  FormError,
  SubmitBlock,
} from "../components/TransferForm";
import { ActionButton } from "../components/ui/ActionButton";
import { inputClassName, qrClassName } from "../components/ui/utils";
import { useAccount } from "../hooks/useAccount";
import { useFreshAddress } from "../hooks/useAddresses";
import { useGetBalance } from "../hooks/useGetBalance";
import { getSwaps } from "../hooks/useGetSwaps";
import { useGetTokens } from "../hooks/useGetTokens";
import { useSend, useSendPlan } from "../hooks/useSend";
import type { StageEntry } from "../hooks/useSubmitStage";
import { useWallet } from "../hooks/useWallet";
import { AaveIcon } from "../icons/AaveIcon";
import { AbstractIcon } from "../icons/AbstractIcon";
import { AdiIcon } from "../icons/AdiIcon";
import { AleoIcon } from "../icons/AleoIcon";
import { AptosIcon } from "../icons/AptosIcon";
import { ArbitrumIcon } from "../icons/ArbitrumIcon";
import { AuroraIcon } from "../icons/AuroraIcon";
import { AvalancheIcon } from "../icons/AvalancheIcon";
import { BaseIcon } from "../icons/BaseIcon";
import { BerachainIcon } from "../icons/BerachainIcon";
import { BitcoinCashIcon } from "../icons/BitcoinCashIcon";
import { BitcoinIcon } from "../icons/BitcoinIcon";
import { BnbIcon } from "../icons/BnbIcon";
import { CardanoIcon } from "../icons/CardanoIcon";
import { ChainlinkIcon } from "../icons/ChainlinkIcon";
import { CoinbaseWrappedBitcoinIcon } from "../icons/CoinbaseWrappedBitcoinIcon";
import { CowProtocolIcon } from "../icons/CowProtocolIcon";
import { DaiIcon } from "../icons/DaiIcon";
import { DashIcon } from "../icons/DashIcon";
import { DogecoinIcon } from "../icons/DogecoinIcon";
import { EthenaUSDeIcon } from "../icons/EthenaUSDeIcon";
import { EthereumIcon } from "../icons/EthereumIcon";
import { FogoIcon } from "../icons/FogoIcon";
import { FraxIcon } from "../icons/FraxIcon";
import { GmxIcon } from "../icons/GmxIcon";
import { GnosisIcon } from "../icons/GnosisIcon";
import { HapiIcon } from "../icons/HapiIcon";
import { HyperliquidIcon } from "../icons/HyperliquidIcon";
import { KyberNetworkIcon } from "../icons/KyberNetworkIcon";
import { LitecoinIcon } from "../icons/LitecoinIcon";
import { MogCoinIcon } from "../icons/MogCoinIcon";
import { MonadIcon } from "../icons/MonadIcon";
import { MoneriumEURIcon } from "../icons/MoneriumEURIcon";
import { MovementIcon } from "../icons/MovementIcon";
import { NearIcon } from "../icons/NearIcon";
import { NproIcon } from "../icons/NproIcon";
import { OkxIcon } from "../icons/OkxIcon";
import { OptimismIcon } from "../icons/OptimismIcon";
import { PepeIcon } from "../icons/PepeIcon";
import { PlasmaIcon } from "../icons/PlasmaIcon";
import { PolygonIcon } from "../icons/PolygonIcon";
import { RobinhoodChainIcon } from "../icons/RobinhoodChainIcon";
import { SafeIcon } from "../icons/SafeIcon";
import { ScrollIcon } from "../icons/ScrollIcon";
import { ShibaInuIcon } from "../icons/ShibaInuIcon";
import { SolanaIcon } from "../icons/SolanaIcon";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { Spx6900Icon } from "../icons/Spx6900Icon";
import { StarknetIcon } from "../icons/StarknetIcon";
import { StellarIcon } from "../icons/StellarIcon";
import { SuiIcon } from "../icons/SuiIcon";
import { SwapIcon } from "../icons/SwapIcon";
import { SweatIcon } from "../icons/SweatIcon";
import { TetherGoldIcon } from "../icons/TetherGoldIcon";
import { TetherIcon } from "../icons/TetherIcon";
import { ToncoinIcon } from "../icons/ToncoinIcon";
import { TronIcon } from "../icons/TronIcon";
import { UniswapIcon } from "../icons/UniswapIcon";
import { UnknownIcon } from "../icons/UnknownIcon";
import { USDCoinIcon } from "../icons/USDCoinIcon";
import { WrappedBitcoinIcon } from "../icons/WrappedBitcoinIcon";
import { XrpIcon } from "../icons/XrpIcon";
import { ZcashIcon } from "../icons/ZcashIcon";
import {
  atomicToWhole,
  scaledBigIntAdd,
  scaledBigIntDiv,
  scaledBigIntMul,
  scaledBigIntScale,
  scaledBigIntSub,
  scaledBigIntToWhole,
  shortenAddress,
  wholeToAtomic,
  wholeToScaledBigInt,
  zatoshiToZec,
} from "../lib/utils";
import type { PendingTx } from "../lib/wallet/types";
const Stage = {
  Swap: "SWAP",
  ReviewQuote: "REVIEW_QUOTE",
  DepositAmount: "DEPOSIT_AMOUNT",
  SendAmount: "SEND_AMOUNT",
};

const SLIPPAGE_DECIMALS = 2;
const USD_DECIMALS = 2;

const HOUR_MS = 60 * 60 * 1000;
/**
 * How long a quote's deposit has to be sent and mined in, by origin chain.
 * 1Click begins refunding at the deadline, and its deposit address goes
 * inactive, so the window must cover the user sending from their wallet,
 * the chain mining it, and a margin. Chains with 10-minute blocks can take
 * well over an hour to mine a deposit, or longer with a low fee.
 */
const DEPOSIT_WINDOW_MS: Partial<Record<string, number>> = {
  btc: 3 * HOUR_MS,
  bch: 3 * HOUR_MS,
};
/** Every other chain mines a deposit within minutes. */
const DEFAULT_DEPOSIT_WINDOW_MS = HOUR_MS;

/** When refunds begin for a quote paid on the given blockchain. */
function depositDeadline(blockchain: TokenResponse.blockchain) {
  const span = DEPOSIT_WINDOW_MS[blockchain] ?? DEFAULT_DEPOSIT_WINDOW_MS;
  return new Date(Date.now() + span);
}

const ZEC_TOKEN_ASSET_ID = "nep141:zec.omft.near";
// The default symbol logo displayed when proper logo is not found
const UNKNOWN_SYMBOL_LOGO: React.JSX.Element = <UnknownIcon />;
// The default blockchain logo displayed when proper logo is not found
const UNKNOWN_BLOCKCHAIN_LOGO: React.JSX.Element = <UnknownIcon />;
// Map blockchains to logo paths
const blockchainLogos = new Map<string, React.JSX.Element>([
  [TokenResponse.blockchain.ADI, <AdiIcon />],
  [TokenResponse.blockchain.ALEO, <AleoIcon />],
  [TokenResponse.blockchain.APTOS, <AptosIcon />],
  [TokenResponse.blockchain.ARB, <ArbitrumIcon />],
  [TokenResponse.blockchain.AVAX, <AvalancheIcon />],
  [TokenResponse.blockchain.BASE, <BaseIcon />],
  [TokenResponse.blockchain.BCH, <BitcoinCashIcon />],
  [TokenResponse.blockchain.BERA, <BerachainIcon />],
  [TokenResponse.blockchain.BSC, <BnbIcon />],
  [TokenResponse.blockchain.BTC, <BitcoinIcon />],
  [TokenResponse.blockchain.CARDANO, <CardanoIcon />],
  [TokenResponse.blockchain.DASH, <DashIcon />],
  [TokenResponse.blockchain.DOGE, <DogecoinIcon />],
  [TokenResponse.blockchain.ETH, <EthereumIcon />],
  [TokenResponse.blockchain.GNOSIS, <GnosisIcon />],
  [TokenResponse.blockchain.HYPERCORE, <HyperliquidIcon />],
  [TokenResponse.blockchain.LTC, <LitecoinIcon />],
  [TokenResponse.blockchain.MONAD, <MonadIcon />],
  [TokenResponse.blockchain.MOVEMENT, <MovementIcon />],
  [TokenResponse.blockchain.NEAR, <NearIcon />],
  [TokenResponse.blockchain.OP, <OptimismIcon />],
  [TokenResponse.blockchain.PLASMA, <PlasmaIcon />],
  [TokenResponse.blockchain.POL, <PolygonIcon />],
  [TokenResponse.blockchain.SCROLL, <ScrollIcon />],
  [TokenResponse.blockchain.SOL, <SolanaIcon />],
  [TokenResponse.blockchain.STARKNET, <StarknetIcon />],
  [TokenResponse.blockchain.STELLAR, <StellarIcon />],
  [TokenResponse.blockchain.SUI, <SuiIcon />],
  [TokenResponse.blockchain.TON, <ToncoinIcon />],
  [TokenResponse.blockchain.TRON, <TronIcon />],
  [TokenResponse.blockchain.XLAYER, <OkxIcon />],
  [TokenResponse.blockchain.XRP, <XrpIcon />],
  [TokenResponse.blockchain.ZEC, <ZcashIcon />],
  // Chains the SDK's TokenResponse.blockchain enum doesn't list yet.
  ["abs", <AbstractIcon />],
  ["fogo", <FogoIcon />],
  ["hood", <RobinhoodChainIcon />],
]);
// Map cryptocurrency symbols to logo paths. Wrapped and bridged tokens share
// the logo of the asset they represent.
const symbolLogos = new Map<string, React.JSX.Element>([
  ["AAVE", <AaveIcon />],
  ["ADA", <CardanoIcon />],
  ["ADI", <AdiIcon />],
  ["ALEO", <AleoIcon />],
  ["APT", <AptosIcon />],
  ["ARB", <ArbitrumIcon />],
  ["AURORA", <AuroraIcon />],
  ["AVAX", <AvalancheIcon />],
  ["BCH", <BitcoinCashIcon />],
  ["BERA", <BerachainIcon />],
  ["BNB", <BnbIcon />],
  ["BTC", <BitcoinIcon />],
  ["cbBTC", <CoinbaseWrappedBitcoinIcon />],
  ["COW", <CowProtocolIcon />],
  ["DAI", <DaiIcon />],
  ["DASH", <DashIcon />],
  ["DOGE", <DogecoinIcon />],
  ["ETH", <EthereumIcon />],
  ["EURe", <MoneriumEURIcon />],
  ["FOGO", <FogoIcon />],
  ["FRAX", <FraxIcon />],
  ["GMX", <GmxIcon />],
  ["GNO", <GnosisIcon />],
  ["GRAM", <ToncoinIcon />],
  ["HAPI", <HapiIcon />],
  ["KNC", <KyberNetworkIcon />],
  ["LINK", <ChainlinkIcon />],
  ["LTC", <LitecoinIcon />],
  ["MOG", <MogCoinIcon />],
  ["MON", <MonadIcon />],
  ["MOVE", <MovementIcon />],
  ["NEAR", <NearIcon />],
  ["NPRO", <NproIcon />],
  ["OKB", <OkxIcon />],
  ["OP", <OptimismIcon />],
  ["PEPE", <PepeIcon />],
  ["POL", <PolygonIcon />],
  ["SAFE", <SafeIcon />],
  ["SHIB", <ShibaInuIcon />],
  ["SOL", <SolanaIcon />],
  ["SPX", <Spx6900Icon />],
  ["STRK", <StarknetIcon />],
  ["SUI", <SuiIcon />],
  ["SWEAT", <SweatIcon />],
  ["TRX", <TronIcon />],
  ["UNI", <UniswapIcon />],
  ["USDC", <USDCoinIcon width={64} height={64} />],
  ["USDe", <EthenaUSDeIcon />],
  ["USDT", <TetherIcon />],
  ["wBTC", <WrappedBitcoinIcon />],
  ["WBTC", <WrappedBitcoinIcon />],
  ["WETH", <EthereumIcon />],
  ["wNEAR", <NearIcon />],
  ["XAUT", <TetherGoldIcon />],
  ["XLM", <StellarIcon />],
  ["XPL", <PlasmaIcon />],
  ["XRP", <XrpIcon />],
  ["ZEC", <ZcashIcon />],
]);
// 1Click marks some tokens with a parenthesised suffix, as in "BNB(DEPRECATED)",
// "XPL_(DEPRECATED)" or "BTC(OMNI)". They take the logo of the bare symbol.
function symbolLogo(symbol: string) {
  return (
    symbolLogos.get(symbol) ??
    symbolLogos.get(symbol.replace(/_?\(\w+\)$/, "")) ??
    UNKNOWN_SYMBOL_LOGO
  );
}

export const Route = createFileRoute("/swap")({
  component: SwapRoute,
});

// Construct an icon for the given token. Visually it contains two images:
// a small logo representing the blockchain on which the token resides, and
// a bigger logo representing the cryptocurrency. When a logo cannot be found
// a default logo is displayed.
function TokenIcon({ token }: { token: TokenResponse }) {
  return (
    <div className="relative inline-flex">
      {/* Main cryptocurrency logo */}
      {symbolLogo(token.symbol)}
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

// Construct a labelled icon for the given token: an icon on the left and
// the token's symbol above the token's blockchain on the right.
function LabelledTokenIcon({ token }: { token: TokenResponse }) {
  return (
    <div
      className="flex items-center gap-3"
      title={`${token.symbol} on ${token.blockchain}`}
    >
      {/* The icon on the left. */}
      <TokenIcon token={token} />
      {/* The label on the right. */}
      <div className="flex flex-col items-start">
        {/* Abbreviate the symbol so the drop-down is not too wide. */}
        <span className="font-bold">{abbreviateString(token.symbol, 5)}</span>
        {/* The blockchain on which the token is residing. */}
        <span className="text-xs text-neutral-500">{token.blockchain}</span>
      </div>
    </div>
  );
}

// Display a drop-down element for selecting tokens. It displays the given
// token, and when a different token is selected in the drop-down, the given
// lambda is called. If readOnly is true, then the arrow disappears and a
// drop-down is no longer displayed upon clicks. The drop-down menu is
// populated by the supplied list of tokens.
function CurrencySelector({
  tokens,
  token,
  setToken,
  readOnly = false,
  onChange,
}: {
  tokens: TokenResponse[];
  token: TokenResponse;
  setToken: (token: TokenResponse) => void;
  readOnly?: boolean;
  onChange: (token?: TokenResponse) => void;
}) {
  // Represents whether the drop-down is currently open or not
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
      {/* The currently selected item in the drop-down. */}
      <button
        type="button"
        disabled={readOnly}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-card p-3 text-sm focus:border-black focus:outline-none"
      >
        <LabelledTokenIcon token={token} />
        {!readOnly && <span className="text-gray-400">▼</span>}
      </button>
      {/* The drop-down list populated by the supplied tokens. */}
      {dropdownOpen && (
        <div className="absolute z-10 w-full min-w-max mt-1 bg-card border border-line rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {tokens.map((c: TokenResponse) => (
            <button
              key={c.assetId}
              type="button"
              onClick={() => {
                if (onChange && c !== token) onChange(c);
                // Button click sets the actively displayed token
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

// Display a form allowing a user to select the input amount and currency and also
// the output currency of a swap. The form automatically displays what output amount
// the user should expect to get.
function SwapForm({
  onSubmit,
  setFromToken,
  setToToken,
  fromToken,
  toToken,
  isOutbound,
  setIsOutbound,
  fromAmount,
  setFromAmount,
  refundAddress,
  setRefundAddress,
  slippage,
  setSlippage,
  error,
  setError,
  recipientAddress,
  setRecipientAddress,
}: {
  onSubmit: () => void;
  setFromToken: (token: TokenResponse) => void;
  setToToken: (token: TokenResponse) => void;
  fromToken: TokenResponse;
  toToken: TokenResponse;
  isOutbound: boolean;
  setIsOutbound: (isOutbound: boolean) => void;
  fromAmount: string;
  setFromAmount: (amount: string) => void;
  refundAddress: string;
  setRefundAddress: (address: string) => void;
  slippage: string;
  setSlippage: (slippage: string) => void;
  error: string | undefined;
  setError: (error: string | undefined) => void;
  recipientAddress: string;
  setRecipientAddress: (address: string) => void;
}) {
  const account = useAccount();
  const shielded = useFreshAddress();
  const balance = useGetBalance();
  const tokensQuery = useGetTokens();
  const tokens = tokensQuery.data ?? [];
  const [recipientAddressError, setRecipientAddressError] = useState<
    string | undefined
  >();
  const [refundAddressError, setRefundAddressError] = useState<
    string | undefined
  >();
  const from = "shielded";

  // Attempt to convert the input amount into a big integer
  let amountInBigInt = 0n;
  let amountInError: string | undefined;
  try {
    amountInBigInt = wholeToAtomic(fromAmount, fromToken.decimals);
  } catch {
    amountInError = "Not a valid amount";
  }
  let slippageError: string | undefined;
  try {
    if (wholeToAtomic(slippage, SLIPPAGE_DECIMALS) <= 0n) {
      slippageError = "Slippage tolerance must be positive";
    }
  } catch {
    slippageError =
      "Slippage tolerance must be positive, with up to 2 decimal places";
  }

  // Compute the transaction fee that will be applied to the swap. This is only
  // used for outbound transfers.
  const sendPlan = useSendPlan(
    {
      from,
      to: account.transparent.address,
      // Mask the input amount for inbound transfers
      amount: isOutbound ? amountInBigInt : 0n,
      memo: undefined,
    },
    false,
    0n,
  );
  // Also compute the maximum amount that can be spent. THis is only used for
  // outbound transfers.
  const maxSendPlan = useSendPlan(
    {
      from,
      to: account.transparent.address,
      // Mask the input amount for inbound transfers
      amount: isOutbound ? amountInBigInt : 0n,
      memo: undefined,
    },
    true,
    0n,
  );
  // Disable the usage of balances that are not confirmed
  const waitingBalance = 0n;
  // Max is the whole balance: what's spendable now, plus what's confirming.
  const maxAmount = maxSendPlan.maxAmount.data
    ? maxSendPlan.maxAmount.data + waitingBalance
    : maxSendPlan.maxAmount.isError && waitingBalance
      ? waitingBalance
      : undefined;
  amountInError ??= sendPlan.ceiling ? sendPlan.plan.error?.message : undefined;

  // Refresh the chosen tokens' prices from the list, cached or just fetched.
  useEffect(() => {
    if (!tokensQuery.data) return;
    setFromToken(
      tokensQuery.data.find((token) => token.assetId === fromToken.assetId) ??
        fromToken,
    );
    setToToken(
      tokensQuery.data.find((token) => token.assetId === toToken.assetId) ??
        toToken,
    );
  }, [tokensQuery.data]);

  // Report a list that couldn't be fetched, once per failure.
  useEffect(() => {
    const error = tokensQuery.error;
    if (!error) return;
    setError(
      (error as { body?: { message?: string } }).body?.message ||
        error.message ||
        "Failed to fetch tokens",
    );
  }, [tokensQuery.error]);

  // Compute the currency conversions
  const fromTokenPriceAtomic = wholeToScaledBigInt(fromToken.price);
  const toTokenPriceAtomic = wholeToScaledBigInt(toToken.price);
  const totalPrice = scaledBigIntMul(
    [amountInBigInt, fromToken.decimals],
    fromTokenPriceAtomic,
  );
  const toAmount = scaledBigIntDiv(
    totalPrice,
    toTokenPriceAtomic,
    toToken.decimals,
  );
  // One `toToken` in `fromToken`'s atomic units: the rate shown below.
  const toPriceInFrom = scaledBigIntDiv(
    toTokenPriceAtomic,
    fromTokenPriceAtomic,
    fromToken.decimals,
  );

  // Swap the from amount and token with the to amount and token. Additionally
  // the refund address is needed from the user for inbound swaps whereas a
  // recipient address is needed for outbound swaps.
  const reverseExchange = () => {
    const tmpToken = fromToken;
    const tmpAmount = scaledBigIntToWhole(toAmount);
    setFromToken(toToken);
    setToToken(tmpToken);
    setFromAmount(tmpAmount);
    if (!isOutbound) {
      // Outbound transfer refunds are automatically returned to this wallet.
      // So only the recipient address is required from the user.
      setRecipientAddress("");
      setRefundAddress(shielded ?? "");
    } else {
      // Inbound transfers automatically directed to this wallet. So only the
      // refund address is required from the user.
      setRecipientAddress(shielded ?? "");
      setRefundAddress("");
    }
    setIsOutbound(!isOutbound);
  };

  // If the token data is still loading, then display a spinner instead
  if (tokensQuery.isPending) {
    return (
      <div className="size-52 grid place-items-center">
        <SpinnerIcon className="size-5 text-gold" />
      </div>
    );
  }

  return (
    <FormPage
      title="Swap"
      onSubmit={() => {
        if (isOutbound && recipientAddress === "") {
          setRecipientAddressError("Set a recipient address");
        } else if (!isOutbound && refundAddress === "") {
          setRefundAddressError("Set a refund address");
        } else if (!amountInError && !error && !slippageError) {
          // If an error is asserted for the amount input or a global error, say,
          // from another screen.
          onSubmit();
        }
      }}
    >
      <FormCard
        heading="From"
        htmlFor="swap-from-amount"
        aside={
          // Display the maximum sendable amount and a button to effect it
          isOutbound && (
            <div id="swap-available">
              <BalanceWithMax
                balance={balance.data?.[from].balance ?? 0n}
                waiting={waitingBalance}
                pool={from}
                isMax={amountInBigInt === maxAmount}
                onToggleMax={() => {
                  if (maxAmount !== undefined) {
                    // maxAmount is in zatoshi: outbound, the from token is ZEC.
                    setFromAmount(atomicToWhole(maxAmount, fromToken.decimals));
                  }
                }}
              />
            </div>
          )
        }
      >
        {/* Input amount and currency selector. */}
        <div className="flex flex-row items-start gap-4 w-full">
          <CurrencySelector
            tokens={tokens}
            token={fromToken}
            setToken={setFromToken}
            readOnly={isOutbound}
            onChange={() => {
              setError(undefined);
            }}
          />

          <div className="flex flex-1 flex-col gap-1.5 min-w-0 text-right w-full">
            <AmountField
              id="swap-from-amount"
              value={fromAmount}
              // The balance beside it shows only when sending ZEC out.
              describedBy={isOutbound ? "swap-available" : undefined}
              unit=""
              onChange={(v) => {
                setFromAmount(v);
                setError(undefined);
              }}
              error={amountInError}
            />
            <p className="px-1 text-xs text-neutral-500">
              ~ $
              {scaledBigIntToWhole(
                scaledBigIntScale(totalPrice, USD_DECIMALS),
                true,
              )}{" "}
              USD
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
          <SwapIcon />
        </button>

        <div className="flex-1 h-px bg-line"></div>
      </div>

      {/* Output amount and currency selector. */}
      <FormCard heading="To">
        <div className="flex flex-row items-start gap-4 w-full">
          <CurrencySelector
            tokens={tokens}
            token={toToken}
            setToken={setToToken}
            readOnly={!isOutbound}
            onChange={() => {
              setError(undefined);
            }}
          />

          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <AmountDisplay value={scaledBigIntToWhole(toAmount)} unit="" />
            <p className="px-1 text-xs text-neutral-500 text-right w-full">
              ~ $
              {scaledBigIntToWhole(
                scaledBigIntScale(totalPrice, USD_DECIMALS),
                true,
              )}{" "}
              USD
            </p>
          </div>
        </div>
      </FormCard>

      {/* Inbound transfers require a refund address from the user. */}
      {!isOutbound && (
        <FormCard heading="Refund Address" htmlFor="swap-refund-address">
          <div className="flex flex-col gap-1.5">
            <input
              id="swap-refund-address"
              aria-describedby={
                refundAddressError ? "swap-refund-address-error" : undefined
              }
              aria-invalid={Boolean(refundAddressError)}
              type="text"
              placeholder="Address to refund if swap fails"
              value={refundAddress}
              onChange={(e) => {
                setRefundAddress(e.target.value);
                setError(undefined);
                setRefundAddressError(undefined);
              }}
              autoComplete="off"
              spellCheck={false}
              className={twMerge(
                inputClassName,
                // 16px on phones: iOS zooms into any smaller field on focus.
                "h-11 text-base sm:text-sm text-ellipsis",
                "border-black hover:border-black focus:border-black",
              )}
            />
          </div>
          <div
            id="swap-refund-address-error"
            aria-live="polite"
            className="mt-2.5 empty:mt-0 flex items-center gap-1.5 text-xs font-medium"
          >
            {refundAddressError && (
              <span
                key={refundAddressError}
                role="alert"
                className={twMerge(
                  "flex items-center gap-1.5 motion-safe:animate-fade-in",
                  "text-red-700",
                )}
              >
                {refundAddressError}
              </span>
            )}
          </div>
        </FormCard>
      )}

      {/* Outbound transfers require a recipient addresss from the user. */}
      {isOutbound && (
        <FormCard heading="Recipient Address" htmlFor="swap-recipient-address">
          <div className="flex flex-col gap-1.5">
            <input
              id="swap-recipient-address"
              aria-describedby={
                recipientAddressError
                  ? "swap-recipient-address-error"
                  : undefined
              }
              aria-invalid={Boolean(recipientAddressError)}
              type="text"
              placeholder="Address to receive swapped tokens"
              value={recipientAddress}
              onChange={(e) => {
                setRecipientAddress(e.target.value);
                setError(undefined);
                setRecipientAddressError(undefined);
              }}
              autoComplete="off"
              spellCheck={false}
              className={twMerge(
                inputClassName,
                // 16px on phones: iOS zooms into any smaller field on focus.
                "h-11 text-base sm:text-sm text-ellipsis",
                "border-black hover:border-black focus:border-black",
              )}
            />
          </div>
          <div
            id="swap-recipient-address-error"
            aria-live="polite"
            className="mt-2.5 empty:mt-0 flex items-center gap-1.5 text-xs font-medium"
          >
            {recipientAddressError && (
              <span
                key={recipientAddressError}
                role="alert"
                className={twMerge(
                  "flex items-center gap-1.5 motion-safe:animate-fade-in",
                  "text-red-700",
                )}
              >
                {recipientAddressError}
              </span>
            )}
          </div>
        </FormCard>
      )}

      <FormCard heading="Swap Settings">
        <div className="flex flex-col gap-4">
          {/* Solicit the slippage tolerance from the user. */}
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="swap-slippage"
              className="text-sm font-medium text-neutral-700"
            >
              Slippage tolerance (%)
            </label>
            <input
              id="swap-slippage"
              aria-describedby={
                slippageError ? "swap-slippage-error" : undefined
              }
              aria-invalid={Boolean(slippageError)}
              type="number"
              min="0.01"
              step="0.01"
              value={slippage}
              onChange={(e) => {
                setSlippage(e.target.value);
                setError(undefined);
              }}
              className={twMerge(
                inputClassName,
                // 16px on phones: iOS zooms into any smaller field on focus.
                "h-11 w-24 text-base sm:text-sm text-ellipsis",
                "border-black hover:border-black focus:border-black",
              )}
            />
          </div>

          <div
            id="swap-slippage-error"
            aria-live="polite"
            className="mt-2.5 empty:mt-0 flex items-center gap-1.5 text-xs font-medium"
          >
            {slippageError && (
              <span
                key={slippageError}
                role="alert"
                className={twMerge(
                  "flex items-center gap-1.5 motion-safe:animate-fade-in",
                  "text-red-700",
                )}
              >
                {slippageError}
              </span>
            )}
          </div>

          {/* Display the value of the to cryptocurrency in terms of the from. */}
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">Rate</span>
            <span className="font-medium">
              1 {toToken.symbol} = {scaledBigIntToWhole(toPriceInFrom)}{" "}
              {fromToken.symbol}
            </span>
          </div>
        </div>
      </FormCard>

      <ActionButton
        size="md"
        className="w-full h-12"
        backgroundColor="black"
        textColor="white"
      >
        Get a quote
      </ActionButton>
      {error && <FormError>{error}</FormError>}
    </FormPage>
  );
}

/**
 * The conversion fee in the from token's atomic units: the difference between
 * the US dollar values of the input and output amounts.
 */
function conversionFeeOf(quote: Quote, fromToken: TokenResponse) {
  const priceUsd = wholeToScaledBigInt(fromToken.price);
  // Computed on render now, so a price of 0 must not throw.
  if (priceUsd[0] <= 0n) return 0n;
  const amountInUsd = wholeToScaledBigInt(quote.amountInUsd);
  const amountOutUsd = wholeToScaledBigInt(quote.amountOutUsd);
  const fee = scaledBigIntSub(amountInUsd, amountOutUsd);
  // Finally convert the fee into the given token
  return scaledBigIntDiv(fee, priceUsd, fromToken.decimals)[0];
}

// This form requests a quote for the currency exchange specified by the user and
// displays the response. Essentially the input and output amount and currencies are
// displayed and the fees are broken down. The user is left to decide whether to
// proceed.
function QuoteReview({
  fromToken,
  fromAmount,
  refundAddress,
  slippage,
  quoteResponse,
  setQuoteResponse,
  toToken,
  isOutbound,
  send,
  recipientAddress,
  onFailure,
  onConfirm,
  onSubmit,
  children,
}: {
  fromToken: TokenResponse;
  fromAmount: string;
  refundAddress: string;
  slippage: string;
  /** The quote under review; null until one is fetched, which then lands here. */
  quoteResponse: QuoteResponse | null;
  setQuoteResponse: (quoteResponse: QuoteResponse) => void;
  toToken: TokenResponse;
  isOutbound: boolean;
  recipientAddress: string;
  onFailure: ({ message }: { message: string }) => void;
  onConfirm: (isOutgoing: boolean) => void;
  onSubmit: (sendData: PendingTx) => void;
  children: React.JSX.Element;
  send: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    stages: StageEntry[];
    isPending: boolean;
    error: Error | null;
    mutate: UseMutateFunction<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any,
      DefaultError,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any,
      unknown
    >;
  };
}) {
  // Long enough for a deposit on the origin chain to be sent and mined.
  const [deadline] = useState(() => depositDeadline(fromToken.blockchain));
  // Everything shown comes from the quote, so a quote kept across screens
  // shows exactly as it did when it was fetched.
  const quote = quoteResponse?.quote;
  const amountInUsd = wholeToScaledBigInt(quote?.amountInUsd ?? "0");
  const amountOutUsd = wholeToScaledBigInt(quote?.amountOutUsd ?? "0");
  const conversionFee = quote ? conversionFeeOf(quote, fromToken) : 0n;
  const amountInBigInt = BigInt(quote?.amountIn ?? "0");

  // Once an outbound transfer has been successfully created, let the onConfirm
  // handler choose what to do.
  useEffect(() => {
    if (isOutbound && send.data) {
      onSubmit(send.data);
    }
  }, [isOutbound, send.data]);

  {
    /* The send plan is required to compute the transaction fees. */
  }
  const sendPlan = useSendPlan(
    {
      from: "shielded",
      to: quote?.depositAddress ?? "",
      amount: amountInBigInt,
      memo: undefined,
    },
    false,
    0n,
  );

  const onConfirmAux = () => {
    // Let the onConfirm handler choose what to do with the confirmation
    onConfirm(isOutbound);
    if (isOutbound) {
      // Initiate the outbound transfer to the exchange deposit address
      const memo = `Swap ${quote?.amountInFormatted ?? "0"} ${fromToken.symbol} for ${toToken.symbol}.`;
      send.mutate({
        from: "shielded",
        to: quote?.depositAddress ?? "",
        amount: amountInBigInt,
        memo: undefined,
        shown: {
          tx_type: "Sent",
          value: -amountInBigInt,
          from: { pool: "shielded" },
          to: { address: quote?.depositAddress ?? "" },
          memo,
        },
      });
    }
  };

  // Fetch a quote only when none was handed over. "Get a quote" clears it, so
  // new inputs always get a new quote; going back to this screen keeps the old
  // one and with it the deposit address the user may already have paid.
  useEffect(() => {
    if (quoteResponse) return;
    // A fetch whose screen has gone (Back, or StrictMode's dev remount) must
    // neither save its quote nor report its failure.
    let cancelled = false;
    const quoteRequest = {
      dry: false,
      swapType: QuoteRequest.swapType.EXACT_INPUT,
      slippageTolerance: Number(wholeToAtomic(slippage, SLIPPAGE_DECIMALS)),
      originAsset: fromToken.assetId,
      depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
      destinationAsset: toToken.assetId,
      amount: wholeToAtomic(fromAmount, fromToken.decimals).toString(),
      recipient: recipientAddress,
      recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
      refundTo: refundAddress,
      refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
      deadline: deadline.toISOString(),
    };

    // Request a quote from One Click given the exchange amounts and currencies
    // from the previous screen.
    OneClickService.getQuote(quoteRequest)
      .then((data: QuoteResponse) => {
        if (!cancelled) setQuoteResponse(data);
      })
      .catch((error) => {
        if (cancelled) return;
        onFailure({
          message:
            error.body?.message || error.message || "Failed to fetch quote",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    quoteResponse,
    fromAmount,
    fromToken,
    refundAddress,
    slippage,
    recipientAddress,
    toToken,
  ]);

  // If the quote data is still loading, then display a spinner instead
  if (!quoteResponse) {
    return (
      <div className="size-52 grid place-items-center">
        <SpinnerIcon className="size-5 text-gold" />
      </div>
    );
  }

  return (
    <FormPage title="Review Quote" onSubmit={onConfirmAux}>
      <FormCard heading="Swap Summary">
        <div className="flex flex-col gap-4">
          {/* Display the chosen input amount and currency. */}
          <div className="flex items-center justify-between">
            <TokenIcon token={fromToken} />
            <div className="flex flex-col items-end">
              <span className="text-lg font-medium">
                {quote?.amountInFormatted ?? "0"} {fromToken.symbol}
              </span>
              <span className="text-xs text-neutral-500">
                ~ $
                {scaledBigIntToWhole(
                  scaledBigIntScale(amountInUsd, USD_DECIMALS),
                  true,
                )}{" "}
                USD
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
          {/* Display the chosen output amount and currency. */}
          <div className="flex items-center justify-between">
            <TokenIcon token={toToken} />
            <div className="flex flex-col items-end">
              <span className="text-lg font-medium">
                {quote?.amountOutFormatted ?? "0"} {toToken.symbol}
              </span>
              <span className="text-xs text-neutral-500">
                ~ $
                {scaledBigIntToWhole(
                  scaledBigIntScale(amountOutUsd, USD_DECIMALS),
                  true,
                )}{" "}
                USD
              </span>
            </div>
          </div>
        </div>
      </FormCard>

      <FormCard heading="Transaction Details">
        <div className="flex flex-col gap-4 text-sm">
          {/* Outbound transfers have their refund address fixed to this wallet.
          So only display the recipient address that the user chose. */}
          {isOutbound && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-500">
                Recipient address
              </span>
              <span className="font-medium break-all">{recipientAddress}</span>
            </div>
          )}

          {/* Inbound transfers have their recipient address fixed to this wallet.
          So only display the refund address that the user chose. */}
          {!isOutbound && (
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-500">
                Refund address
              </span>
              <span className="font-medium break-all">{refundAddress}</span>
            </div>
          )}

          <div className="h-px w-full bg-line" />

          {/* Outbound transfers incur two fees: the conversion fee and the Zcash
          transaction fee. Display these two components and their sum. */}
          {isOutbound && sendPlan.plan.data?.fee && (
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
                <span className="font-medium text-neutral-500">Total fee</span>
                <div className="flex flex-col items-end">
                  <span className="text-lg font-bold text-black">
                    {zatoshiToZec(
                      conversionFee + BigInt(sendPlan.plan.data?.fee),
                    )}{" "}
                    {fromToken.symbol}
                  </span>
                  <span className="text-xs text-neutral-500">
                    ~ $
                    {scaledBigIntToWhole(
                      scaledBigIntScale(
                        scaledBigIntMul(
                          [
                            conversionFee + BigInt(sendPlan.plan.data?.fee),
                            fromToken.decimals,
                          ],
                          wholeToScaledBigInt(fromToken.price),
                        ),
                        USD_DECIMALS,
                      ),
                      true,
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
                    {scaledBigIntToWhole(
                      scaledBigIntScale(
                        scaledBigIntAdd(
                          amountInUsd,
                          scaledBigIntMul(
                            [
                              BigInt(sendPlan.plan.data?.fee),
                              fromToken.decimals,
                            ],
                            wholeToScaledBigInt(fromToken.price),
                          ),
                        ),
                        USD_DECIMALS,
                      ),
                      true,
                    )}{" "}
                    USD
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Inbound transfers are simpler since this wallet only has to handle the
          conversion fee. The originating chain is the one that has to deal with the
          transaction fee. Therefore no breakdown is required. */}
          {!isOutbound && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-500">Total fee</span>
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
                    {quote?.amountInFormatted ?? "0"} {fromToken.symbol}
                  </span>
                  <span className="text-xs text-neutral-500">
                    ~ $
                    {scaledBigIntToWhole(
                      scaledBigIntScale(amountInUsd, USD_DECIMALS),
                      true,
                    )}{" "}
                    USD
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </FormCard>

      <div className="flex gap-3">
        {children}
        {/* Display the status of the outbound transfer. */}
        <div className="flex-1">
          <SubmitBlock
            label="Confirm"
            pending={send.isPending}
            pendingLabel={"Confirming..."}
            color={"gold-button"}
            stages={send.stages}
            error={send.error?.message}
          ></SubmitBlock>
        </div>
      </div>
    </FormPage>
  );
}

// A screen that requests a user to deposit the given amount at the given
// deposit address. Both a QR code and copyable address are displayed. This
// This screen is only used for inbound transfers.
function AmountDeposit({
  amountIn,
  amountInUsd,
  fromToken,
  depositAddress,
  children,
}: {
  amountIn: string;
  amountInUsd: string;
  fromToken: TokenResponse;
  depositAddress: string;
  children: React.JSX.Element;
}) {
  return (
    <FormPage title="Deposit Funds">
      <section aria-label="Your address" className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-6 py-4">
          {/* Display the amount that needs to be deposited at the deposit address. */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Deposit Amount
            </span>
            <span className="text-3xl font-bold text-black">
              {amountIn} {fromToken.symbol}
            </span>
            <span className="text-sm font-medium text-neutral-500">
              ~ $
              {scaledBigIntToWhole(
                scaledBigIntScale(
                  wholeToScaledBigInt(amountInUsd),
                  USD_DECIMALS,
                ),
                true,
              )}{" "}
              USD
            </span>
          </div>

          {/* Display the QR code of the deposit address. */}
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
            {/* Display the copyable deposit address. */}
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
          {children}
          {/* Allow the user to confirm that they have deposited and put this transaction in
          the background. */}
          <ActionButton href="/">I've sent the funds</ActionButton>
        </div>
      </section>
    </FormPage>
  );
}

// A series of screens that allow users to specify and effect both inbound and outbound
// cryptocurrency swaps.
function SwapRoute() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const shielded = useFreshAddress();
  // The default from token to use before the available tokens have been received
  // from the One Click endpoint.
  const [fromToken, setFromToken] = useState<TokenResponse>({
    assetId: "nep141:btc.omft.near",
    symbol: "BTC",
    blockchain: TokenResponse.blockchain.BTC,
    price: 73978,
    priceUpdatedAt: "2026-11-11T11:20:05.389Z",
    coingeckoId: "bitcoin",
    decimals: 8,
  });
  const [error, setError] = useState<string | undefined>();
  const [fromAmount, setFromAmount] = useState("0");
  const [refundAddress, setRefundAddress] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [slippage, setSlippage] = useState("0.5");
  // The default to token to use before the available tokens have been received
  // from the One Click endpoint.
  const [toToken, setToToken] = useState<TokenResponse>({
    assetId: ZEC_TOKEN_ASSET_ID,
    decimals: 8,
    blockchain: TokenResponse.blockchain.ZEC,
    symbol: "ZEC",
    price: 1315.9,
    priceUpdatedAt: "2026-11-06T13:22:31.003Z",
    coingeckoId: "zcash",
  });

  const [isOutbound, setIsOutbound] = useState(false);
  const [stage, setStage] = useState(Stage.Swap);
  // The quote being reviewed, kept here so it survives screen changes: going
  // back from the deposit screen must show the same deposit address.
  const [quoteResponse, setQuoteResponse] = useState<QuoteResponse | null>(
    null,
  );
  const quote = quoteResponse?.quote;

  const send = useSend();

  useEffect(() => {
    (async () => {
      if (!isOutbound && shielded !== undefined && shielded !== "") {
        setRecipientAddress(shielded);
      }
    })();
  }, [shielded, isOutbound]);

  if (stage == Stage.Swap) {
    // Step one: solicit the user to enter the amount and cryptocurrency they
    // want to exchange
    const onGetQuote = () => {
      // Forget any earlier quote so ReviewQuote fetches one for these inputs.
      setQuoteResponse(null);
      // Move to the ReviewQuote screen
      setStage(Stage.ReviewQuote);
    };

    return (
      <SwapForm
        onSubmit={onGetQuote}
        setFromToken={setFromToken}
        setToToken={setToToken}
        fromToken={fromToken}
        toToken={toToken}
        isOutbound={isOutbound}
        setIsOutbound={setIsOutbound}
        fromAmount={fromAmount}
        setFromAmount={setFromAmount}
        refundAddress={refundAddress}
        setRefundAddress={setRefundAddress}
        slippage={slippage}
        setSlippage={setSlippage}
        error={error}
        setError={setError}
        recipientAddress={recipientAddress}
        setRecipientAddress={setRecipientAddress}
      />
    );
  } else if (stage == Stage.ReviewQuote) {
    // Step two: display the quote provided by the One Click endpoint, break down
    // the swap fees, and get the user to confirm whether they'd like to proceed.
    const onFailure = (data: { message: string }) => {
      setError(data.message);
      setStage(Stage.Swap);
    };

    const onSubmit = (sendData: PendingTx) => {
      if (!quote?.depositAddress) {
        throw new Error(
          "onSubmit has been triggered when the quote has not yet been prepared",
        );
      }
      // Record the outbound transaction ID to deduplicate entries in the
      // transaction history.
      // Asked about once stored, so the new swap's row appears straight away.
      void wallet
        .pushSwap(quote?.depositAddress, isOutbound, [
          { hash: sendData.txid, explorerUrl: "" },
        ])
        .then(() => queryClient.invalidateQueries(getSwaps(wallet)));
      // Move to the SendAmount screen.
      setStage(Stage.SendAmount);
    };

    const onConfirm = (isOutbound: boolean) => {
      if (!quote?.depositAddress) {
        throw new Error(
          "onConfirm has been triggered when the quote has not yet been prepared",
        );
      }
      // Record the swap address so that this wallet can monitor it in the background
      // and provide status updates
      void wallet
        .pushSwap(quote?.depositAddress, isOutbound, [])
        .then(() => queryClient.invalidateQueries(getSwaps(wallet)));
      if (!isOutbound) {
        // Move to the deposit amount screen
        setStage(Stage.DepositAmount);
      }
    };

    return (
      <QuoteReview
        fromToken={fromToken}
        quoteResponse={quoteResponse}
        setQuoteResponse={setQuoteResponse}
        toToken={toToken}
        send={send}
        recipientAddress={recipientAddress}
        fromAmount={fromAmount}
        slippage={slippage}
        refundAddress={refundAddress}
        isOutbound={isOutbound}
        onFailure={onFailure}
        onConfirm={onConfirm}
        onSubmit={onSubmit}
      >
        {/* Provide a back button in case the user would like to modify the cryptocurrency
        exchange. */}
        <button
          type="button"
          onClick={() => setStage(Stage.Swap)}
          className="rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-neutral-50 focus:border-black focus:outline-none"
        >
          Back
        </button>
      </QuoteReview>
    );
  } else if (stage == Stage.DepositAmount) {
    // Step three: display amount the user needs to deposit and the address they
    // need to deposit at. Activated only for inbound transfers.
    if (!quote?.depositAddress) {
      throw new Error(
        "Deposit amount screen rendered when the quote has not yet been prepared",
      );
    }

    return (
      <AmountDeposit
        amountInUsd={quote?.amountInUsd ?? "0"}
        amountIn={quote?.amountInFormatted ?? "0"}
        fromToken={fromToken}
        depositAddress={quote?.depositAddress}
      >
        {/* Only a quote has been provided so far. So everything is reversible and the
        user can return to the quote screen. */}
        <button
          type="button"
          onClick={() => setStage(Stage.ReviewQuote)}
          className="rounded-xl border border-line bg-card px-6 py-3 text-sm font-medium transition-colors hover:bg-neutral-50 focus:border-black focus:outline-none"
        >
          Back
        </button>
      </AmountDeposit>
    );
  } else if (send.data && stage == Stage.SendAmount) {
    // Step three: the outbound transfer has already been submitted, so just
    // print the Zcash transaction rreceipt.
    return <TransactionReceipt tx={{ ...send.data, status: "Pending" }} />;
  }
}
