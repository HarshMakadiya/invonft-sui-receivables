# InvoFi Production Readiness Plan

This document separates the current hackathon/Testnet build from the work needed
before real users, real invoices, or real money.

For the broader architecture, trust boundaries, consistency model, and design
invariants, see `SYSTEM_DESIGN.md`.

## Current State

- Frontend: React/Vite static app on Cloudflare Pages.
- Chain: Sui Testnet package v2 for payer acknowledgement, receivable creation,
  financing, direct payment, Layer A deposits, Layer B settlement escrow,
  overdue marking, evidence updates, and platform-fee routing.
- Storage: Walrus Testnet publisher/aggregator for evidence blobs.
- Index: Supabase stores receivable and reputation projections. Development can
  write demo rows directly; production writes pass through verified Cloudflare
  Pages Functions and anonymous roles are read-only.
- Demo controls: issuer/buyer/payer role toggles remain only outside production
  mode to help show the flow during a hackathon walkthrough.

## Production Blockers

### P0 - Must Fix Before Real Users

1. Protect Supabase writes. Done for the Testnet deployment.
   - Anonymous and authenticated browser roles have read-only policies.
   - Production mode sends syncs through Cloudflare Pages Functions.
   - Chain-owned receivable fields come from Sui object reads; deposit and
     settlement projections come from matching Sui events.

2. Add a chain indexer or trusted sync service. Request-driven verification done;
   background repair remains.
   - Sui is the source of truth for status, payment recipient, and financing.
   - The current Function verifies the transaction succeeded, touched the
     receivable object, reads that object from Sui, and derives chain-owned
     fields before syncing Supabase.
   - A background event replay/index repair worker is still required before Mainnet.

3. Remove no-wallet mutation fallback from production builds. Done for the
   frontend.
   - Demo-only `db:` invoices are useful locally.
   - Production actions must require wallet signatures and successful Sui
     transactions before changing persisted state.

4. Replace demo role wallets with real account flows. Done for production mode.
   - Issuer, buyer, and payer authority comes from the connected wallet.
   - Role switching remains only in development mode.

5. Move to production-grade Walrus publishing.
   - Public Testnet publisher URLs are not production infrastructure.
   - Evidence publishing needs reliable endpoints, retry strategy, size limits,
     and access/privacy decisions.

6. Legal and compliance review.
   - Invoice financing can trigger jurisdiction-specific rules.
   - Production needs KYB/KYC, AML screening, sanctions checks, dispute handling,
     privacy controls, terms, and risk disclosures.

### P1 - Needed For A Trustworthy Beta

1. Add authenticated business profiles.
2. Add payer invite flow. On-chain payer acknowledgement exists; email currently
   notifies invoice creation but does not provide passwordless wallet onboarding.
3. Add invoice access controls.
4. Add production observability and error reporting.
5. Add audit logging for status transitions.
6. Add stronger form validation with exact MIST arithmetic.
7. Add automated browser end-to-end tests. Move tests, indexer/reputation tests,
   and a real three-wallet CLI smoke test exist; browser automation does not.
8. Add monitoring for failed Walrus uploads and failed Sui transactions.
9. Add backup/index repair job from Sui events.

### P2 - Product Hardening

1. Sui Kiosk or transfer-policy marketplace support.
2. Encrypted/private invoice evidence.
3. Stablecoin support when available and legally appropriate.
4. Accounting exports.
5. Business verification and invoice risk workflows.

## Recommended Architecture

```text
Browser
  - Connect wallet
  - Build/sign Sui transactions
  - Upload allowed evidence payloads
  - Read index API

API / Indexer
  - Verify wallet signatures for off-chain profile actions
  - Listen to Sui events and object updates
  - Write normalized rows to Supabase/Postgres
  - Enforce private search and invoice access policies

Sui
  - Settlement/state authority
  - InvoiceReceivable shared objects
  - PlatformConfig fee routing
  - DepositEscrow and SettlementEscrow shared objects

Walrus
  - Evidence blob storage
  - Optional encrypted invoice packages
```

## Environment Strategy

- `development`: local UI, optional fallback/demo state.
- `staging`: Sui Testnet, real wallets, no fake status mutation.
- `production`: Sui Mainnet or chosen production network, authenticated API,
  hardened storage/indexing, no demo role controls.

Use a production flag such as:

```env
VITE_INVO_APP_MODE=development | staging | production
```

Production mode should disable:

- no-wallet mutations
- demo role wallet labels
- mock Walrus blob fallbacks
- public anon write policies

## Next Production Steps

1. Add background Sui event replay and index repair.
2. Add authenticated business accounts, payer invitations, and private access rules.
3. Add encrypted evidence and a production Walrus publisher strategy.
4. Add automated browser E2E coverage for direct payment, Layer A, Layer B
   release, and Layer B refund.
5. Add observability, API rate limiting, legal review, and compliance controls.
