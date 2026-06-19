# InvoNFT Receivables Console

React + TypeScript + Tailwind frontend for the InvoNFT PRD.

Live demo: https://invonft-sui-receivables.pages.dev/

InvoNFT turns unpaid invoices into programmable Sui receivable objects. Issuers
can create receivables, attach Walrus-backed evidence, list payment rights for
financing, and let the final payer settle directly to the current verified
payment recipient.

The app focuses on product workflow instead of pitch content:

- Receivables command dashboard
- Create receivable flow
- Invoice detail and evidence health score
- Financing marketplace
- Buyer portfolio
- Payer acknowledgement before an invoice can be financed
- Optional USDC security deposits with paid-release and default-claim paths
- Sui dApp Kit wallet connection on Testnet
- Public verification links for Sui objects, transaction digests, and Walrus blobs
- Supabase-backed receivable index so created invoices survive refresh
- Cloudflare Pages Functions API for production index sync without exposing the
  Supabase service role key to the browser
- Shareable `/invoice/:id` URLs for payer/judge review
- Demo issuer, buyer, and payer role controls for walking through the workflow

The repo now also includes a Sui Move package under `move/` for the receivable
object model and payment-right transfer logic.

## Latest Testnet Deployment

- Package ID: `0x44135549f5c650da76f87662848d2a3aa46704a8b231e17cf180220f172190e6`
- InvoiceCounter ID: `0x09435a2fa5ba63b23fef3ae7ca154638e2a48f501b54cad96b7d6cc9d7231340`
- PlatformConfig ID: `0x032312aa87962ed6707babf73871abf64e31cf6c82cb4b5463ac04fc891301f7`
- Platform fee: `100 bps` (1%) to `0xd662f2a8ace3a6e61a50b29766fcd83b4e9f7b364974d738eab3b30550fc8cd4`
- Fee configuration transaction: `4NJ3aZH2oj5zCyJP2QpMT32zgBDybK7tEGrDfA8ww5dp`
- Publish transaction: `D2gkkL1ojxJt91SJADXVZA2Kgj5qwHQar1iQYACenBVz`
- Package explorer:
  https://suiscan.xyz/testnet/object/0x44135549f5c650da76f87662848d2a3aa46704a8b231e17cf180220f172190e6
- Publish transaction explorer:
  https://suiscan.xyz/testnet/tx/D2gkkL1ojxJt91SJADXVZA2Kgj5qwHQar1iQYACenBVz

## Current Implementation State

- Invoice rows are loaded from Supabase, not hardcoded static invoice data.
- `src/data/mockReceivables.ts` only keeps demo wallet labels and default
  verification helpers for the guided workflow.
- Sui Testnet is the settlement/state source for live object actions.
- Supabase provides persistence, filtering, refresh survival, and shareable
  invoice views; anonymous clients have read-only access.
- Verified writes go through the Cloudflare Pages Functions indexer
  API, which verifies the submitted Sui transaction touched the receivable
  object before syncing Supabase.
- Walrus stores invoice/evidence blobs for every created receivable.
- The health score is deterministic product logic, not an AI credit model.
- The marketplace is a custom Sui transaction flow. Sui Kiosk is a future
  marketplace hardening path, not part of this MVP.

## Hackathon Proof Checklist

For judging, use a connected Sui Testnet wallet and the deployed contract env
vars. A fully live proof should show:

1. Create a receivable and capture the Sui transaction digest.
2. Confirm the created `InvoiceReceivable` object opens in Suiscan Testnet.
3. Confirm the evidence package uses a real Walrus blob ID and aggregator link.
4. Acknowledge the invoice from the configured payer wallet.
5. Optionally lock a USDC security deposit and capture its escrow object ID.
6. List the receivable for financing.
7. Buy the receivable from a buyer wallet and confirm `payment_recipient`
   changes to the buyer.
8. Pay the invoice from the configured payer wallet.
9. Confirm final payment routes to the current `payment_recipient`.
10. Release the deposit back to its depositor after payment. Test the separate
    default claim with another receivable after its due date and grace period.
11. Confirm the platform fee lands in the configured fee-recipient wallet during
   the buy/financing step.
12. Refresh the app and confirm the row reloads from the configured index.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Then visit:

```text
http://localhost:5173
```

## Sui Contract Configuration

Copy `.env.example` to `.env` after the Move package in `move/` is published:

