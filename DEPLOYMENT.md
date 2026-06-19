# InvoNFT Deployment Checklist

Use this before pushing a demo build or sharing the Cloudflare Pages URL.

Live demo URL: https://invonft-sui-receivables.pages.dev/

## Cloudflare Pages

- Framework preset: `React (Vite)` or `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank unless the repo is nested
- Environment variables:
  - `VITE_INVO_APP_MODE=production`
  - `VITE_INVO_RECEIVABLE_PACKAGE_ID`
  - `VITE_INVO_RECEIVABLE_MODULE=receivable`
  - `VITE_INVO_ESCROW_MODULE=receivable_escrow`
  - `VITE_INVO_INVOICE_COUNTER_ID`
  - `VITE_INVO_PLATFORM_CONFIG_ID`
  - `VITE_INVO_PAYMENT_COIN_TYPE`
  - `VITE_INVO_PAYMENT_COIN_SYMBOL=USDC`
  - `VITE_INVO_PAYMENT_COIN_DECIMALS=6`
  - `VITE_INVO_SPONSOR_URL=/api/sponsor`
  - `VITE_INVO_SPONSOR_ADDRESS` (public sponsor wallet address)
  - `VITE_WALRUS_PUBLISHER_URL`
  - `VITE_WALRUS_AGGREGATOR_URL`
  - `VITE_WALRUS_STORAGE_EPOCHS=5`
  - `VITE_INVO_INDEXER_URL=/api`

Only use public IDs and public endpoint URLs in `VITE_*` variables. Private keys,
mnemonics, admin tokens, or publisher credentials must never be committed or put
in frontend environment variables.

Cloudflare Pages Functions server-side variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUI_RPC_URL=https://fullnode.testnet.sui.io:443`
- `RECEIVABLE_PACKAGE_ID`
- `RECEIVABLE_MODULE=receivable`
- `RECEIVABLE_ESCROW_MODULE=receivable_escrow`
- `SPONSOR_PRIVATE_KEY` optional secret used only by the sponsorship Function
- `MAILERSEND_API_KEY` optional, for client invoice email
- `INVOICE_EMAIL_FROM` optional, required when `MAILERSEND_API_KEY` is set
- `INVOICE_REPLY_TO` optional
- `INVO_PUBLIC_APP_URL` optional, used for email invoice links

`SUPABASE_SERVICE_ROLE_KEY` is secret. Store it only as a Cloudflare Pages
environment variable for Functions. Do not add it to any `VITE_*` variable.
`RECEIVABLE_PACKAGE_ID` is public, but setting it server-side lets the Function
reject objects that do not belong to the deployed InvoNFT package.

`MAILERSEND_API_KEY` is also secret. The email notification path runs only after
a verified `InvoiceCreated` transaction is synced, and is skipped when email env
is not configured.

## Sui Testnet

1. Install or use a machine that already has the Sui CLI.
2. Build the Move package:

   ```bash
   cd move
   sui move build
   ```

3. Publish to Testnet:

   ```bash
   sui client publish --gas-budget 100000000
   ```

4. Copy the published package ID, shared `InvoiceCounter` object ID, and shared
   `PlatformConfig` object ID into `.env` locally and Cloudflare Pages
   environment variables.
5. Create a receivable with a connected Testnet wallet.
6. Confirm the created `InvoiceReceivable` object ID is stored in the index.
7. Confirm the Public verification card links to Suiscan and Walrus.

Current public Testnet deployment:

- Package ID: `0x44135549f5c650da76f87662848d2a3aa46704a8b231e17cf180220f172190e6`
- InvoiceCounter ID: `0x09435a2fa5ba63b23fef3ae7ca154638e2a48f501b54cad96b7d6cc9d7231340`
- PlatformConfig ID: `0x032312aa87962ed6707babf73871abf64e31cf6c82cb4b5463ac04fc891301f7`
- Platform fee: `100 bps` (1%) to `0xd662f2a8ace3a6e61a50b29766fcd83b4e9f7b364974d738eab3b30550fc8cd4`
- Fee configuration transaction: `4NJ3aZH2oj5zCyJP2QpMT32zgBDybK7tEGrDfA8ww5dp`
- Publish transaction: `D2gkkL1ojxJt91SJADXVZA2Kgj5qwHQar1iQYACenBVz`

## Live Demo Proof

Before submitting, run one full flow with real wallet signatures:

1. Create receivable on Sui Testnet.
2. Confirm the Sui object ID opens on Suiscan.
3. Confirm the evidence package has a real Walrus blob ID.
4. Acknowledge the receivable from the configured payer wallet.
5. Lock a security deposit and verify the `DepositEscrow` object.
6. List receivable for financing.
7. Buy receivable from a buyer wallet.
8. Confirm the platform fee lands in the configured fee-recipient wallet.
9. Pay invoice from the configured payer wallet.
10. Confirm final funds route to the current `payment_recipient`.
11. Release the security deposit from its depositor wallet.
12. Refresh the deployed app and confirm the indexed row reloads.

