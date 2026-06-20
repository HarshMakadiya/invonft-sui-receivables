# InvoFi NFT Escrow Extension PRD

> **Status: archived and not implemented.** This proposal was superseded by
> fungible USDC protection in `RECEIVABLE_ESCROW_PRD.md`: Layer A security
> deposits and Layer B settlement escrow. It remains only as a product-decision
> record and must not be presented as part of the current application workflow.

## Purpose

Add optional NFT collateral escrow to InvoFi so an invoice can be backed by an
on-chain NFT while the USDC invoice remains unpaid. The NFT is locked in a Sui
escrow object and released only after the invoice is paid or resolved through a
future default/dispute path.

This extension is meant for cases where a payer or counterparty does not have
USDC ready at invoice creation time, but can provide an NFT as temporary
collateral. The core settlement asset remains USDC.

## Current System Baseline

InvoFi currently supports:

- Creating `InvoiceReceivable<T>` objects on Sui Testnet.
- Storing invoice/evidence metadata on Walrus.
- Listing receivables for financing.
- Buying receivable payment rights.
- Paying the invoice in the configured settlement coin, currently USDC.
- Routing final invoice payment to `payment_recipient`.
- Charging a platform fee during the buy/financing step.
- Optional gas sponsorship through a Cloudflare Pages Function.

Current payment invariant:

- `pay_invoice<T>` requires `tx_context::sender(ctx) == invoice.payer`.
- The payer must provide the exact invoice amount in `Coin<T>`.
- After payment, funds route to the current `payment_recipient`.

## Problem

Some payers may not have USDC available when the receivable is created or
financed. Without collateral, the buyer/financier has only invoice evidence and
counterparty trust. InvoFi needs a Sui-native way to show that an asset is
locked against the invoice until settlement.

## Goals

- Allow an NFT to be deposited as collateral for a specific invoice receivable.
- Hold the NFT in a Sui escrow object while the invoice is unpaid.
- Release the NFT back to its collateral owner after the invoice is paid in
  USDC.
- Show collateral status in the UI and public verification panel.
- Keep USDC as the primary settlement path.
- Keep gas sponsorship compatible with escrow transactions.
- Avoid introducing private-key custody or centralized NFT custody.

## Non-Goals

- Do not replace USDC settlement with NFT transfer in the first version.
- Do not provide automated NFT valuation.
- Do not claim that the NFT fully covers invoice risk.
- Do not build legal enforcement, KYC/KYB, underwriting, or liquidation markets.
- Do not auto-seize collateral without explicit default/dispute rules.
- Do not require Sui Kiosk for the first escrow MVP.

## User Stories

### Issuer

As an issuer, I want to mark an invoice as NFT-collateralized so buyers can see
that an asset is locked while the invoice is unpaid.

### Payer / Collateral Owner

As a payer, I want to deposit an NFT as collateral when I do not have USDC ready
yet, and get the NFT back after I pay the invoice.

### Buyer / Financier

As a buyer, I want to verify that the collateral NFT is actually locked on-chain
before I buy the receivable payment rights.

### Judge / External Reviewer

As a reviewer, I want public links to the invoice object, escrow object, NFT
object, Walrus evidence, and transaction digests.

## Proposed Product Flow

### Flow A: Create Invoice With NFT Collateral Required

1. Issuer creates invoice receivable with payer wallet and amount.
2. Issuer marks collateral as required.
3. Payer connects wallet and deposits an NFT into escrow.
4. Escrow object links to the invoice object ID.
5. UI shows invoice as `Collateral locked`.
6. Issuer can list receivable for financing.
7. Buyer reviews evidence and escrow links before buying.
8. Payer pays invoice in USDC.
9. NFT unlocks and returns to the original collateral owner.

### Flow B: Add NFT Collateral After Invoice Creation

1. Issuer creates invoice without collateral.
2. Before listing, payer deposits NFT collateral.
3. UI updates invoice collateral status.
4. Issuer lists for financing after collateral is locked.

### Flow C: Invoice Paid

