import type { Invoice } from "../types/receivable";

export function healthScore(invoice: Invoice) {
  const checks = [
    { label: "Payer wallet present", passed: invoice.evidence.payerWalletPresent, points: 15 },
    { label: "Invoice PDF uploaded", passed: invoice.evidence.invoicePdf, points: 20 },
    { label: "Line items match", passed: invoice.evidence.lineItemsMatch, points: 15 },
    { label: "Due date valid", passed: invoice.evidence.dueDateValid, points: 15 },
    { label: "Invoice unpaid", passed: invoice.status === "PENDING", points: 15 },
    { label: "Evidence complete", passed: invoice.evidence.evidenceComplete, points: 10 },
    { label: "Walrus blob available", passed: invoice.evidence.walrusAvailable, points: 10 },
  ];

  return {
    checks,
    score: checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0),
  };
}
