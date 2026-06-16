import { paymentCoin } from "./coin";
import type { EvidencePackage, EvidencePackageInput } from "../types/evidence";

export async function buildEvidencePackage(input: EvidencePackageInput): Promise<EvidencePackage> {
  const lineItems =
    input.lineItems && input.lineItems.length > 0
      ? input.lineItems
      : [
          {
            description: input.description,
            quantity: 1,
            unitPrice: input.amountSui,
          },
        ];

  const lineItemTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const amountMatchesLineItems = Math.abs(lineItemTotal - input.amountSui) < 1e-9;

  const packageWithoutChecksum = {
    version: 1 as const,
    invoiceNumber: input.invoiceNumber,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    description: input.description,
    currency: paymentCoin.symbol,
    lineItems,
    ...(input.invoicePdfBlobId ? { invoicePdfBlobId: input.invoicePdfBlobId } : {}),
    ...(input.invoicePdfFileName ? { invoicePdfFileName: input.invoicePdfFileName } : {}),
    metadataChecksum: "",
    verificationChecks: {
      payerWalletPresent: input.payerWalletPresent,
      pdfUploaded: input.pdfUploaded,
      amountMatchesLineItems,
      dueDateValid: new Date(input.dueDate).getTime() > Date.now(),
      unpaid: true,
      walrusBlobAvailable: false,
    },
  };

  const metadataChecksum = await sha256Hex(canonicalJson(packageWithoutChecksum));
  return {
    ...packageWithoutChecksum,
    metadataChecksum: `sha256:${metadataChecksum}`,
  };
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(sortKeys(value));
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortKeys(nestedValue)]),
    );
  }

  return value;
}
