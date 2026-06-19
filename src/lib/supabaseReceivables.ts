import type { DepositStatus, Evidence, FinancingStatus, Invoice, InvoiceStatus } from "../types/receivable";

type ReceivableRow = {
  id?: string;
  package_id?: string | null;
  invoice_id: string;
  sui_object_id: string | null;
  tx_digest: string | null;
  blob_id: string | null;
  issuer_wallet: string;
  payer_wallet: string | null;
  buyer_wallet: string | null;
  client_name: string;
  client_email: string | null;
  description: string | null;
  amount_sui: number;
  due_date: string | null;
  status: InvoiceStatus;
  financing_status: FinancingStatus;
  financing_price_sui: number;
  metadata_checksum: string | null;
  acknowledged_at_ms?: number | null;
  acknowledged_tx?: string | null;
  deposit_escrow_id?: string | null;
  deposit_status?: DepositStatus | null;
  deposit_depositor?: string | null;
  deposit_amount_sui?: number | null;
  deposit_grace_period_ms?: number | null;
  deposit_tx?: string | null;
  created_at?: string;
  updated_at?: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const receivablePackageId = import.meta.env.VITE_INVO_RECEIVABLE_PACKAGE_ID?.trim() ?? "";

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function fetchReceivablesFromDb() {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const packageFilter = receivablePackageId ? `&package_id=eq.${encodeURIComponent(receivablePackageId)}` : "";
  const response = await fetch(`${restBaseUrl()}/receivables?select=*${packageFilter}&order=created_at.desc`, {
    headers: requestHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Database read failed: ${response.status} ${response.statusText}`);
  }

  const rows = (await response.json()) as ReceivableRow[];
  return rows.map(rowToInvoice);
}

export async function saveReceivableToDb(invoice: Invoice) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const row = invoiceToRow(invoice);
  const updateFilter = row.sui_object_id
    ? `sui_object_id=eq.${encodeURIComponent(row.sui_object_id)}`
    : `invoice_id=eq.${encodeURIComponent(row.invoice_id)}`;

  const updateResponse = await fetch(`${restBaseUrl()}/receivables?${updateFilter}`, {
    method: "PATCH",
    headers: requestHeaders("return=representation"),
    body: JSON.stringify({
      ...row,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!updateResponse.ok) {
    throw new Error(`Database update failed: ${updateResponse.status} ${updateResponse.statusText}`);
  }

  const updatedRows = (await updateResponse.json()) as ReceivableRow[];
  if (updatedRows.length > 0) {
    return rowToInvoice(updatedRows[0]);
  }

  const insertResponse = await fetch(`${restBaseUrl()}/receivables`, {
    method: "POST",
    headers: requestHeaders("return=representation"),
    body: JSON.stringify(row),
  });

  if (!insertResponse.ok) {
    throw new Error(`Database insert failed: ${insertResponse.status} ${insertResponse.statusText}`);
  }

  const insertedRows = (await insertResponse.json()) as ReceivableRow[];
  return insertedRows[0] ? rowToInvoice(insertedRows[0]) : null;
}

function restBaseUrl() {
  const normalized = supabaseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/rest/v1") ? normalized : `${normalized}/rest/v1`;
}

function requestHeaders(prefer?: string) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function invoiceToRow(invoice: Invoice): ReceivableRow {
  return {
    package_id: invoice.packageId ?? (receivablePackageId || null),
    invoice_id: invoice.id,
    sui_object_id: isPersistableObjectId(invoice.objectId) ? invoice.objectId : null,
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
    acknowledged_at_ms: invoice.acknowledgedAtMs ?? null,
    acknowledged_tx: invoice.acknowledgedTx ?? null,
    deposit_escrow_id: invoice.depositEscrowId ?? null,
    deposit_status: invoice.depositStatus ?? null,
    deposit_depositor: invoice.depositDepositor ?? null,
    deposit_amount_sui: invoice.depositAmount ?? null,
    deposit_grace_period_ms: invoice.depositGracePeriodMs ?? null,
    deposit_tx: invoice.depositTx ?? null,
  };
}

function rowToInvoice(row: ReceivableRow): Invoice {
  const blobId = row.blob_id ?? "";
  const payer = row.payer_wallet ?? "";
  const status = normalizeStatus(row.status);
  const financingStatus = normalizeFinancingStatus(row.financing_status);

  return {
    id: row.invoice_id,
    packageId: row.package_id ?? undefined,
    objectId: row.sui_object_id ?? `db:${row.invoice_id}`,
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
    acknowledgedAtMs: row.acknowledged_at_ms ?? undefined,
    acknowledgedTx: row.acknowledged_tx ?? undefined,
    depositEscrowId: row.deposit_escrow_id ?? undefined,
    depositStatus: row.deposit_status ?? undefined,
    depositDepositor: row.deposit_depositor ?? undefined,
    depositAmount: row.deposit_amount_sui == null ? undefined : Number(row.deposit_amount_sui),
    depositGracePeriodMs: row.deposit_grace_period_ms == null ? undefined : Number(row.deposit_grace_period_ms),
    depositTx: row.deposit_tx ?? undefined,
    evidence: evidenceFromRow(status, payer, blobId, row.due_date),
    events: ["Loaded from Supabase index"],
  };
}

function evidenceFromRow(status: InvoiceStatus, payer: string, blobId: string, dueDate: string | null): Evidence {
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

function normalizeStatus(status: string): InvoiceStatus {
  return status === "PAID" || status === "OVERDUE" ? status : "PENDING";
}

function normalizeFinancingStatus(status: string): FinancingStatus {
  return status === "LISTED" || status === "FINANCED" || status === "CANCELLED" ? status : "NOT_LISTED";
}

function isPersistableObjectId(objectId: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(objectId);
}
