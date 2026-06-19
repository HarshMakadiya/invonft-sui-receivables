import { sendInvoiceCreatedEmail } from "../../_shared/email.js";
import {
  fetchSuiReceivableObject,
  fetchSuiTransaction,
  escrowUpdateFromTransaction,
  handleOptions,
  isSuccessfulTransaction,
  jsonResponse,
  receivableExists,
  transactionHasEvent,
  transactionTouchesObject,
  upsertInvoice,
  validateInvoiceForSync,
} from "../../_shared/receivables.js";

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  try {
    const invoice = await request.json();
    const validationError = validateInvoiceForSync(invoice);
    if (validationError) {
      return jsonResponse({ error: validationError }, { status: 400 });
    }

    const tx = await fetchSuiTransaction(env, invoice.txDigest);
    const escrowUpdate = escrowUpdateFromTransaction(env, tx, invoice.objectId);
    if (!isSuccessfulTransaction(tx) || (!transactionTouchesObject(tx, invoice.objectId) && !escrowUpdate)) {
      return jsonResponse({ error: "Transaction did not touch the receivable object." }, { status: 409 });
    }

    const alreadyIndexed = await receivableExists(env, invoice.objectId);
    const chainInvoice = await fetchSuiReceivableObject(env, invoice.objectId);
    const savedInvoice = await upsertInvoice(env, invoice, chainInvoice, escrowUpdate);
    if (!savedInvoice) {
      return jsonResponse({ error: "Receivable sync did not return a saved invoice." }, { status: 500 });
    }

    const notification = await maybeSendInvoiceEmail(env, savedInvoice, tx, request, alreadyIndexed);
    console.log("Invoice email notification", notification.status, notification.reason || notification.id || "");
    return jsonResponse({ ...savedInvoice, notification });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Receivable sync failed." }, { status: 500 });
  }
}

async function maybeSendInvoiceEmail(env, invoice, tx, request, alreadyIndexed) {
  if (alreadyIndexed) {
    return { status: "skipped", reason: "Receivable was already indexed." };
  }

  if (!transactionHasEvent(tx, "InvoiceCreated")) {
    return { status: "skipped", reason: "Not an invoice creation transaction." };
  }

  try {
    return await sendInvoiceCreatedEmail(env, invoice, {
      origin: new URL(request.url).origin,
    });
  } catch (error) {
    console.error("Invoice email notification failed", error);
    return { status: "failed", reason: error?.message || "Invoice email failed." };
  }
}
