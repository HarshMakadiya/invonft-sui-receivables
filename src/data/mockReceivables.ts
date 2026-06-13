import type { DemoWallet, Evidence, WalletRole } from "../types/receivable";

export const wallets: Record<WalletRole, DemoWallet> = {
  issuer: { label: "Issuer", address: "0xissuer...7a1", balance: 1440 },
  buyer: { label: "Buyer", address: "0xbuyer...4d2", balance: 2180 },
  payer: { label: "Payer", address: "0xpayer...91c", balance: 1250 },
};

export function evidence(options: { complete: boolean; unpaid: boolean }): Evidence {
  return {
    invoicePdf: true,
    lineItemsMatch: true,
    payerWalletPresent: true,
    dueDateValid: true,
    unpaid: options.unpaid,
    evidenceComplete: options.complete,
    walrusAvailable: true,
  };
}
