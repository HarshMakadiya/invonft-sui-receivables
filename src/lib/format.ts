import { paymentCoin } from "./coin";

export function formatToken(value: number) {
  return `${value.toLocaleString()} ${paymentCoin.symbol}`;
}

export function compactNumber(value: number) {
  if (value >= 1e9) {
    const val = value / 1e9;
    return `${Number(val.toFixed(val % 1 === 0 ? 0 : 1))}B`;
  }
  if (value >= 1e6) {
    const val = value / 1e6;
    return `${Number(val.toFixed(val % 1 === 0 ? 0 : 1))}M`;
  }
  if (value >= 1e3) {
    const val = value / 1e3;
    return `${Number(val.toFixed(val % 1 === 0 ? 0 : 1))}K`;
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatCompactToken(value: number) {
  return `${compactNumber(value)} ${paymentCoin.symbol}`;
}

export function shortAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-3)}` : address;
}