Avoid using the no-wallet Supabase fallback for the recorded hackathon demo. It
is useful for UI development, but production mode should use the `/api`
Cloudflare Pages Function indexer and show the live Testnet path.

## Supabase And Indexer

Create a `receivables` table for the app index. For local development, the
frontend can use a publishable/anon key directly. For production, use the
Cloudflare Pages Functions under `functions/api`; they keep the service role key
server-side, verify that a submitted Sui transaction touched the receivable
object, read the current Sui object, and derive chain-authoritative fields
before syncing the row.

Suggested table:

```sql
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  package_id text,
  invoice_id text not null,
  sui_object_id text unique,
  tx_digest text,
  blob_id text,
  issuer_wallet text not null,
  payer_wallet text,
  buyer_wallet text,
  client_name text not null,
  client_email text,
  description text,
  amount_sui numeric not null default 0,
  due_date date,
  status text not null default 'PENDING',
  financing_status text not null default 'NOT_LISTED',
  financing_price_sui numeric not null default 0,
  metadata_checksum text,
  acknowledged_at_ms bigint,
  acknowledged_tx text,
  deposit_escrow_id text,
  deposit_status text,
  deposit_depositor text,
  deposit_amount_sui numeric,
  deposit_grace_period_ms bigint,
  deposit_tx text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration for an existing `receivables` table (adds payer-acknowledgement fields):
-- alter table public.receivables
--   add column if not exists acknowledged_at_ms bigint,
--   add column if not exists acknowledged_tx text;

-- Migration for Layer A security-deposit escrow:
-- alter table public.receivables
--   add column if not exists deposit_escrow_id text,
--   add column if not exists deposit_status text,
--   add column if not exists deposit_depositor text,
--   add column if not exists deposit_amount_sui numeric,
--   add column if not exists deposit_grace_period_ms bigint,
--   add column if not exists deposit_tx text;

-- Package-scoped identity keeps repeated invoice numbers from fresh Testnet
-- deployments separate without deleting historical rows:
-- alter table public.receivables
--   add column if not exists package_id text;
-- create unique index if not exists receivables_package_invoice_idx
--   on public.receivables (package_id, invoice_id)
--   where package_id is not null;

alter table public.receivables enable row level security;

create policy "Allow public read receivable index"
on public.receivables for select
to public
using (true);
```

Keep anonymous access read-only. The Cloudflare Function writes with
`SUPABASE_SERVICE_ROLE_KEY` only after verifying the Sui transaction and object;
do not add public insert or update policies for this table.

After deploy, create a receivable, refresh the page, and confirm it reloads from
the `/api/receivables` index instead of local state.

Positioning: Sui is the settlement and state authority. Supabase is only the
indexing layer for fast UI reads, filters, refresh survival, and shareable
invoice pages. Production writes should go through the server-side indexer/API,
not direct browser RLS writes.

## Platform Fee Check

The frontend needs `VITE_INVO_PLATFORM_CONFIG_ID` so financing purchases can pass
the shared `PlatformConfig` object into `buy_receivable`.

To update the fee recipient or percentage, run this from the package owner
wallet:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module receivable \
  --function update_platform_fee \
  --args <PLATFORM_CONFIG_ID> <FEE_RECIPIENT_WALLET> <FEE_BPS> \
  --gas-budget 20000000
```

`100` fee bps equals 1%. Fees are charged on receivable financing purchases, not
on final invoice payment.

## Walrus Proof

For local development, the app can keep a placeholder blob when Walrus upload is
unavailable. The create flow always attempts Walrus upload. For submission,
create at least one invoice with a real Walrus upload and verify the aggregator
link from the invoice inspector.

Walrus Testnet blobs are time-bound. The frontend uploads with
`VITE_WALRUS_STORAGE_EPOCHS` epochs, defaulting to `5`. If an older invoice shows
`Walrus blob not found`, create a fresh receivable with evidence publishing
enabled.

## GitHub Submission Checklist

- Add the deployed demo URL to the repository About website field.
- Add a concise repo description.
- Add topics: `sui`, `move`, `walrus`, `defi`, `payments`, `rwa`,
  `receivables`, `invoice-financing`, `react`, `vite`.
- Add screenshots and/or demo video to the hackathon submission.
- Create a release containing the deployed URL, package IDs, and demo video link.

## Compliance Note

This hackathon build is a non-custodial Sui Testnet prototype. It does not
provide regulated financial services, underwriting, credit ratings, securities
offerings, investment advice, fiat custody, or real invoice financing.
Production use would require legal review, KYB/KYC, AML screening, jurisdiction
checks, invoice verification, privacy controls, and dispute handling.

## Local Preflight

Run these before pushing:

```bash
npm run build
sui move test
rg -n "(PRIVATE[_-]?KEY|MNEMONI[C]|SECRE[T]|API[_-]?KEY|TOKE[N]|PASSWOR[D]|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+)" . --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json'
```

The search should not return any committed secrets. Public docs URLs and empty
placeholder variable names are fine.
