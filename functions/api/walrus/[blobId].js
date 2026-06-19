import { handleOptions } from "../../_shared/receivables.js";

const DEFAULT_WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
const MAX_ATTEMPTS = 4;

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet({ env, params }) {
  const blobId = params.blobId;
  if (!isSafeBlobId(blobId)) {
    return new Response("Invalid Walrus blob ID.", { status: 400 });
  }

  const aggregatorUrl = (env.WALRUS_AGGREGATOR_URL || env.VITE_WALRUS_AGGREGATOR_URL || DEFAULT_WALRUS_AGGREGATOR_URL)
    .trim()
    .replace(/\/+$/, "");
  const walrusUrl = `${aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;

  try {
    const response = await fetchWithRetry(walrusUrl);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=300");
    headers.set("X-InvoFi-Walrus-Blob", blobId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return new Response(
      [
        "Walrus evidence is temporarily unavailable.",
        "",
        "This Testnet blob may still be propagating, the public aggregator may be unavailable, or the blob may have expired.",
        `Blob ID: ${blobId}`,
        `Raw Walrus URL: ${walrusUrl}`,
        "",
        error?.message ? `Detail: ${error.message}` : "",
      ].join("\n"),
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return response;
      }
      lastError = new Error(`Walrus aggregator returned ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(300 * 2 ** attempt);
  }

  throw lastError || new Error("Walrus aggregator did not respond.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSafeBlobId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value);
}
