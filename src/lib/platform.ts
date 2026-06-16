import { roundAmount } from "./coin";

// Platform fee shown in the UI. This MUST mirror the on-chain `PlatformConfig`
// (`fee_recipient`, `fee_bps`) for the display to match where funds actually
// settle. The fee is charged on financing purchase only (never on final payer
// settlement). Set the on-chain value with `update_platform_fee` so chain and
// UI agree.
const DEFAULT_FEE_RECIPIENT =
  "0xd662f2a8ace3a6e61a50b29766fcd83b4e9f7b364974d738eab3b30550fc8cd4";

export const platformFee = {
  /** Wallet that receives the platform fee on financing purchases. */
  recipient: import.meta.env.VITE_INVO_FEE_RECIPIENT?.trim() || DEFAULT_FEE_RECIPIENT,
  /** Fee in basis points (100 = 1%). Matches the contract default. */
  bps: Number(import.meta.env.VITE_INVO_PLATFORM_FEE_BPS ?? 100),
};

/** Split a financing price into platform fee and issuer proceeds. */
export function feeBreakdown(financingPrice: number) {
  const fee = roundAmount((financingPrice * platformFee.bps) / 10_000);
  return {
    bps: platformFee.bps,
    percent: platformFee.bps / 100,
    recipient: platformFee.recipient,
    fee,
    issuerNet: roundAmount(financingPrice - fee),
  };
}
