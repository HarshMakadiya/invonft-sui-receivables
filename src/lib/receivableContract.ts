export type ReceivableContractConfig = {
  packageId: string;
  moduleName: string;
  invoiceCounterId: string;
};

export const receivableContract: ReceivableContractConfig = {
  packageId: import.meta.env.VITE_INVO_RECEIVABLE_PACKAGE_ID ?? "",
  moduleName: import.meta.env.VITE_INVO_RECEIVABLE_MODULE ?? "receivable",
  invoiceCounterId: import.meta.env.VITE_INVO_INVOICE_COUNTER_ID ?? "",
};

export function getReceivableTarget(functionName: string, config = receivableContract) {
  requireReceivableContract(config);
  return `${config.packageId}::${config.moduleName}::${functionName}`;
}

export function getReceivableContractReadiness(config = receivableContract) {
  const missing = [
    ["VITE_INVO_RECEIVABLE_PACKAGE_ID", config.packageId],
    ["VITE_INVO_INVOICE_COUNTER_ID", config.invoiceCounterId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    ready: missing.length === 0,
    missing,
  };
}

function requireReceivableContract(config: ReceivableContractConfig) {
  const readiness = getReceivableContractReadiness(config);
  if (!readiness.ready) {
    throw new Error(`Receivable contract is not configured. Missing: ${readiness.missing.join(", ")}`);
  }
}