1. Payer submits USDC payment.
2. `pay_invoice` marks invoice as paid and routes USDC to `payment_recipient`.
3. Collateral owner calls `release_after_payment`.
4. Escrow verifies the invoice is paid.
5. NFT transfers back to collateral owner.

Future improvement:

- Release can be bundled into a single PTB after payment if the frontend has the
  escrow object ID and NFT type.

## Move Contract Design

### New Module

Add a new Move module:

```text
invofi::nft_escrow
```

The module should be separate from `receivable.move` so invoice settlement logic
stays simple and escrow can evolve independently.

### Proposed Escrow Object

```move
public struct NftCollateralEscrow<phantom CoinT, NftT: key + store> has key, store {
    id: UID,
    invoice_id: ID,
    collateral_owner: address,
    beneficiary: address,
    nft_type_name: String,
    status: u8,
    created_at_ms: u64,
    released_at_ms: u64,
    nft: Option<NftT>,
}
```

Status values:

```text
0 = LOCKED
1 = RELEASED
2 = CLAIMED_DEFAULT
3 = CANCELLED
```

### Proposed Entry Functions

```move
public entry fun deposit_nft_collateral<CoinT, NftT: key + store>(
    invoice: &InvoiceReceivable<CoinT>,
    nft: NftT,
    beneficiary: address,
    ctx: &mut TxContext,
)
```

Behavior:

- Sender becomes `collateral_owner`.
- Invoice must be unpaid.
- Escrow stores the NFT.
- Escrow records invoice ID and beneficiary.
- Escrow object is shared or transferred according to final design.

```move
public entry fun release_after_payment<CoinT, NftT: key + store>(
    escrow: NftCollateralEscrow<CoinT, NftT>,
    invoice: &InvoiceReceivable<CoinT>,
    ctx: &mut TxContext,
)
```

Behavior:

- Invoice ID must match escrow invoice ID.
- Invoice status must be `PAID`.
- Sender must be `collateral_owner`.
- NFT is transferred back to collateral owner.
- Escrow emits `CollateralReleased`.

Future function:

```move
public entry fun claim_after_default<CoinT, NftT: key + store>(
    escrow: NftCollateralEscrow<CoinT, NftT>,
    invoice: &InvoiceReceivable<CoinT>,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

This should not be enabled until product/legal rules are explicit. If added, it
must define who can claim, when default occurs, and whether disputes block claim.

### Required Receivable Module Additions

The escrow module needs safe read-only accessors from `receivable.move`:

```move
public fun id<T>(invoice: &InvoiceReceivable<T>): ID
public fun payer<T>(invoice: &InvoiceReceivable<T>): address
public fun issuer<T>(invoice: &InvoiceReceivable<T>): address
public fun due_date_ms<T>(invoice: &InvoiceReceivable<T>): u64
```

Existing accessors already include:

```move
status<T>
payment_recipient<T>
amount_mist<T>
```

### Events

Add events for indexing and UI:

```move
public struct CollateralDeposited has copy, drop {
    escrow_id: ID,
    invoice_id: ID,
    collateral_owner: address,
    beneficiary: address,
    nft_type_name: String,
}

public struct CollateralReleased has copy, drop {
    escrow_id: ID,
    invoice_id: ID,
    collateral_owner: address,
}

