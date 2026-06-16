import type { SuiClientTypes } from "@mysten/sui/client";
import type { Invoice } from "../types/receivable";
import { fromBaseUnits } from "./coin";

type SuiObjectWithJson = SuiClientTypes.Object<{ json: true; previousTransaction: true }>;

type ObjectReader = {
  getObject<Include extends SuiClientTypes.ObjectInclude = {}>(
    input: SuiClientTypes.GetObjectOptions<Include>,
  ): Promise<SuiClientTypes.GetObjectResponse<Include>>;
};

const STATUS_LABELS = ["PENDING", "PAID", "OVERDUE", "PENDING"] as const;
const FINANCING_LABELS = ["NOT_LISTED", "LISTED", "FINANCED", "CANCELLED"] as const;

export async function fetchInvoiceReceivableObject(
  client: ObjectReader,
  objectId: string,
) {
  const response = await client.getObject({
    objectId,
    include: {
      json: true,
      previousTransaction: true,
    },
  });

  return parseInvoiceReceivableObject(response.object);
}

export function parseInvoiceReceivableObject(object: SuiObjectWithJson): Invoice {
  if (!object.type.includes("::receivable::InvoiceReceivable")) {
    throw new Error(`Object is not an InvoiceReceivable: ${object.type}`);
  }

  const fields = getFields(object.json);
  const status = numberField(fields, "status");
  const financingStatus = numberField(fields, "financing_status");
  const amountMist = bigintField(fields, "amount_mist");
  const financingPriceMist = bigintField(fields, "financing_price_mist");
  const invoiceNumber = numberField(fields, "invoice_number");
  const clientName = stringField(fields, "client_name", `Imported client ${invoiceNumber}`);
  const description = stringField(fields, "description", "Imported Sui receivable");
  const blobId = stringField(fields, "blob_id", "");

  return {
    id: `INV-${String(invoiceNumber).padStart(4, "0")}`,
    objectId: object.objectId,
    clientName,
    clientEmail: stringField(fields, "client_email", "unknown@example.invalid"),
    description,
    amount: fromBaseUnits(amountMist),
    dueDate: formatDueDate(numberField(fields, "due_date_ms")),
    issuer: addressField(fields, "issuer"),
    payer: addressField(fields, "payer"),
    paymentRecipient: addressField(fields, "payment_recipient"),
    buyer: financingStatus === 2 ? addressField(fields, "payment_recipient") : null,
    status: STATUS_LABELS[status] ?? "PENDING",
    financingStatus: FINANCING_LABELS[financingStatus] ?? "NOT_LISTED",
    financingPrice: fromBaseUnits(financingPriceMist),
    blobId,
    metadataChecksum: stringField(fields, "metadata_checksum", ""),
    txDigest: object.previousTransaction ?? undefined,
    evidence: {
      invoicePdf: Boolean(blobId),
      lineItemsMatch: true,
      payerWalletPresent: true,
      dueDateValid: Number(fields.due_date_ms ?? 0) > Date.now(),
      unpaid: status === 0,
      evidenceComplete: Boolean(blobId),
      walrusAvailable: Boolean(blobId),
    },
    events: [`Imported from Sui object ${shortObjectId(object.objectId)}`],
  };
}

function getFields(json: Record<string, unknown> | null) {
  if (!json) {
    throw new Error("Invoice object has no JSON fields. Try fetching with JSON enabled.");
  }

  if ("fields" in json && isRecord(json.fields)) {
    return json.fields;
  }

  return json;
}

function addressField(fields: Record<string, unknown>, name: string) {
  return stringField(fields, name, "0x0");
}

function stringField(fields: Record<string, unknown>, name: string, fallback = "") {
  const value = fields[name];
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.bytes === "string") {
    return value.bytes;
  }

  return fallback;
}

function numberField(fields: Record<string, unknown>, name: string) {
  const value = fields[name];
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return 0;
}

function bigintField(fields: Record<string, unknown>, name: string) {
  const value = fields[name];
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }

  return 0n;
}

function formatDueDate(dueDateMs: number) {
  if (!dueDateMs) {
    return "Unknown";
  }
  return new Date(dueDateMs).toISOString().slice(0, 10);
}

function shortObjectId(objectId: string) {
  return objectId.length > 14 ? `${objectId.slice(0, 8)}...${objectId.slice(-4)}` : objectId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
