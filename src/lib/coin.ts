// Payment asset configuration.
//
// InvoNFT settles receivables in a stablecoin (USDC) while staying entirely on
// the Sui network: transactions are Sui PTBs and gas is still paid in SUI. Only
// the *settlement coin* (create/list price, buy, and final payment) is USDC.
//
// The Move package is generic over the coin type `T`, so the concrete coin is
// pinned here via env. Defaults target Sui Testnet USDC (Circle). Override
// `VITE_INVO_PAYMENT_COIN_TYPE` for mainnet:
//   mainnet native USDC: 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC
const DEFAULT_TESTNET_USDC_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

export const paymentCoin = {
  /** Fully-qualified Move coin type used as the `T` type argument. */
  type: import.meta.env.VITE_INVO_PAYMENT_COIN_TYPE?.trim() || DEFAULT_TESTNET_USDC_TYPE,
  /** Ticker shown in the UI. */
  symbol: import.meta.env.VITE_INVO_PAYMENT_COIN_SYMBOL?.trim() || "USDC",
  /** Decimal places of the coin. USDC uses 6. */
  decimals: Number(import.meta.env.VITE_INVO_PAYMENT_COIN_DECIMALS ?? 6),
};

const baseUnitFactor = 10 ** paymentCoin.decimals;

/** Convert a human amount (e.g. 750 USDC) to on-chain base units (u64). */
export function toBaseUnits(value: number): bigint {
  return BigInt(Math.round(value * baseUnitFactor));
}

/** Convert on-chain base units to a human amount. */
export function fromBaseUnits(value: bigint | number | string): number {
  return Number(BigInt(value)) / baseUnitFactor;
}

/** Round a human amount to the coin's supported precision. */
export function roundAmount(value: number): number {
  return Math.round(value * baseUnitFactor) / baseUnitFactor;
}
