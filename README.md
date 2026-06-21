# InvoFi Receivables Console

React + TypeScript + Tailwind frontend for the InvoFi PRD.

Live demo: https://invofi.dpdns.org/

InvoFi turns unpaid invoices into programmable Sui receivable objects. Issuers
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
- Full-value USDC settlement escrow with delivery confirmation and timeout refund
- Explainable protocol-history scores derived from verified indexed outcomes
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

- Current package ID (v2): `0x9d23d715ef896b652740efa738185e424094bb83eb982735f1b2283d1b9c0e4a`
- Original package ID / object type identity: `0x44135549f5c650da76f87662848d2a3aa46704a8b231e17cf180220f172190e6`
- InvoiceCounter ID: `0x09435a2fa5ba63b23fef3ae7ca154638e2a48f501b54cad96b7d6cc9d7231340`
- PlatformConfig ID: `0x032312aa87962ed6707babf73871abf64e31cf6c82cb4b5463ac04fc891301f7`
- Platform fee: `100 bps` (1%) to `0xd662f2a8ace3a6e61a50b29766fcd83b4e9f7b364974d738eab3b30550fc8cd4`
- Fee configuration transaction: `4NJ3aZH2oj5zCyJP2QpMT32zgBDybK7tEGrDfA8ww5dp`
- Version 2 upgrade transaction: `Cf7tqkkTDRQ7JZ6BRHp4c9ZQRw6qkWTBWCCBp5A7xZQz`
- Original publish transaction: `D2gkkL1ojxJt91SJADXVZA2Kgj5qwHQar1iQYACenBVz`
- Package explorer:
  https://suiscan.xyz/testnet/object/0x9d23d715ef896b652740efa738185e424094bb83eb982735f1b2283d1b9c0e4a
- Publish transaction explorer:
  https://suiscan.xyz/testnet/tx/D2gkkL1ojxJt91SJADXVZA2Kgj5qwHQar1iQYACenBVz

Layer B three-wallet smoke proof:

- Receivable: `0xf1a5eb71822b6ef2de6c3d9204590c33e4688472044894742c823f0ae9124ebc`
- Create: `EuwMBAn21vwjN7FkCynDW7bXU6qPtvUDP4FQaSh3xiGm`
- Acknowledge: `8Ywd8NmrEpZ9ZLRqTZPVXgWUp4TDDbG3Lo1LPmPeyWmz`
- List: `G5QG1Zwq9C9AKYVpgc6n5vnWnq9yuF7ujSzQCrn1GBUM`
- Finance: `ABnUiGs4q6nZSSPkNFU6HDAreA8XPs6aPRetCK8z5vmm`
- Escrow: `46waMTkeqam2Ppp9y82JV7t5GXgRGoedZQk9jk3atuJ2`
- Confirm delivery: `4Fhcu2WEA8h5gpZp535VSUCDUhhZ8L9sJP85zigNwAKw`
- Release settlement: `4wVrK66YqP1rj6ncN7pH9KdGba3XmQvYxfkg6eE1skgW`

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
- Every create flow attempts to publish invoice and evidence blobs to Walrus.
  Development can retain a placeholder when upload fails; production demos must
  verify a real blob ID.
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
12. On a second invoice, have the payer escrow the full amount, upload delivery
    proof, confirm delivery, and release settlement to the current rights holder.
13. Refresh and confirm escrow state and protocol-history badges reload from the index.

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

Run the regression checks:

```bash
npm run test:score
npm run test:indexer
npm run test:reputation
npm run build
(cd move && sui move test)
```

## Sui Contract Configuration

Copy `.env.example` to `.env` after the Move package in `move/` is published:

