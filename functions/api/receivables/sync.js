import { fetchSuiReceivableObject, handleOptions, jsonResponse, upsertInvoice, validateInvoiceForSync, verifySuiTransaction } from "../../_shared/receivables.js";

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

    const isVerified = await verifySuiTransaction(env, invoice.txDigest, invoice.objectId);
    if (!isVerified) {
      return jsonResponse({ error: "Transaction did not touch the receivable object." }, { status: 409 });
    }

    const chainInvoice = await fetchSuiReceivableObject(env, invoice.objectId);
    const savedInvoice = await upsertInvoice(env, invoice, chainInvoice);
    return jsonResponse(savedInvoice);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Receivable sync failed." }, { status: 500 });
  }
}
