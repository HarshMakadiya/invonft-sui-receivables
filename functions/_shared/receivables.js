const DEFAULT_SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";

// Receivables settle in USDC (6 decimals). On-chain `*_mist` fields hold base
// units of the configured payment coin, so 1 USDC = 1_000_000 base units.
const PAYMENT_BASE_UNIT = 1_000_000;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function getSupabaseConfig(env) {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return {
    baseUrl: supabaseUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, ""),
    serviceRoleKey,
  };
}

export function supabaseHeaders(serviceRoleKey, prefer) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function rowToInvoice(row) {
  const status = normalizeStatus(row.status);
  const financingStatus = normalizeFinancingStatus(row.financing_status);
  const blobId = row.blob_id ?? "";
  const payer = row.payer_wallet ?? "";

  return {
    id: row.invoice_id,
    objectId: row.sui_object_id,
    clientName: row.client_name,
    clientEmail: row.client_email ?? "",
    description: row.description ?? "Receivable",
    amount: Number(row.amount_sui),
    dueDate: row.due_date ?? "",
    issuer: row.issuer_wallet,
    payer,
    paymentRecipient: row.buyer_wallet ?? row.issuer_wallet,
    buyer: row.buyer_wallet,
    status,
    financingStatus,
    financingPrice: Number(row.financing_price_sui ?? 0),
    blobId,
    metadataChecksum: row.metadata_checksum ?? undefined,
    txDigest: row.tx_digest ?? undefined,
    evidence: evidenceFromRow(status, payer, blobId, row.due_date),
    events: ["Loaded from verified production index"],
  };
}

export function invoiceToRow(invoice) {
  return invoiceToRowFromChain(invoice);
}

export function invoiceToRowFromChain(invoice, chainInvoice) {
  const chainFields = chainInvoice?.fields;
  const financingStatus = chainFields ? statusFromCode(chainFields.financing_status, financingStatusLabels) : invoice.financingStatus;
  const paymentRecipient = chainFields?.payment_recipient ?? invoice.paymentRecipient ?? invoice.issuer;

  return {
    invoice_id: chainFields ? invoiceIdFromNumber(chainFields.invoice_number) : invoice.id,
    sui_object_id: chainInvoice?.objectId ?? invoice.objectId,
    tx_digest: invoice.txDigest ?? null,
    blob_id: chainFields ? chainFields.blob_id || null : invoice.blobId || null,
    issuer_wallet: chainFields?.issuer ?? invoice.issuer,
    payer_wallet: chainFields ? chainFields.payer || null : invoice.payer || null,
    buyer_wallet: financingStatus === "FINANCED" || invoice.buyer ? paymentRecipient : null,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail || null,
    description: invoice.description || null,
    amount_sui: chainFields ? fromBaseUnits(chainFields.amount_mist) : invoice.amount,
    due_date: chainFields ? dateFromMs(chainFields.due_date_ms) : invoice.dueDate || null,
    status: chainFields ? statusFromCode(chainFields.status, invoiceStatusLabels) : invoice.status,
    financing_status: financingStatus,
    financing_price_sui: chainFields ? fromBaseUnits(chainFields.financing_price_mist) : invoice.financingPrice,
    metadata_checksum: chainFields?.metadata_checksum ?? invoice.metadataChecksum ?? null,
  };
}

export function validateInvoiceForSync(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return "Invoice payload is required.";
  }

  if (!invoice.id || typeof invoice.id !== "string") {
    return "Invoice ID is required.";
  }

  if (!isSuiObjectId(invoice.objectId)) {
    return "A real Sui receivable object ID is required.";
  }

  if (!invoice.txDigest || typeof invoice.txDigest !== "string") {
    return "A Sui transaction digest is required.";
  }

  if (!isSuiAddress(invoice.issuer)) {
    return "Issuer wallet must be a Sui address.";
  }

  if (invoice.payer && !isSuiAddress(invoice.payer)) {
    return "Payer wallet must be a Sui address.";
  }

  if (!["PENDING", "PAID", "OVERDUE"].includes(invoice.status)) {
    return "Invoice status is invalid.";
  }

  if (!["NOT_LISTED", "LISTED", "FINANCED", "CANCELLED"].includes(invoice.financingStatus)) {
    return "Financing status is invalid.";
  }

  return null;
}