```bash
VITE_INVO_APP_MODE=development
VITE_INVO_INDEXER_URL=
VITE_INVO_RECEIVABLE_PACKAGE_ID=0x...
VITE_INVO_ORIGINAL_PACKAGE_ID=0x...
VITE_INVO_SETTLEMENT_ESCROW_PACKAGE_ID=0x...
VITE_INVO_RECEIVABLE_MODULE=receivable
VITE_INVO_ESCROW_MODULE=receivable_escrow
VITE_INVO_INVOICE_COUNTER_ID=0x...
VITE_INVO_PLATFORM_CONFIG_ID=0x...
VITE_INVO_FEE_RECIPIENT=0x...
VITE_INVO_PLATFORM_FEE_BPS=100
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
cancel, mark overdue, security-deposit lock/release/claim, and settlement
escrow/confirm/release/refund. They require these values before building real
Move calls.

For Cloudflare production, set `VITE_INVO_APP_MODE=production` and
`VITE_INVO_INDEXER_URL=/api`. Add these server-side Cloudflare Pages Function
variables without the `VITE_` prefix:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_side_service_role_key
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
RECEIVABLE_PACKAGE_ID=0x...
RECEIVABLE_ORIGINAL_PACKAGE_ID=0x...
RECEIVABLE_MODULE=receivable
RECEIVABLE_ESCROW_MODULE=receivable_escrow
SPONSOR_PRIVATE_KEY=suiprivkey1...
```

`SUPABASE_SERVICE_ROLE_KEY` is a secret. Put it only in Cloudflare Pages
environment variables for Functions. Do not commit it and do not expose it as a
`VITE_*` variable.

`RECEIVABLE_PACKAGE_ID` is the latest package used for Move calls and sponsor
allowlisting. After an upgrade, `RECEIVABLE_ORIGINAL_PACKAGE_ID` remains the
original package identity carried by receivable object types and index rows.
`VITE_INVO_SETTLEMENT_ESCROW_PACKAGE_ID` is the type origin of the Layer B
`SettlementEscrow`; it defaults to the current package and should remain pinned
to the package version that introduced that struct after later upgrades. These
values are public.

Walrus URLs are public Testnet endpoints. They are not secrets. Mainnet should
not use a public unauthenticated publisher.

### Client Invoice Email

Production can notify the entered `clientEmail` after a verified
`InvoiceCreated` transaction is synced to the index. Email is sent server-side
from the Cloudflare Pages Function, so the provider key is never exposed to the
browser.

Server-side Cloudflare variables:

```bash
MAILJET_API_KEY=your_mailjet_api_key
MAILJET_API_SECRET=your_mailjet_api_secret
INVOICE_EMAIL_FROM="InvoFi <invoices@your-domain.com>"
INVOICE_REPLY_TO=support@your-domain.com
INVO_PUBLIC_APP_URL=https://invofi.dpdns.org
SUI_EXPLORER_URL=https://suiscan.xyz/testnet
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

If `MAILJET_API_KEY`, `MAILJET_API_SECRET`, or `INVOICE_EMAIL_FROM` is missing, invoice creation
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

For a first publish, copy the package ID, shared `InvoiceCounter`, and shared
`PlatformConfig` IDs into the environment. For an upgrade, calls and sponsor
allowlisting use the latest package ID while object validation and index filters
continue using the original package ID.

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
   verifies the call targets the InvoFi package, and signs.
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
- The backend refuses requests where the sponsor is also the application actor.
  If that wallet is connected deliberately, the frontend submits a normal
  single-signer transaction and that wallet pays its own gas.

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
8. Choose one terminal path:
   - Direct settlement: Payer pays, then the depositor releases the Layer A bond.
   - Escrowed settlement: Payer escrows the full amount, uploads delivery proof,
     confirms delivery, and releases funds to the current payment recipient.
9. For the Layer B timeout path, leave delivery unconfirmed until the deadline
   and let the payer refund the escrow.
10. Refresh and confirm escrow state and protocol-history badges reload from the index.

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
- Website: `https://invofi.dpdns.org/`
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

## Remaining Production Hardening

1. Add background event replay so missed browser-triggered syncs repair automatically.
2. Add authenticated organizations, payer invitations, and private invoice access.
3. Replace public Testnet Walrus publishing with reliable private/encrypted evidence handling.
4. Add production observability, rate limits, and compliance workflows before Mainnet.

## Documentation Map

- `SYSTEM_DESIGN.md`: current architecture and source-of-truth rules.
- `DEPLOYMENT.md`: current environment, schema, and release checklist.
- `RECEIVABLE_ESCROW_PRD.md`: implemented acknowledgement and Layers A/B/C.
- `PRODUCTION_READINESS.md`: work still required before real users or Mainnet.
- `NFT_ESCROW_EXTENSION_PRD.md`: archived, superseded NFT-collateral proposal.
