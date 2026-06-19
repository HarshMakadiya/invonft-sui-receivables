import { toBase64 } from "@mysten/sui/utils";

// Optional gas sponsorship. When VITE_INVO_SPONSOR_URL is set, the app routes
// transactions through a backend sponsor (a server-held wallet that pays the
// SUI gas), so end users only need USDC. When unset, transactions fall back to
// the connected wallet paying its own gas (the wallet needs SUI).
//
// The sponsor endpoint is a Cloudflare Pages Function (functions/api/sponsor.js)
// and only runs under Cloudflare or `wrangler pages dev` — not plain `vite`.
const sponsorUrl = import.meta.env.VITE_INVO_SPONSOR_URL?.trim() ?? "";
const sponsorAddress = import.meta.env.VITE_INVO_SPONSOR_ADDRESS?.trim().toLowerCase() ?? "";

export function isSponsorshipEnabled() {
  return Boolean(sponsorUrl);
}

export function isSponsorWallet(address: string) {
  return Boolean(sponsorAddress && address.toLowerCase() === sponsorAddress);
}

export type SponsoredTransaction = {
  txBytes: string;
  sponsorSignature: string;
  sponsor: string;
};

export async function requestSponsorship(sender: string, transactionKindBytes: Uint8Array): Promise<SponsoredTransaction> {
  const response = await fetch(sponsorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, transactionKindBytes: toBase64(transactionKindBytes) }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || `Sponsor request failed (${response.status})`);
  }

  return (await response.json()) as SponsoredTransaction;
}
