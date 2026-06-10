const DEFAULT_SUI_EXPLORER_URL = "https://suiscan.xyz/testnet";

export function isRealSuiId(value: string | undefined) {
  return Boolean(value?.startsWith("0x") && !value.includes("...") && !value.includes("mock"));
}

export function isRealTransactionDigest(value: string | undefined) {
  return Boolean(value && !value.includes("mock") && !value.includes("..."));
}

export function isRealWalrusBlobId(value: string | undefined) {
  return Boolean(value && !value.startsWith("mock_") && !value.startsWith("walrus_blob_") && !value.includes("..."));
}

export function suiObjectUrl(objectId: string) {
  return `${DEFAULT_SUI_EXPLORER_URL}/object/${objectId}`;
}

export function suiTransactionUrl(digest: string) {
  return `${DEFAULT_SUI_EXPLORER_URL}/tx/${digest}`;
}
