import type { EvidencePackage } from "../types/evidence";
import { canonicalJson } from "./evidencePackage";

const DEFAULT_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
const DEFAULT_STORAGE_EPOCHS = 5;

export const walrusConfig = {
  publisherUrl: stripTrailingSlash(import.meta.env.VITE_WALRUS_PUBLISHER_URL ?? DEFAULT_PUBLISHER_URL),
  aggregatorUrl: stripTrailingSlash(import.meta.env.VITE_WALRUS_AGGREGATOR_URL ?? DEFAULT_AGGREGATOR_URL),
  storageEpochs: parseStorageEpochs(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS),
};

type WalrusStoreResponse =
  | {
      newlyCreated: {
        blobObject: {
          id: string;
          blobId: string;
          size: number;
          certifiedEpoch?: number;
        };
      };
    }
  | {
      alreadyCertified: {
        blobId: string;
        endEpoch?: number;
      };
    };

export type WalrusUploadResult = {
  blobId: string;
  blobObjectId?: string;
  response: WalrusStoreResponse;
};

export async function uploadEvidencePackage(packageData: EvidencePackage): Promise<WalrusUploadResult> {
  return uploadWalrusBlob(new Blob([canonicalJson(packageData)], { type: "application/json" }));
}

export async function uploadWalrusBlob(blob: Blob): Promise<WalrusUploadResult> {
  const response = await fetch(`${walrusConfig.publisherUrl}/v1/blobs?epochs=${walrusConfig.storageEpochs}`, {
    method: "PUT",
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as WalrusStoreResponse;
  if ("newlyCreated" in data) {
    return {
      blobId: data.newlyCreated.blobObject.blobId,
      blobObjectId: data.newlyCreated.blobObject.id,
      response: data,
    };
  }

  return {
    blobId: data.alreadyCertified.blobId,
    response: data,
  };
}

export async function downloadEvidencePackage(blobId: string, retries = 4): Promise<EvidencePackage> {
  const response = await fetchWithBackoff(`${walrusConfig.aggregatorUrl}/v1/blobs/${blobId}`, retries);
  return (await response.json()) as EvidencePackage;
}

export function evidenceUrl(blobId: string) {
  return `${walrusConfig.aggregatorUrl}/v1/blobs/${blobId}`;
}

async function fetchWithBackoff(url: string, retries: number) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }

      lastError = new Error(await walrusReadErrorMessage(response));
      if (response.status !== 404) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
    }

    await wait(350 * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Walrus read failed");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function parseStorageEpochs(value: string | undefined) {
  const epochs = Number(value);
  return Number.isFinite(epochs) && epochs > 0 ? Math.floor(epochs) : DEFAULT_STORAGE_EPOCHS;
}

async function walrusReadErrorMessage(response: Response) {
  if (response.status === 404) {
    return "Walrus blob not found. It may have expired on Testnet, been uploaded to a different Walrus network, or the stored blob ID is incorrect.";
  }

  try {
    const payload = await response.json();
    const message = payload?.error?.message ?? payload?.message;
    if (message) {
      return `Walrus read failed: ${response.status} ${message}`;
    }
  } catch {
    // Keep the generic response text below.
  }

  return `Walrus read failed: ${response.status} ${response.statusText}`;
}
