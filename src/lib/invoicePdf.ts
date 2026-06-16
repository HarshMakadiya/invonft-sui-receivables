import type { Invoice } from "../types/receivable";
import { paymentCoin } from "./coin";

type InvoicePdfInput = {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amount: number;
  dueDate: string;
  issuer: string;
  payer: string;
};

export function createInvoicePdfBlob(input: InvoicePdfInput | Invoice) {
  const lines = [
    "InvoNFT Receivable Invoice",
    `Invoice: ${"id" in input ? input.id : input.invoiceNumber}`,
    `Client: ${input.clientName}`,
    `Email: ${input.clientEmail}`,
    `Description: ${input.description}`,
    `Amount: ${input.amount} ${paymentCoin.symbol}`,
    `Due date: ${input.dueDate}`,
    `Issuer: ${input.issuer}`,
    `Payer: ${input.payer}`,
    "Generated for Sui Testnet demo use only.",
  ];

  return new Blob([buildPdf(lines)], { type: "application/pdf" });
}

export function downloadInvoicePdf(invoice: Invoice) {
  const url = URL.createObjectURL(createInvoicePdfBlob(invoice));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoice.id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildPdf(lines: string[]) {
  const escapedLines = lines.map(escapePdfText);
  const textCommands = escapedLines.map((line, index) => `BT /F1 12 Tf 72 ${742 - index * 24} Td (${line}) Tj ET`).join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${textCommands.length} >>\nstream\n${textCommands}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return body;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
