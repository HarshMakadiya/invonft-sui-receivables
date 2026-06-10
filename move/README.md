# InvoNFT Move Package

This package contains the Sui Move contract for programmable receivables.

## What It Implements

- Shared `InvoiceCounter` object created at publish time.
- Shared `InvoiceReceivable` objects.
- `create_invoice_receivable`
- `list_for_financing`
- `buy_receivable`
- `pay_invoice`
- `cancel_listing`
- `attach_evidence`
- `mark_overdue`

The critical invariant is:

```text
pay_invoice() transfers the final payment to payment_recipient,
not blindly to the original issuer.
```

## Build

Install the Sui CLI, then run from this folder:

```bash
sui move build
```

## Publish To Testnet

```bash
sui client active-env
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

After publish, copy:

- Published package ID -> `VITE_INVO_RECEIVABLE_PACKAGE_ID`
- Shared `InvoiceCounter` object ID -> `VITE_INVO_INVOICE_COUNTER_ID`

Use these in `.env` and Cloudflare Pages environment variables.
