import type { Invoice } from "../types/receivable";

const indexerUrl = import.meta.env.VITE_INVO_INDEXER_URL?.trim().replace(/\/+$/, "") ?? "";

export function isIndexerConfigured() {
  return Boolean(indexerUrl);
}

export async function fetchReceivablesFromIndexer(): Promise<Invoice[]> {
  if (!indexerUrl) {
    return [];
  }

  const response = await fetch(`${indexerUrl}/receivables`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Indexer read failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as Invoice[];
}

export async function syncReceivableWithIndexer(invoice: Invoice) {
  if (!indexerUrl) {
    return null;
  }

  const response = await fetch(`${indexerUrl}/receivables/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(invoice),
  });

  if (!response.ok) {
    throw new Error(`Indexer sync failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as Invoice;
}
