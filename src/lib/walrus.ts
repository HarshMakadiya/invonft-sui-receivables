import type { EvidencePackage } from "../types/evidence";
import { canonicalJson } from "./evidencePackage";

const DEFAULT_PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

export const walrusConfig = {
  publisherUrl: stripTrailingSlash(import.meta.env.VITE_WALRUS_PUBLISHER_URL ?? DEFAULT_PUBLISHER_URL),
  aggregatorUrl: stripTrailingSlash(import.meta.env.VITE_WALRUS_AGGREGATOR_URL ?? DEFAULT_AGGREGATOR_URL),
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
  const response = await fetch(`${walrusConfig.publisherUrl}/v1/blobs?epochs=1`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: canonicalJson(packageData),
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

      lastError = new Error(`Walrus read failed: ${response.status} ${response.statusText}`);
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
