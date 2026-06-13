# InvoNFT Deployment Checklist

Use this before pushing a demo build or sharing the Cloudflare Pages URL.

## Cloudflare Pages

- Framework preset: `React (Vite)` or `None`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank unless the repo is nested
- Environment variables:
  - `VITE_INVO_RECEIVABLE_PACKAGE_ID`
  - `VITE_INVO_RECEIVABLE_MODULE=receivable`
  - `VITE_INVO_INVOICE_COUNTER_ID`
  - `VITE_INVO_PLATFORM_CONFIG_ID`
  - `VITE_WALRUS_PUBLISHER_URL`
  - `VITE_WALRUS_AGGREGATOR_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

Only use public IDs and public endpoint URLs in `VITE_*` variables. Private keys,
mnemonics, admin tokens, or publisher credentials must never be committed or put
in frontend environment variables.

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
6. Confirm the created `InvoiceReceivable` object ID is stored in Supabase.
7. Confirm the Public verification card links to Suiscan and Walrus.

## Supabase

Create a `receivables` table with public read/write RLS policies for the demo
index. Only use the publishable/anon key in frontend environments. Never use a
`service_role` key in Cloudflare Pages or any `VITE_*` variable.

Suggested demo table:

```sql
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null unique,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.receivables enable row level security;

create policy "demo read receivables"
on public.receivables for select
to anon
using (true);

create policy "demo insert receivables"
on public.receivables for insert
to anon
with check (true);

create policy "demo update receivables"
on public.receivables for update
to anon
using (true)
with check (true);
```

After deploy, create a receivable, refresh the page, and confirm it reloads from
Supabase instead of local state.

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

## Local Preflight

Run these before pushing:

```bash
npm run build
sui move test
rg -n "(PRIVATE[_-]?KEY|MNEMONI[C]|SECRE[T]|API[_-]?KEY|TOKE[N]|PASSWOR[D]|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+)" . --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json'
```

The search should not return any committed secrets. Public docs URLs and empty
placeholder variable names are fine.