```bash
VITE_INVO_APP_MODE=development
VITE_INVO_INDEXER_URL=
VITE_INVO_RECEIVABLE_PACKAGE_ID=0x...
VITE_INVO_RECEIVABLE_MODULE=receivable
VITE_INVO_ESCROW_MODULE=receivable_escrow
VITE_INVO_INVOICE_COUNTER_ID=0x...
VITE_INVO_PLATFORM_CONFIG_ID=0x...
VITE_INVO_PAYMENT_COIN_TYPE=0x...::usdc::USDC
VITE_INVO_PAYMENT_COIN_SYMBOL=USDC
VITE_INVO_PAYMENT_COIN_DECIMALS=6
VITE_INVO_SPONSOR_URL=/api/sponsor
VITE_INVO_SPONSOR_ADDRESS=0x...
VITE_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_WALRUS_STORAGE_EPOCHS=5
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

The frontend has transaction builders for create, acknowledge, list, buy, pay,
cancel, and security-deposit lock/release/claim actions. They require these
values before building real Move calls.

For Cloudflare production, set `VITE_INVO_APP_MODE=production` and
`VITE_INVO_INDEXER_URL=/api`. Add these server-side Cloudflare Pages Function
variables without the `VITE_` prefix:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_side_service_role_key
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
RECEIVABLE_PACKAGE_ID=0x...
RECEIVABLE_MODULE=receivable
RECEIVABLE_ESCROW_MODULE=receivable_escrow
SPONSOR_PRIVATE_KEY=suiprivkey1...
```

`SUPABASE_SERVICE_ROLE_KEY` is a secret. Put it only in Cloudflare Pages
environment variables for Functions. Do not commit it and do not expose it as a
`VITE_*` variable.

`RECEIVABLE_PACKAGE_ID` and `RECEIVABLE_MODULE` are public, but setting them for
Functions lets the API reject unrelated Sui objects before syncing the index.

Walrus URLs are public Testnet endpoints. They are not secrets. Mainnet should
not use a public unauthenticated publisher.

### Client Invoice Email

Production can notify the entered `clientEmail` after a verified
`InvoiceCreated` transaction is synced to the index. Email is sent server-side
from the Cloudflare Pages Function, so the provider key is never exposed to the
browser.

Server-side Cloudflare variables:

```bash
MAILERSEND_API_KEY=mlsn_...
INVOICE_EMAIL_FROM="InvoNFT <invoices@your-domain.com>"
INVOICE_REPLY_TO=support@your-domain.com
INVO_PUBLIC_APP_URL=https://invonft-sui-receivables.pages.dev
```

If `MAILERSEND_API_KEY` or `INVOICE_EMAIL_FROM` is missing, invoice creation
still works and the notification is skipped. Emails are only attempted for the
first successful index sync of an `InvoiceCreated` transaction; rejected wallet
prompts, failed transactions, list/buy/pay actions, and already-indexed invoices
do not send client email.

In development, the current action buttons run in hybrid mode:

- Without a connected wallet and contract env vars, they update the Supabase-backed demo state.
- With a connected wallet, package ID, `InvoiceCounter` ID, and `PlatformConfig`
  ID, create/list/buy/pay can submit Sui transactions through dApp Kit.
- After create succeeds, the frontend waits for the transaction and stores the created
  `InvoiceReceivable` object ID in Supabase.

For the hackathon demo, do not rely on the no-wallet fallback. Use the live
Testnet path and show the public transaction/object links.

Set `VITE_INVO_APP_MODE=production` to block no-wallet receivable creation and
avoid saving local `db:` invoice fallbacks. Production mode also requires the
trusted index API; it does not use direct browser Supabase writes.

## Move Package

The Move package lives in `move/`.

```bash
cd move
sui move build
sui client publish --gas-budget 100000000
```

After publishing to Testnet, copy the package ID, shared `InvoiceCounter`
object ID, and shared `PlatformConfig` object ID into `.env` and the same
Cloudflare Pages environment variables.

## Platform Fee

The Move package creates a shared `PlatformConfig` at publish time. The default
demo fee is `100 bps` (1%) and is charged when a buyer purchases receivable
payment rights. The final payer settlement is not charged, so invoice payment
still routes cleanly to the current payment recipient.

Only the `PlatformConfig` owner can update fee settings:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module receivable \
  --function update_platform_fee \
  --args <PLATFORM_CONFIG_ID> <FEE_RECIPIENT_WALLET> <FEE_BPS> \
  --gas-budget 20000000
