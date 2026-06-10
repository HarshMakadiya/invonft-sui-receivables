# InvoNFT Receivables Console

React + TypeScript + Tailwind frontend for the InvoNFT PRD.

The app focuses on product workflow instead of pitch content:

- Receivables command dashboard
- Create receivable flow
- Invoice detail and evidence health score
- Financing marketplace
- Buyer portfolio
- Sui dApp Kit wallet connection on Testnet
- Mock issuer, buyer, and payer roles for demo flow simulation

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
```

The frontend already has transaction-builder placeholders for create, list, buy,
pay, and cancel actions. They intentionally require these values before building
real Move calls.

Walrus URLs are public Testnet endpoints. They are not secrets. Mainnet should
not use a public unauthenticated publisher.

The current action buttons run in hybrid mode:

- Without a connected wallet and contract env vars, they update the local demo state.
- With a connected wallet, package ID, and `InvoiceCounter` ID, create/list/buy/pay
  can submit Sui transactions through dApp Kit.

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

The create flow can now build a deterministic evidence JSON package and compute
a `sha256:` metadata checksum. The form has an optional checkbox to upload that
JSON to the Walrus Testnet publisher. If the upload is disabled or fails, the UI
falls back to a local mock blob ID so the demo remains usable.

## Deployment Direction

Cloudflare Pages is fine for the frontend. Build command: `npm run build`.
Output directory: `dist`.

Walrus Sites is the Sui-native static hosting path: deploy the built `dist/`
folder with `site-builder`. It is static-only, so no SSR, no server routes, and
no private environment secrets in the frontend bundle.

## Next Integration Steps

1. Replace mock invoice storage with Sui object reads.
2. Replace simulated evidence with Walrus upload/download.
3. Convert mock actions into Sui transaction builders.
4. Add Move package constants and published package configuration.
