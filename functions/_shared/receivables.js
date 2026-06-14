const DEFAULT_SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";

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
  return {
    invoice_id: invoice.id,
    sui_object_id: invoice.objectId,
    tx_digest: invoice.txDigest ?? null,
    blob_id: invoice.blobId || null,
    issuer_wallet: invoice.issuer,
    payer_wallet: invoice.payer || null,
    buyer_wallet: invoice.buyer,
    client_name: invoice.clientName,
    client_email: invoice.clientEmail || null,
    description: invoice.description || null,
    amount_sui: invoice.amount,
    due_date: invoice.dueDate || null,
    status: invoice.status,
    financing_status: invoice.financingStatus,
    financing_price_sui: invoice.financingPrice,
    metadata_checksum: invoice.metadataChecksum ?? null,
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
  const rpcUrl = env.SUI_RPC_URL?.trim() || DEFAULT_SUI_RPC_URL;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getTransactionBlock",
      params: [
        txDigest,
        {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Sui RPC failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message ?? "Sui RPC returned an error.");
  }

  const result = payload.result;
  if (result?.effects?.status?.status !== "success") {
    return false;
  }

  const objectChanges = Array.isArray(result.objectChanges) ? result.objectChanges : [];
  return objectChanges.some((change) => change.objectId === objectId);
}

export async function upsertInvoice(env, invoice) {
  const { baseUrl, serviceRoleKey } = getSupabaseConfig(env);
  const row = invoiceToRow(invoice);
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

function isSuiAddress(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isSuiObjectId(value) {
  return isSuiAddress(value);
}