```

`100 bps` means 1%, `250 bps` means 2.5%, and the contract caps the demo fee at
`1000 bps` (10%).

## Settlement Coin (USDC)

Receivables are denominated and settled in a stablecoin (**USDC**), while all
transactions run on the **Sui network** and gas is still paid in SUI. The Move
package is generic over the coin type `T` (`InvoiceReceivable<T>`,
`Coin<T>` for buy/pay), and the concrete coin is pinned through
`VITE_INVO_PAYMENT_COIN_TYPE`. The default targets Sui Testnet USDC (Circle);
set the mainnet native USDC type for production.

Implications:

- Wallets need **USDC** to buy/pay and a little **SUI** for gas.
- Amounts use USDC precision (6 decimals). On-chain `*_mist` fields now hold
  USDC base units (`1 USDC = 1_000_000`).
- The frontend passes the coin type as a Move type argument on every call, and
  the indexer derives USDC amounts from chain state.

## Gas Sponsorship (optional)

By default each user's connected wallet pays its own **SUI gas**. With
sponsorship enabled, a backend **sponsor wallet** pays the gas instead, so end
users only need **USDC** — they never have to hold SUI.

How it works:

1. The browser builds the transaction (commands only) and posts it to the
   `functions/api/sponsor.js` Pages Function.
2. The sponsor (a server-held key) sets itself as gas owner, attaches its SUI,
   verifies the call targets the InvoNFT package, and signs.
3. The user's wallet signs the exact sponsored bytes (authorizing their action).
4. The transaction executes with both signatures.

Setup:

```bash
# 1. Create + fund a sponsor wallet with SUI (testnet)
sui client new-address ed25519        # note the address
sui client switch --address <sponsor>; sui client faucet
sui keytool export --key-identity <sponsor>   # copy the suiprivkey1... value
```

- Frontend: set `VITE_INVO_SPONSOR_URL=/api/sponsor`.
- Cloudflare Pages Function env (server-side secret, never `VITE_`):
  `SPONSOR_PRIVATE_KEY=suiprivkey1...` and `RECEIVABLE_PACKAGE_ID=0x...`.

Notes:

- The sponsor endpoint only runs under Cloudflare or `wrangler pages dev`, not
  plain `vite`. Leave `VITE_INVO_SPONSOR_URL` empty for local `vite dev` (the
  wallet pays gas).
- The `SPONSOR_PRIVATE_KEY` is a real secret — keep it only in Cloudflare
  Function env, keep the sponsor wallet topped up with SUI, and the abuse guard
  restricts sponsorship to the configured `RECEIVABLE_PACKAGE_ID`.

## Walrus Evidence

The create flow builds a deterministic evidence JSON package, generates a simple
invoice PDF when no file is attached, computes a `sha256:` metadata checksum,
and uploads both the PDF/file and JSON package to the Walrus Testnet publisher.
If upload fails, the UI falls back to a local placeholder blob ID so the demo
remains usable, but the intended path is always Walrus-backed evidence.

For judging, create at least one receivable with successful Walrus publishing.
The public verification panel should show a real Walrus blob ID and a working
aggregator link. Placeholder blob IDs should be treated as failed uploads.

Walrus Testnet blobs are time-bound. New uploads use
`VITE_WALRUS_STORAGE_EPOCHS`, defaulting to `5`, but older evidence can still
expire and return `404`.

## Public Verification

The selected receivable panel labels each invoice as either demo-local or
on-chain. Real Sui object IDs link to Suiscan Testnet, submitted transaction
digests link to the transaction view, and real Walrus blob IDs link to the
configured aggregator endpoint. Mock IDs are shown but intentionally disabled.

## Local Demo Flow

This flow works best after publishing the Move package and configuring Supabase:

1. Connect a Testnet wallet with SUI.
2. Create a receivable; its evidence is published to Walrus.
3. Confirm the Sui object ID, transaction digest, and index row are present.
4. Connect the configured payer wallet and acknowledge the invoice.
5. Optionally lock a USDC security deposit from any connected wallet.
6. Use the Issuer wallet to list payment rights.
7. Switch to Buyer and buy the listed rights from the marketplace.
8. Switch to Payer and pay the invoice using the configured payer wallet.
9. Reconnect the depositor and release the deposit after payment.
10. Refresh and confirm the state reloads from the configured index.

## Deployment Direction

Cloudflare Pages is fine for the frontend. Build command: `npm run build`.
Output directory: `dist`.

Walrus Sites is the Sui-native static hosting path: deploy the built `dist/`
folder with `site-builder`. It is static-only, so no SSR, no server routes, and
no private environment secrets in the frontend bundle.

See `DEPLOYMENT.md` for the Cloudflare Pages, Sui Testnet, and secret preflight
checklist.

See `SYSTEM_DESIGN.md` for architecture, trust boundaries, source-of-truth
rules, and production guardrails.

## Repository Presentation

Recommended GitHub repo metadata:

- Description: `Programmable invoice receivables on Sui with Walrus evidence and non-custodial payment-right financing.`
- Website: `https://invonft-sui-receivables.pages.dev/`
- Topics: `sui`, `move`, `walrus`, `defi`, `payments`, `rwa`,
  `receivables`, `invoice-financing`, `react`, `vite`, `supabase`
- Add screenshots or a short demo video to the repository description or
  hackathon submission.
- Add a GitHub release for the hackathon submission with the deployed URL,
  package IDs, and demo video link.

## Compliance Note

This hackathon build is a non-custodial Sui Testnet prototype. It does not
provide regulated financial services, underwriting, credit ratings, securities
offerings, investment advice, fiat custody, or real invoice financing.
Production use would require legal review, KYB/KYC, AML screening, jurisdiction
checks, invoice verification, privacy controls, and dispute handling.

## Next Integration Steps

1. Keep Cloudflare Pages env vars aligned with the latest Testnet package,
   `InvoiceCounter`, and `PlatformConfig` IDs.
2. Run one live create -> acknowledge -> deposit -> list -> buy -> pay ->
   release flow on Testnet after every contract republish.
3. Verify platform fees land in the configured fee-recipient wallet during the
   buy/financing step.
4. Expand the production indexer/API if the app needs private search,
   notifications, compliance workflows, or server-controlled access policies.