export async function verifySuiTransaction(env, txDigest, objectId) {
  const payload = await suiRpc(env, "sui_getTransactionBlock", [
    txDigest,
    {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  ]);
  const result = payload.result;
  if (result?.effects?.status?.status !== "success") {
    return false;
  }

  const objectChanges = Array.isArray(result.objectChanges) ? result.objectChanges : [];
  return objectChanges.some((change) => change.objectId === objectId);
}

export async function fetchSuiReceivableObject(env, objectId) {
  const payload = await suiRpc(env, "sui_getObject", [
    objectId,
    {
      showContent: true,
      showType: true,
    },
  ]);
  const data = payload.result?.data;
  const content = data?.content;

  if (!data || content?.dataType !== "moveObject" || !content.fields) {
    throw new Error("Receivable object was not found on Sui.");
  }

  const expectedPackageId = env.RECEIVABLE_PACKAGE_ID?.trim() || env.VITE_INVO_RECEIVABLE_PACKAGE_ID?.trim();
  const expectedModule = env.RECEIVABLE_MODULE?.trim() || env.VITE_INVO_RECEIVABLE_MODULE?.trim() || "receivable";
  // The object is generic over the payment coin, so its type carries a
  // `<...::usdc::USDC>` argument (e.g. `PKG::receivable::InvoiceReceivable<...>`).
  const expectedTypeMarker = `::${expectedModule}::InvoiceReceivable`;

  const objectType = data.type ?? content.type ?? "";

  if (!String(objectType).includes(expectedTypeMarker)) {
    throw new Error("Sui object is not an InvoiceReceivable.");
  }

  if (expectedPackageId && !String(objectType).startsWith(`${expectedPackageId}::`)) {
    throw new Error("Receivable object belongs to a different package.");
  }

  const fields = content.fields;
  return {
    objectId: data.objectId,
    type: objectType,
    fields: {
      amount_mist: normalizeU64(fields.amount_mist),
      blob_id: normalizeMoveString(fields.blob_id),
      due_date_ms: normalizeU64(fields.due_date_ms),
      financing_price_mist: normalizeU64(fields.financing_price_mist),
      financing_status: normalizeU8(fields.financing_status),
      invoice_number: normalizeU64(fields.invoice_number),
      issuer: normalizeAddress(fields.issuer),
      metadata_checksum: normalizeMoveString(fields.metadata_checksum),
      payer: normalizeAddress(fields.payer),
      payment_recipient: normalizeAddress(fields.payment_recipient),
      status: normalizeU8(fields.status),
    },
  };
}

export async function upsertInvoice(env, invoice, chainInvoice) {
  const { baseUrl, serviceRoleKey } = getSupabaseConfig(env);
  const row = invoiceToRowFromChain(invoice, chainInvoice);
  const updateResponse = await fetch(
    `${baseUrl}/rest/v1/receivables?sui_object_id=eq.${encodeURIComponent(row.sui_object_id)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders(serviceRoleKey, "return=representation"),
      body: JSON.stringify({
        ...row,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!updateResponse.ok) {
    throw new Error(`Supabase update failed: ${updateResponse.status} ${updateResponse.statusText}`);
  }

  const updatedRows = await updateResponse.json();
  if (updatedRows.length > 0) {
    return rowToInvoice(updatedRows[0]);
  }

  const insertResponse = await fetch(`${baseUrl}/rest/v1/receivables`, {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, "return=representation"),
    body: JSON.stringify(row),
  });

  if (!insertResponse.ok) {
    throw new Error(`Supabase insert failed: ${insertResponse.status} ${insertResponse.statusText}`);
  }

  const insertedRows = await insertResponse.json();
  return insertedRows[0] ? rowToInvoice(insertedRows[0]) : null;
}

function evidenceFromRow(status, payer, blobId, dueDate) {
  const hasEvidence = Boolean(blobId);
  return {
    invoicePdf: hasEvidence,
    lineItemsMatch: true,
    payerWalletPresent: Boolean(payer),
    dueDateValid: dueDate ? new Date(dueDate).getTime() > Date.now() : false,
    unpaid: status === "PENDING" || status === "OVERDUE",
    evidenceComplete: hasEvidence,
    walrusAvailable: hasEvidence,
  };
}

function normalizeStatus(status) {
  return status === "PAID" || status === "OVERDUE" ? status : "PENDING";
}

function normalizeFinancingStatus(status) {
  return status === "LISTED" || status === "FINANCED" || status === "CANCELLED" ? status : "NOT_LISTED";
}

const invoiceStatusLabels = ["PENDING", "PAID", "OVERDUE"];
const financingStatusLabels = ["NOT_LISTED", "LISTED", "FINANCED", "CANCELLED"];

function isSuiAddress(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isSuiObjectId(value) {
  return isSuiAddress(value);
}

async function suiRpc(env, method, params) {
  const rpcUrl = env.SUI_RPC_URL?.trim() || DEFAULT_SUI_RPC_URL;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sui RPC failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "Sui RPC returned an error.");
  }

  return payload;
}

function normalizeAddress(value) {
  return typeof value === "string" ? value : "";
}

function normalizeU8(value) {
  return Number(value ?? 0);
}

function normalizeU64(value) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "0";
}

function normalizeMoveString(value) {
  if (typeof value === "string") {
    return value;
  }

  const bytes = value?.fields?.bytes ?? value?.bytes;
  if (Array.isArray(bytes)) {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  return "";
}

function fromBaseUnits(mist) {
  return Number(BigInt(mist)) / PAYMENT_BASE_UNIT;
}

function dateFromMs(ms) {
  const value = Number(BigInt(ms));
  return value > 0 ? new Date(value).toISOString().slice(0, 10) : null;
}

function statusFromCode(code, labels) {
  return labels[Number(code)] ?? labels[0];
}

function invoiceIdFromNumber(invoiceNumber) {
  return `INV-${String(invoiceNumber).padStart(4, "0")}`;
}
