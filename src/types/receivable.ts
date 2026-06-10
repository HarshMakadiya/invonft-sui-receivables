export type WalletRole = "issuer" | "buyer" | "payer";

export type Page = "dashboard" | "create" | "marketplace" | "portfolio";

export type InvoiceStatus = "PENDING" | "PAID" | "OVERDUE";

export type FinancingStatus = "NOT_LISTED" | "LISTED" | "FINANCED" | "CANCELLED";

export type Evidence = {
  invoicePdf: boolean;
  lineItemsMatch: boolean;
  payerWalletPresent: boolean;
  dueDateValid: boolean;
  unpaid: boolean;
  evidenceComplete: boolean;
  walrusAvailable: boolean;
};

export type Invoice = {
  id: string;
  objectId: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  dueDate: string;
  issuer: string;
  payer: string;
  paymentRecipient: string;
  buyer: string | null;
  status: InvoiceStatus;
  financingStatus: FinancingStatus;
  financingPrice: number;
  blobId: string;
  blobObjectId?: string;
  metadataChecksum?: string;
  evidence: Evidence;
  events: string[];
};

export type DemoWallet = {
  label: string;
  address: string;
  balance: number;
};
