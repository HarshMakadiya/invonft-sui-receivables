# Receivable Escrow & Trust Layer — Design (A + B + C)

## Context & thesis

InvoFi settles B2B invoice receivables in USDC on Sui (create →
list → buy payment rights → pay). The competitive field (Centrifuge, Huma,
Goldfinch, Credix) competes on **liquidity pools and off-chain underwriting**.
None make the **buyer ↔ payer ↔ issuer trust** trustless at the protocol level.

That is the wedge. We keep the escrow primitive we built (a conditional,
invoice-linked vault with a status lifecycle and time-gating) but drop the NFT
framing and have it hold **`Balance<CoinT>` (USDC)**. The pitch becomes:

> **Factoring where trust is enforced by code, not credit checks.**

The trust stack (each layer attacks a real factoring fraud/risk vector that
evidence alone does not):
- **Phase 0 — Payer acknowledgement.** The payer cryptographically attests the debt is real *before* it can be financed. Directly attacks fake invoices and double-financing — the core fraud vectors. Highest-leverage differentiator and a prerequisite the rest builds on.
- **A — USDC security deposit / bond.** Real, fungible downside protection for the buyer.
- **B — Escrowed settlement.** Payer escrows funds upfront; released on delivery. Removes payer-default risk.
- **C — Protocol-history reputation.** An indexer-derived score compounded from
  on-chain acknowledgement, escrow, and payment outcomes.

Evidence (Walrus) proves a *document exists*; it does not prove the *debt is
real*. Acknowledgement + economic enforcement (bond, reputation) is what makes
financing more fraud-resistant without claiming automated underwriting.

**Confirmed product decision:** on default the bond is **trustless auto-claim** —
after the due date + a grace window, the current payment-rights holder claims the
bond directly on-chain. No arbiter.

NFT collateral has been removed. The current Testnet package is v2 at
`0x9d23d715ef896b652740efa738185e424094bb83eb982735f1b2283d1b9c0e4a`;
the stable original package/object identity is
`0x44135549f5c650da76f87662848d2a3aa46704a8b231e17cf180220f172190e6`.
It contains `receivable` and `receivable_escrow`.

## Phase 0 — Payer acknowledgement (fraud resistance)

The single highest-leverage differentiator, and a prerequisite for the rest.
Most invoice-tokenization projects let the *issuer* mint and list unilaterally —
which is exactly how fake invoices and double-financing get funded. Here the
**payer must acknowledge the debt on-chain before the receivable can be listed**.

### Contract — [receivable.move](move/sources/receivable.move)
Add one field to `InvoiceReceivable<T>`:
```move
acknowledged_at_ms: u64,   // 0 = not acknowledged
```
(Struct-layout change ⇒ requires republish/upgrade — which we are doing anyway
for the escrow module. Update `create_invoice_receivable` to init it to `0`, and
the `#[test_only] invoice_for_testing` / `destroy_for_testing` helpers.)

New entry function:
```move
public entry fun acknowledge_invoice<T>(invoice: &mut InvoiceReceivable<T>, clock: &Clock, ctx)
```
- `assert!(sender == invoice.payer, E_NOT_PAYER)`
- `assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING)`
- `assert!(invoice.acknowledged_at_ms == 0, E_ALREADY_ACKNOWLEDGED)` (new code)
- set `acknowledged_at_ms = clock.timestamp_ms()`; emit `InvoiceAcknowledged { invoice_id, invoice_number, payer, acknowledged_at_ms }`.

**Gate** in `list_for_financing` (line ~177): add
`assert!(invoice.acknowledged_at_ms > 0, E_NOT_ACKNOWLEDGED)`. This is the hard
fraud-resistance gate: nothing unacknowledged can be financed. Accessor
`public fun is_acknowledged<T>(invoice): bool`.

> Tradeoff: a hard gate is the strongest claim but adds a required payer step
> before listing. We keep it hard by default; a future soft mode (UI warns,
> buyers see "unacknowledged") can be a platform flag if onboarding friction
> demands it.

Existing tests that call `list_for_financing` (e.g. `financing_routes_payment_to_buyer`)
must acknowledge first; simplest is to have `invoice_for_testing` set
`acknowledged_at_ms` non-zero, with dedicated tests for the gate itself.

### Tests
- Payer acknowledges a pending invoice → `is_acknowledged` true; non-payer cannot (`E_NOT_PAYER`); double-acknowledge fails; acknowledging a paid invoice fails.
- `list_for_financing` aborts with `E_NOT_ACKNOWLEDGED` when unacknowledged; succeeds after acknowledgement.

