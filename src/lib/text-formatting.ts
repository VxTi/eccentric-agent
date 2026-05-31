export function formatBytes(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)}GB`;

  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)}MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)}KB`;

  return `${bytes} bytes`;
}

export function formatTokenCount(amount: number): string {
  if (amount < 1000) {
    return `${amount}`;
  }

  return `${(amount / 1000).toFixed(amount < 10_000 ? 1 : 0)}K`;
}