public struct CollateralClaimed has copy, drop {
    escrow_id: ID,
    invoice_id: ID,
    claimant: address,
}
```

## Frontend Requirements

### Create / Detail UI

Add collateral fields:

- `Collateral required` toggle.
- `Collateral status`: none, required, locked, released, default-eligible.
- NFT object ID input for MVP, wallet NFT picker later.
- Escrow object link.
- NFT object link.

### Buyer Marketplace

Show collateral signal on listed invoices:

- `NFT collateral locked`
- NFT type / collection label if available.
- Escrow object verification link.

### Invoice Inspector

Add a `Collateral` panel:

- Escrow status.
- Collateral owner.
- Beneficiary/payment recipient.
- NFT object ID.
- Deposit transaction.
- Release transaction.

### Actions

Add wallet actions:

- `Deposit NFT collateral`
- `Release collateral after payment`
- Future: `Claim collateral after default`

### Gas Sponsorship

Sponsorship should support escrow calls:

- Allow calls into `invofi::nft_escrow`.
- Continue allowing only safe Sui framework coin/object helper calls.
- Keep sponsor max gas budget.
- Do not sponsor arbitrary NFT transfers outside escrow calls.

## Indexing / Supabase Changes

Add optional fields to receivable index:

```text
collateral_required boolean
collateral_status text
escrow_object_id text
collateral_object_id text
collateral_type text
collateral_owner text
collateral_beneficiary text
collateral_deposit_tx text
collateral_release_tx text
```

Indexer should derive these from Sui events where possible, not trust browser
payload alone.

## Walrus Evidence Changes

Evidence package should include collateral metadata when present:

```json
{
  "collateral": {
    "required": true,
    "status": "LOCKED",
    "escrowObjectId": "0x...",
    "nftObjectId": "0x...",
    "nftType": "0x...::collection::NFT",
    "collateralOwner": "0x..."
  }
}
```

Walrus remains evidence storage only. The NFT itself is held by Sui escrow.

## Security and Risk Notes

- An NFT escrow is collateral, not guaranteed liquidity.
- The app should not imply the NFT value equals invoice value unless valuation is
  externally verified.
- Arbitrary NFT types may contain custom transfer rules. MVP should support
  standard Sui objects with `key + store`, and UI should warn for unsupported
  types.
- Default/claim logic is legally sensitive and should be off by default until
  rules are clear.
- Escrow release must verify invoice ID and paid status.
- Sponsor guard must not allow arbitrary object transfers just because a
  transaction includes one valid escrow call.
- If the payer is also the buyer/payment recipient, payment can net out in a way
  that looks confusing in balance changes. Demo should use separate wallets.

## Acceptance Criteria

### MVP Acceptance

- A payer can deposit an NFT into escrow for a live invoice.
- The escrow object publicly references the invoice ID.
- Buyer can verify escrow object from the invoice detail page.
- Invoice can still be listed, bought, and paid in USDC.
- After invoice payment, collateral owner can release NFT back to their wallet.
- Public verification panel shows invoice, latest transaction, Walrus evidence,
  escrow, and NFT links.
- Sponsor gas works for escrow deposit/release transactions.

### Testnet Demo Acceptance

Run a complete Testnet demo with three wallets:

```text
Issuer: creates and lists invoice
Buyer: buys payment rights
Payer/collateral owner: deposits NFT and pays invoice
Sponsor: pays SUI gas
```

Required proof links:

- Create invoice transaction.
- Deposit NFT collateral transaction.
- Escrow object link.
- List rights transaction.
- Buy rights transaction.
- Pay invoice transaction.
- Release NFT collateral transaction.

## Implementation Phases

### Phase 1: Contract PRD and Tests

- Add escrow module design.
- Add Move unit tests for deposit and release.
- Add negative tests for wrong invoice, unpaid invoice release, wrong caller.

### Phase 2: Move Contract

- Implement `nft_escrow.move`.
- Add receivable accessors.
- Publish new package to Testnet.
- Update `.env` package IDs.

### Phase 3: Frontend Transaction Builders

- Add escrow transaction builders.
- Add NFT object ID input for MVP.
- Add public verification links.
- Update sponsor allowlist for escrow package/module.

### Phase 4: Indexing and Evidence

- Store escrow metadata in Supabase index.
- Derive collateral status from Sui events.
- Add collateral metadata to Walrus evidence package.

### Phase 5: Demo Hardening

- Run full three-wallet Testnet flow.
- Verify sponsor gas for all escrow and invoice transactions.
- Add README demo checklist and screenshots.

## Open Questions

- Who is allowed to deposit collateral: payer only, issuer only, or any wallet?
- Should collateral owner always be the payer, or can a third party provide NFT
  collateral?
- Should unpaid/defaulted invoices allow the buyer/payment recipient to claim
  the NFT, or should default require manual dispute resolution?
- Do we need collection allowlists for acceptable NFT collateral?
- Should payment be allowed by anyone on behalf of the payer to make collateral
  release easier?
- Should release happen automatically in the same PTB as `pay_invoice`, or as a
  separate explicit action?
