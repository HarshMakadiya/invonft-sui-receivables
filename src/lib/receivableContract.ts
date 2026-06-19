export type ReceivableContractConfig = {
  packageId: string;
  moduleName: string;
  escrowModuleName: string;
  invoiceCounterId: string;
  platformConfigId: string;
};

export const receivableContract: ReceivableContractConfig = {
  packageId: import.meta.env.VITE_INVO_RECEIVABLE_PACKAGE_ID ?? "",
  moduleName: import.meta.env.VITE_INVO_RECEIVABLE_MODULE ?? "receivable",
  escrowModuleName: import.meta.env.VITE_INVO_ESCROW_MODULE ?? "receivable_escrow",
  invoiceCounterId: import.meta.env.VITE_INVO_INVOICE_COUNTER_ID ?? "",
  platformConfigId: import.meta.env.VITE_INVO_PLATFORM_CONFIG_ID ?? "",
};

export function getReceivableTarget(functionName: string, config = receivableContract) {
  requireReceivableContract(config);
  return `${config.packageId}::${config.moduleName}::${functionName}`;
}

export function getReceivableEscrowTarget(functionName: string, config = receivableContract) {
  requireReceivableContract(config);
  return `${config.packageId}::${config.escrowModuleName}::${functionName}`;
}

export function getReceivableContractReadiness(config = receivableContract) {
  const missing = [
    ["VITE_INVO_RECEIVABLE_PACKAGE_ID", config.packageId],
    ["VITE_INVO_INVOICE_COUNTER_ID", config.invoiceCounterId],
    ["VITE_INVO_PLATFORM_CONFIG_ID", config.platformConfigId],
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
