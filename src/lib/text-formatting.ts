export function formatBytes(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)}GB`;

  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)}MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)}KB`;

  return `${bytes} bytes`;
}
