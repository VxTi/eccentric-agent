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

  return `${(amount / 1000).toFixed(amount < 10_000 && amount % 1000 !== 0 ? 1 : 0)}K`;
}

export function formatPercentageSymbol(percentage: number): string {
  if (percentage < 25) return '○';
  if (percentage < 50) return '◔';
  if (percentage < 75) return '◑';

  // slight margin to ensure we know we're almost there
  if (percentage < 99) return '◕';

  return '●';
}
