export type EvidenceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type EvidencePackage = {
  version: 1;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  description: string;
  currency: "SUI";
  lineItems: EvidenceLineItem[];
  invoicePdfBlobId?: string;
  metadataChecksum: string;
  purchaseOrderBlobId?: string;
  deliveryProofBlobId?: string;
  payerAcceptanceBlobId?: string;
  verificationChecks: {
    payerWalletPresent: boolean;
    pdfUploaded: boolean;
    amountMatchesLineItems: boolean;
    dueDateValid: boolean;
    unpaid: boolean;
    walrusBlobAvailable: boolean;
  };
};

export type EvidencePackageInput = {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amountSui: number;
  dueDate: string;
  payerWalletPresent: boolean;
  pdfUploaded: boolean;
  invoicePdfBlobId?: string;
};
