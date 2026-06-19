# InvoNFT Move Package

This package contains the Sui Move contract for programmable receivables.

## What It Implements

- Shared `InvoiceCounter` object created at publish time.
- Shared `PlatformConfig` object created at publish time.
- Shared `InvoiceReceivable` objects.
- `create_invoice_receivable`
- `list_for_financing`
- `buy_receivable`
- `pay_invoice`
- `cancel_listing`
- `attach_evidence`
- `mark_overdue`
- `update_platform_fee`
- `acknowledge_invoice`
- `receivable_escrow::lock_deposit`
- `receivable_escrow::release_deposit`
- `receivable_escrow::claim_deposit`

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

## Test

```bash
sui move test
```

The tests cover the core demo invariants: financing updates the payment
recipient, only the configured payer can pay, and paid invoices cannot be paid
again. They also cover owner-controlled platform fee updates, cancel listing,
evidence updates, invalid financing prices, payer acknowledgement, and security
deposit release/default-claim authorization and timing.

## Publish To Testnet

```bash
sui client active-env
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

After publish, copy:

- Published package ID -> `VITE_INVO_RECEIVABLE_PACKAGE_ID`
- Shared `InvoiceCounter` object ID -> `VITE_INVO_INVOICE_COUNTER_ID`
- Shared `PlatformConfig` object ID -> `VITE_INVO_PLATFORM_CONFIG_ID`

Use these in `.env` and Cloudflare Pages environment variables.

## Platform Fee

`PlatformConfig` stores:

- `owner`: wallet allowed to update the fee config
- `fee_recipient`: wallet that receives platform fees
- `fee_bps`: fee in basis points

The default fee is `100 bps`, which is 1%. `buy_receivable` splits that fee from
the buyer's financing payment and transfers the remainder to the invoice issuer.
`pay_invoice` does not charge a platform fee; it sends the final invoice amount
to the current `payment_recipient`.

Update the fee config from the owner wallet:

```bash
sui client call \
  --package <PACKAGE_ID> \
  --module receivable \
  --function update_platform_fee \
  --args <PLATFORM_CONFIG_ID> <FEE_RECIPIENT_WALLET> <FEE_BPS> \
  --gas-budget 20000000
```
