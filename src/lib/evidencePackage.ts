import type { EvidencePackage, EvidencePackageInput } from "../types/evidence";

export async function buildEvidencePackage(input: EvidencePackageInput): Promise<EvidencePackage> {
  const packageWithoutChecksum = {
    version: 1 as const,
    invoiceNumber: input.invoiceNumber,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    description: input.description,
    currency: "SUI" as const,
    lineItems: [
      {
        description: input.description,
        quantity: 1,
        unitPrice: input.amountSui,
      },
    ],
    ...(input.invoicePdfBlobId ? { invoicePdfBlobId: input.invoicePdfBlobId } : {}),
    metadataChecksum: "",
    verificationChecks: {
      payerWalletPresent: input.payerWalletPresent,
      pdfUploaded: input.pdfUploaded,
      amountMatchesLineItems: true,
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
