# InvoFi Production Readiness Plan

This document separates the current hackathon/Testnet build from the work needed
before real users, real invoices, or real money.

For the broader architecture, trust boundaries, consistency model, and design
invariants, see `SYSTEM_DESIGN.md`.

## Current State

- Frontend: React/Vite static app on Cloudflare Pages.
- Chain: Sui Testnet Move package for receivable creation, financing, payment,
  overdue marking, evidence updates, and platform-fee routing.
- Storage: Walrus Testnet publisher/aggregator for evidence blobs.
- Index: Supabase table used as the query/index store. Development can write to
  it directly; production now routes writes through Cloudflare Pages Functions.
- Demo controls: issuer/buyer/payer role toggles remain only outside production
  mode to help show the flow during a hackathon walkthrough.

## Production Blockers

### P0 - Must Fix Before Real Users

1. Replace permissive Supabase writes. Started.
   - Current demo/staging RLS can allow anon inserts/updates.
   - Production mode now sends syncs through Cloudflare Pages Functions.
   - Next hardening step: derive every indexed status from Sui events instead
     of accepting client-provided status fields.

2. Add a chain indexer or trusted sync service. Started.
   - Sui is the source of truth for status, payment recipient, and financing.
   - The current Function verifies the transaction succeeded, touched the
     receivable object, reads that object from Sui, and derives chain-owned
     fields before syncing Supabase.
   - Next hardening step: run a background event indexer that reconstructs rows
     from chain state without trusting browser-submitted fields.

3. Remove no-wallet mutation fallback from production builds. Done for the
   frontend.
   - Demo-only `db:` invoices are useful locally.
   - Production actions must require wallet signatures and successful Sui
     transactions before changing persisted state.

4. Replace demo role wallets with real account flows. Started.
   - Issuer, buyer, and payer must be actual connected wallets.
   - Role switching can remain only in a demo/staging mode.

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
2. Add payer invite/acceptance workflow.
3. Add invoice access controls.
4. Add production observability and error reporting.
5. Add audit logging for status transitions.
6. Add stronger form validation with exact MIST arithmetic.
7. Add end-to-end tests for create -> list -> buy -> pay.
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

## Immediate Next Implementation Steps

1. Add `VITE_INVO_APP_MODE` and gate demo-only behavior. Done for the frontend
   no-wallet create fallback.
2. Add strict create/list/buy/pay validation before transaction signing. Started:
   production mode now derives available actions from the connected wallet
   address instead of demo role toggles.
3. Add an indexer/API boundary for Supabase writes.
   Done as a Cloudflare Pages Functions boundary at `/api/receivables`.
4. Add real end-to-end test instructions and a staging smoke-test checklist.
5. Add privacy/compliance copy in the UI before accepting real invoice data.
   Done on the create receivable screen with a Testnet/prototype notice.
