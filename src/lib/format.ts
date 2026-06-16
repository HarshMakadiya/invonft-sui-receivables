import { paymentCoin } from "./coin";

export function formatToken(value: number) {
  return `${value.toLocaleString()} ${paymentCoin.symbol}`;
}

export function compactNumber(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  }
  return value.toLocaleString();
}

export function formatCompactToken(value: number) {
  return `${compactNumber(value)} ${paymentCoin.symbol}`;
}

export function shortAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-3)}` : address;
}