### Frontend / indexing
- `buildAcknowledgeInvoiceTx`; an **"Acknowledge invoice"** action shown to the payer in the inspector; the **"List rights"** action is disabled/hidden until acknowledged; an **Acknowledged ✓ {date}** badge in the Receivable Passport and verification panel.
- Supabase: `acknowledged_at_ms` + `acknowledged_tx` columns. The timestamp is
  read from the authoritative invoice object during verified sync.

### Adoption risk (the #1 risk — name it)
Acknowledgement assumes the payer has a wallet and acts. Real B2B payers are
often not crypto-native. Mitigation path: an **email magic-link → gas-sponsored
acknowledgement** flow (payer clicks a link, signs a sponsored tx, no SUI/USDC
needed), or an off-chain signed attestation anchored on-chain later. This pairs
with the existing sponsor Function and is a fast-follow, not a blocker for the
contract work.

## Layer A — Security-deposit / bond escrow

**Implementation status:** Published to Sui Testnet package v2
`0x9d23d715ef896b652740efa738185e424094bb83eb982735f1b2283d1b9c0e4a`.
The Move module, event-verified index sync, Supabase fields, frontend transaction
builders, deposit UI, and focused Move tests are implemented. The live Layer A
default-claim path remains a release-checklist test rather than a missing layer.

New module `invofi::receivable_escrow`, same package as
[receivable.move](move/sources/receivable.move). Reuses the lock/release/claim
lifecycle pattern from the removed NFT escrow.

```move
public struct DepositEscrow<phantom CoinT> has key, store {
    id: UID,
    invoice_id: ID,
    depositor: address,          // issuer or payer who posted the bond
    amount: Balance<CoinT>,
    grace_period_ms: u64,        // extra time after due date before claim opens
    created_at_ms: u64,
    status: u8,                  // 0 LOCKED, 1 RELEASED, 2 CLAIMED
}
```

- `lock_deposit<CoinT>(invoice, coin: Coin<CoinT>, grace_period_ms, clock, ctx)` —
  `depositor = sender`; store `coin.into_balance()`; share object; emit `DepositLocked`.
  Allowed while the invoice is unpaid.
- `release_deposit<CoinT>(escrow, invoice, ctx)` — require `receivable::is_paid(invoice)`
  and `sender == depositor`; return the balance to `depositor`; emit `DepositReleased`; delete.
- `claim_deposit<CoinT>(escrow, invoice, clock, ctx)` — **trustless default claim**:
  - `assert!(!receivable::is_paid(invoice))`
  - `assert!(clock.timestamp_ms() > receivable::due_date_ms(invoice) + grace_period_ms)`
  - `assert!(sender == receivable::payment_recipient(invoice))` — the *current* rights holder (read live, not stored, so a buyer who financed after the lock still gets it)
  - transfer balance to sender; emit `DepositClaimed`; delete.

The beneficiary is intentionally **not stored** — `claim_deposit` reads the live
`payment_recipient`, so the bond follows whoever holds payment rights at default.

## Layer B — Escrowed settlement

**Implementation status:** Deployed in package v2. The Move lifecycle, 8 focused
settlement tests, frontend transaction builders and role-gated controls, Walrus
delivery proof, Supabase columns, and Sui-event-derived index updates are
implemented. A real three-wallet Testnet release completed in transaction
`4wVrK66YqP1rj6ncN7pH9KdGba3XmQvYxfkg6eE1skgW`.

```move
public struct SettlementEscrow<phantom CoinT> has key, store {
    id: UID,
    invoice_id: ID,
    payer: address,
    amount: Balance<CoinT>,
    delivery_confirmed: bool,
    deadline_ms: u64,            // payer can refund after this if not confirmed
    created_at_ms: u64,
    status: u8,                  // 0 ESCROWED, 1 RELEASED, 2 REFUNDED
}
```

- `escrow_payment<CoinT>(invoice, coin, deadline_ms, clock, ctx)` — require `sender == receivable::payer(invoice)`
  and `coin.value() == receivable::amount_mist(invoice)` (full invoice); store balance; share; emit `SettlementEscrowed`.
- `confirm_delivery<CoinT>(escrow, invoice, evidence_blob_id: String, ctx)` — `sender == payer`
  attests receipt of goods; set `delivery_confirmed = true`; emit `DeliveryConfirmed { evidence_blob_id }` (ties to Walrus).
