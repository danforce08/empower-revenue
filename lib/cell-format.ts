import type { Channel, MetricSchemaField } from './types';

/**
 * Substitute `{key}` placeholders in a channel's cell_format template
 * with values from a metrics rollup. Missing values render as "—".
 */
export function renderCell(
  template: string,
  metrics: Record<string, number | string[] | undefined>,
  schema?: MetricSchemaField[],
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = metrics[key];
    if (typeof v !== 'number') return '—';
    const field = schema?.find((f) => f.key === key);
    if (field?.type === 'currency') return formatCurrency(v);
    return formatCount(v);
  });
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function gapLabel(actual: number, target: number): string {
  if (!target) return '';
  const gap = actual - target;
  return gap >= 0 ? `+${gap}` : `${gap}`;
}

export function renderChannelCell(
  channel: Channel,
  rollup: Record<string, number | string[]>,
): string {
  return renderCell(channel.cell_format, rollup, channel.metrics_schema);
}
