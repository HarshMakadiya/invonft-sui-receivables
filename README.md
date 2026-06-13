# InvoNFT Receivables Console

React + TypeScript + Tailwind frontend for the InvoNFT PRD.

The app focuses on product workflow instead of pitch content:

- Receivables command dashboard
- Create receivable flow
- Invoice detail and evidence health score
- Financing marketplace
- Buyer portfolio
- Sui dApp Kit wallet connection on Testnet
- Public verification links for Sui objects, transaction digests, and Walrus blobs
- Supabase-backed receivable index so created invoices survive refresh
- Shareable `/invoice/:id` URLs for payer/judge review
- Demo issuer, buyer, and payer role controls for walking through the workflow

The repo now also includes a Sui Move package under `move/` for the receivable
object model and payment-right transfer logic.

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
VITE_INVO_RECEIVABLE_PACKAGE_ID=0x...
VITE_INVO_RECEIVABLE_MODULE=receivable
VITE_INVO_INVOICE_COUNTER_ID=0x...
VITE_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

The frontend already has transaction-builder placeholders for create, list, buy,
pay, and cancel actions. They intentionally require these values before building
real Move calls.

Walrus URLs are public Testnet endpoints. They are not secrets. Mainnet should
not use a public unauthenticated publisher.

The current action buttons run in hybrid mode:

- Without a connected wallet and contract env vars, they update the Supabase-backed demo state.
- With a connected wallet, package ID, and `InvoiceCounter` ID, create/list/buy/pay
  can submit Sui transactions through dApp Kit.
- After create succeeds, the frontend waits for the transaction and stores the created
  `InvoiceReceivable` object ID in Supabase.

## Move Package

The Move package lives in `move/`.

```bash
cd move
sui move build
sui client publish --gas-budget 100000000
```

After publishing to Testnet, copy the package ID and shared `InvoiceCounter`
object ID into `.env` and the same Cloudflare Pages environment variables.

## Walrus Evidence

The create flow builds a deterministic evidence JSON package, generates a simple
invoice PDF, computes a `sha256:` metadata checksum, and can upload both the PDF
and JSON package to the Walrus Testnet publisher. If upload is disabled or fails,
the UI falls back to a local placeholder blob ID so the demo remains usable.

## Public Verification

The selected receivable panel labels each invoice as either demo-local or
on-chain. Real Sui object IDs link to Suiscan Testnet, submitted transaction
digests link to the transaction view, and real Walrus blob IDs link to the
configured aggregator endpoint. Mock IDs are shown but intentionally disabled.

## Local Demo Flow

This flow works best after publishing the Move package and configuring Supabase:

1. Connect a Testnet wallet with SUI.
2. Create a receivable and optionally publish evidence to Walrus.
3. Confirm the Sui object ID, transaction digest, and Supabase row are present.
4. Use the Issuer role to list payment rights.
5. Switch to Buyer and buy the listed rights from the marketplace.
6. Switch to Payer and pay the invoice using the configured payer wallet.
7. Refresh and confirm the state reloads from Supabase.

## Deployment Direction

Cloudflare Pages is fine for the frontend. Build command: `npm run build`.
Output directory: `dist`.

Walrus Sites is the Sui-native static hosting path: deploy the built `dist/`
folder with `site-builder`. It is static-only, so no SSR, no server routes, and
no private environment secrets in the frontend bundle.

See `DEPLOYMENT.md` for the Cloudflare Pages, Sui Testnet, and secret preflight
checklist.

## Next Integration Steps

1. Publish the Move package to Sui Testnet.
2. Add the package ID, shared `InvoiceCounter` ID, and Supabase env vars to Cloudflare Pages.
3. Run one live create -> list -> buy -> pay flow on Testnet.
4. Add a production indexer/API if the app needs private search, notifications, or compliance workflows.
