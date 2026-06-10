export function formatSui(value: number) {
  return `${value.toLocaleString()} SUI`;
}

export function formatCompactSui(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K SUI`;
  }
  return formatSui(value);
}

export function shortAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 8)}...${address.slice(-3)}` : address;
}

export function suiToMist(value: number) {
  return BigInt(Math.round(value * 1_000_000_000));
}
