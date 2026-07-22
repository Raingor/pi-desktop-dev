export const USD_TO_CNY = 7.2;

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export function formatCost(cost: number, currency: 'USD' | 'CNY' = 'USD'): string {
  if (currency === 'CNY') {
    const cny = cost * USD_TO_CNY;
    if (cny >= 100) return `¥${cny.toFixed(2)}`;
    if (cny >= 1) return `¥${cny.toFixed(3)}`;
    return `¥${cny.toFixed(4)}`;
  }
  if (cost >= 100) return `$${cost.toFixed(2)}`;
  if (cost >= 1) return `$${cost.toFixed(3)}`;
  if (cost >= 0.01) return `¢${(cost * 100).toFixed(1)}`;
  return `$${cost.toFixed(4)}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatCostShort(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `¢${(n * 100).toFixed(1)}`;
  return `$${n.toFixed(4)}`;
}

export function formatCostShortCNY(n: number): string {
  const cny = n * USD_TO_CNY;
  if (cny >= 1) return `¥${cny.toFixed(2)}`;
  return `¥${cny.toFixed(4)}`;
}