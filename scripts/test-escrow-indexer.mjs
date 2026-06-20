import assert from "node:assert/strict";
import { escrowUpdateFromTransaction, invoiceToRowFromChain } from "../functions/_shared/receivables.js";

const packageId = `0x${"1".repeat(64)}`;
const originalPackageId = `0x${"5".repeat(64)}`;
const invoiceId = `0x${"2".repeat(64)}`;
const escrowId = `0x${"3".repeat(64)}`;
const payer = `0x${"4".repeat(64)}`;
const env = {
  RECEIVABLE_PACKAGE_ID: packageId,
  RECEIVABLE_ORIGINAL_PACKAGE_ID: originalPackageId,
  RECEIVABLE_ESCROW_MODULE: "receivable_escrow",
};

function updateFor(eventName, parsedJson) {
  return escrowUpdateFromTransaction(
    env,
    {
      digest: `tx-${eventName}`,
      events: [
        {
          type: `${packageId}::receivable_escrow::${eventName}`,
          parsedJson: { invoice_id: invoiceId, escrow_id: escrowId, ...parsedJson },
        },
      ],
    },
    invoiceId,
  );
}

assert.deepEqual(
  updateFor("SettlementEscrowed", {
    payer,
    amount: "5000000",
    deadline_ms: "1900000000000",
  }),
  {
    settlement_escrow_id: escrowId,
    settlement_status: "ESCROWED",
    settlement_payer: payer,
    settlement_amount_sui: 5,
    settlement_delivery_confirmed: false,
    settlement_deadline_ms: 1900000000000,
    settlement_tx: "tx-SettlementEscrowed",
  },
);

assert.deepEqual(updateFor("DeliveryConfirmed", { evidence_blob_id: "walrus-proof" }), {
  settlement_delivery_confirmed: true,
  settlement_delivery_proof_blob_id: "walrus-proof",
  settlement_tx: "tx-DeliveryConfirmed",
});

assert.deepEqual(updateFor("SettlementReleased", {}), {
  settlement_status: "RELEASED",
  settlement_delivery_confirmed: true,
  settlement_tx: "tx-SettlementReleased",
});

assert.deepEqual(updateFor("SettlementRefunded", {}), {
  settlement_status: "REFUNDED",
  settlement_tx: "tx-SettlementRefunded",
});

assert.equal(
  escrowUpdateFromTransaction(env, { digest: "ignored", events: [] }, invoiceId),
  null,
  "transactions without escrow events must not mutate indexed state",
);

const originalPackageUpdate = escrowUpdateFromTransaction(
  env,
  {
    digest: "original-package-event",
    events: [{
      type: `${originalPackageId}::receivable_escrow::SettlementRefunded`,
      parsedJson: { invoice_id: invoiceId, escrow_id: escrowId },
    }],
  },
  invoiceId,
);
assert.equal(originalPackageUpdate?.settlement_status, "REFUNDED", "original and upgraded package events are accepted");

const untrustedSettlementRow = invoiceToRowFromChain({
  id: "INV-0001",
  objectId: invoiceId,
  txDigest: "unrelated-transaction",
  issuer: payer,
  payer,
  paymentRecipient: payer,
  buyer: null,
  clientName: "Test",
  clientEmail: "test@example.com",
  description: "Test",
  amount: 1,
  dueDate: "2099-01-01",
  status: "PENDING",
  financingStatus: "NOT_LISTED",
  financingPrice: 0,
  blobId: "",
  settlementStatus: "RELEASED",
  settlementEscrowId: escrowId,
}, null);
assert.equal(
  Object.hasOwn(untrustedSettlementRow, "settlement_status"),
  false,
  "browser-supplied settlement state must not enter the verified base row",
);

console.log("Escrow indexer scenarios passed.");
