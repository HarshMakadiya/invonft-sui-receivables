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
  - `VITE_WALRUS_PUBLISHER_URL`
  - `VITE_WALRUS_AGGREGATOR_URL`

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

4. Copy the published package ID and shared `InvoiceCounter` object ID into
   `.env` locally and Cloudflare Pages environment variables.
5. Create a receivable with a connected Testnet wallet.
6. Import the created `InvoiceReceivable` object ID in the dashboard.
7. Confirm the Public verification card links to Suiscan and Walrus.

## Local Preflight

Run these before pushing:

```bash
npm run build
rg -n "(PRIVATE[_-]?KEY|MNEMONI[C]|SECRE[T]|API[_-]?KEY|TOKE[N]|PASSWOR[D]|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+)" . --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json'
```

The search should not return any committed secrets. Public docs URLs and empty
placeholder variable names are fine.
