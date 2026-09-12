import { DURATION_MAP } from './constants';

const pkr = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** 25000 → "Rs 25,000" */
export const formatPKR = (amount) => (amount == null ? '—' : `Rs ${pkr.format(amount)}`);

/** 25000 → "Rs 25k" for tight spaces like cards */
export function formatPKRShort(amount) {
  if (amount == null) return '—';
  if (amount >= 100_000) return `Rs ${(amount / 100_000).toFixed(amount % 100_000 ? 1 : 0)} lac`;
  if (amount >= 1000) return `Rs ${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k`;
  return `Rs ${amount}`;
}

export const formatBudget = (budget) =>
  budget ? (budget.min === budget.max ? formatPKR(budget.min) : `${formatPKR(budget.min)} – ${formatPKR(budget.max)}`) : '—';

/** ('monthly', 2) → "2 months" */
export function formatDuration(type, count = 1) {
  const meta = DURATION_MAP[type];
  if (!meta) return '';
  return `${count} ${count === 1 ? meta.unit : meta.unitPlural}`;
}

const dateFmt = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(d) {
  const seconds = Math.round((new Date(d).getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(seconds) >= secs) return rtf.format(Math.round(seconds / secs), unit);
  }
  return 'just now';
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
