import type { ChannelKind } from '@/lib/types';

/**
 * Tiny visual tag that says whether an entity is a "Product" (cross-channel
 * roll-up — Solar+Storage, Battery Only) or a "Channel" (a specific sales
 * team / surface — Inside Sales, Dealer, IP, etc.).
 */
export function KindLabel({
  kind,
  size = 'sm',
}: {
  kind: ChannelKind;
  size?: 'xs' | 'sm';
}) {
  const isProduct = kind === 'product';
  const text = isProduct ? 'Product' : 'Channel';
  const sizeCls = size === 'xs' ? 'text-[9px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5';
  const colorCls = isProduct
    ? 'bg-[var(--brand-cyan-soft)] text-[var(--ink-on-soft)] border border-[var(--brand-cyan)]/40'
    : 'bg-[var(--brand-navy)] text-white border border-[var(--brand-navy)]';
  return (
    <span
      className={`inline-flex items-center font-medium uppercase tracking-[0.08em] rounded ${sizeCls} ${colorCls}`}
      aria-label={`${text} entity`}
    >
      {text}
    </span>
  );
}