- `release_settlement<CoinT>(escrow, invoice: &mut, clock, ctx)` — require `delivery_confirmed`; transfer balance
  to `receivable::payment_recipient(invoice)`; mark the invoice paid via a new package-internal
  `receivable::settle_from_escrow`; emit `SettlementReleased`; delete.
- `refund_settlement<CoinT>(escrow, invoice, clock, ctx)` — require `!delivery_confirmed && now > deadline_ms`,
  `sender == payer`; return balance to payer; emit `SettlementRefunded`; delete.

**Known limitation (document, don't hide):** payer-confirmed delivery means a
payer could escrow then withhold confirmation. Mitigations: (1) deadline refund
keeps the payer's own funds from being stuck, not the issuer's; (2) reputation
(C) penalizes escrow-then-grief behavior; (3) future two-sided confirmation or an
optional arbiter for B specifically. The trustless bond (A) is the primary
protection; B is a strong complement for the "funds-ready, goods-pending" case.

### Required `receivable.move` additions
Re-add the generic accessors (removed with the NFT work) that escrow needs, plus
one package-internal settle hook:
```move
public fun id<T>(invoice: &InvoiceReceivable<T>): ID
public fun payer<T>(invoice: &InvoiceReceivable<T>): address
public fun due_date_ms<T>(invoice: &InvoiceReceivable<T>): u64
public fun is_paid<T>(invoice: &InvoiceReceivable<T>): bool
// status, payment_recipient, amount_mist already exist.
public(package) fun settle_from_escrow<T>(invoice: &mut InvoiceReceivable<T>, clock: &Clock)  // sets STATUS_PAID + paid_at_ms; asserts currently unpaid
```

### Events
`DepositLocked`, `DepositReleased`, `DepositClaimed`,
`SettlementEscrowed`, `DeliveryConfirmed`, `SettlementReleased`, `SettlementRefunded`
— each carrying `invoice_id`, escrow id, the actor, and amount where relevant.

### Tests (`receivable_escrow_tests.move`, test_scenario)
- A happy: lock → pay invoice → release to depositor.
- A default: lock → past due+grace, unpaid → current payment_recipient claims; non-recipient cannot; cannot claim before grace; cannot claim a paid invoice.
- B happy: escrow_payment → confirm_delivery → release routes to payment_recipient and marks invoice PAID.
- B refund: no confirmation past deadline → payer refunds; cannot refund after confirmation; non-payer cannot escrow/confirm/refund; wrong amount rejected.

## Layer C — Reputation (indexer-first)

**Implementation status:** Implemented as an explainable, indexer-derived
protocol history score. The Supabase table is publicly readable but writable
only by the service role; verified transaction syncs recompute affected wallets.
The inspector and marketplace display issuer/payer history badges. This is not
presented as underwriting or a credit rating.

Derive a per-wallet score from verified indexed outcomes; no reputation
contract is used in v1.

- **Inputs:** payer acknowledgements, paid invoices, overdue/defaulted invoices,
  honoured deposits, completed settlements, and settlement refunds.
- **Output:** a 0–100 score + counts per wallet, recomputed in the indexer.
- **Storage:** a `reputation` table (`wallet`, `score`, `invoices_paid`, `defaults`, `bonds_honored`, `settlements`, `updated_at`).
- **UI:** a reputation badge next to issuer/payer addresses in the inspector and marketplace.
- **Future:** an on-chain `ReputationRegistry` shared object updated by the escrow module on terminal events.

The implemented score starts neutral at 50: up to five acknowledgements add 3
points each, up to five paid invoices add 6 each, up to three honoured bonds add
4 each, and up to three completed settlements add 6 each. Defaults subtract 20
and settlement refunds subtract 5. The result is clamped to 0–100 and presented
as protocol history, not creditworthiness.

## Frontend

### Tx builders — [src/lib/receivableTransactions.ts](src/lib/receivableTransactions.ts)
`buildLockDepositTx`, `buildReleaseDepositTx`, `buildClaimDepositTx`,
`buildEscrowPaymentTx`, `buildConfirmDeliveryTx`, `buildReleaseSettlementTx`,
`buildRefundSettlementTx`. USDC amounts via the existing `coinWithBalance` +
`toBaseUnits` pattern and `getReceivableEscrowTarget` from
[receivableContract.ts](src/lib/receivableContract.ts) (`VITE_INVO_ESCROW_MODULE=receivable_escrow`).

### Types — [src/types/receivable.ts](src/types/receivable.ts)

`Invoice` stores flat `deposit*` and `settlement*` projection fields matching
the Supabase columns, plus `issuerReputation`, `payerReputation`, and
`buyerReputation`. Status unions are `LOCKED | RELEASED | CLAIMED` and
`ESCROWED | RELEASED | REFUNDED`.

### UI — [src/App.tsx](src/App.tsx)
- **Create form:** creates the receivable and evidence; escrow protection is
  added later from the invoice inspector.
- **Inspector panels:** role- and state-gated Lock deposit / Release / Claim (A)
  and Escrow payment / Confirm delivery / Release / Refund (B), with public
  escrow-object verification links.
- **Marketplace badges:** "USDC bond locked · {amount}" and "Payment escrowed", shown before buying.
- **Reputation badge** near issuer/payer.
All wired through the existing `executeTransaction`/sponsorship flow.

### Gas sponsorship — [functions/api/sponsor.js](functions/api/sponsor.js)
Same package → the allowlist already covers any function in it; just keep
`RECEIVABLE_PACKAGE_ID` pointed at the (re)published package. `lock_deposit` /
`escrow_payment` use `coinWithBalance` (framework coin helpers already allowed);
release/claim/refund move USDC inside the Move call (no extra PTB transfer
commands), so the guard stays satisfied.

## Indexing / Supabase

The index uses explicit `deposit_*` and `settlement_*` columns plus the
`reputation` table. Event-driven derivation in
[functions/_shared/receivables.js](functions/_shared/receivables.js) (parse the
`Deposit*`/`Settlement*`/`Delivery*` events) runs through the existing verified
`functions/api/receivables/sync.js` endpoint, keyed on `invoice_id`. Mirror fields in
[src/lib/supabaseReceivables.ts](src/lib/supabaseReceivables.ts). Authoritative
fields come from events, not the browser.

## Walrus

Layer B's delivery proof reuses the existing evidence pipeline —
`EvidencePackage.deliveryProofBlobId` already exists in
[evidence.ts](src/types/evidence.ts). `confirm_delivery` records that blob id in
its event.

## Build phases
0. **Complete — Payer acknowledgement:** Move gate, tests, frontend action, badge, and indexed fields.
1. **Complete — A / deposit escrow:** Move lifecycle, tests, event-verified indexing, and role-gated UI.
2. **Complete and deployed — B / settlement escrow:** full-payment escrow, delivery confirmation, release/refund, 8 focused Move tests, and a real Testnet release.
3. **Complete — Frontend A+B:** contract config, tx builders, projection types, role/state controls, modals, marketplace badges, and verification links.
4. **Complete — Indexing A+B:** Supabase columns, browser mapping, and Sui-event-derived updates through the verified sync endpoint.
5. **Complete — C / reputation:** deterministic indexer scoring, protected `reputation` table, and issuer/payer UI badges.
6. **Complete — Ship Layer B:** version 2 is published at `0x9d23d715ef896b652740efa738185e424094bb83eb982735f1b2283d1b9c0e4a` (upgrade transaction `Cf7tqkkTDRQ7JZ6BRHp4c9ZQRw6qkWTBWCCBp5A7xZQz`). Cloudflare production IDs are configured. A real issuer/buyer/payer Testnet flow completed through create, acknowledge, list, finance, escrow, delivery confirmation, and release; final settlement transaction: `4wVrK66YqP1rj6ncN7pH9KdGba3XmQvYxfkg6eE1skgW`.

## Verification
- `sui move test` — acknowledgement (payer-only, gate) plus all A and B happy + negative paths pass.
- Payer acknowledges before the issuer can list; an unacknowledged invoice cannot be listed (UI + on-chain).
- Local app: post a USDC bond → pay invoice → release returns it; separately, let an invoice default → buyer auto-claims the bond after grace (verify USDC moves on Suiscan).
- B: payer escrows full amount → confirm delivery → funds land at `payment_recipient` and the invoice flips to PAID; the no-confirmation deadline path refunds the payer.
- Indexed row + reputation badge reflect event-derived state after refresh.
- Sponsored gas covers lock/release/claim/escrow/confirm/release/refund.

## Open questions
- Bond sizing: free-form amount, or a % of face value enforced on-chain?
- Who posts the A bond by default — issuer (proves invoice is genuine) or payer (commitment to pay)? (Contract allows either; UI default TBD.)
- Should A and B be combinable on one invoice, or mutually exclusive in the UI?
- Grace-period default (e.g., 0 / 3 / 7 days) and whether it's issuer-set or platform-fixed.
- Reputation remains indexer-derived; an on-chain registry is a future protocol decision.
