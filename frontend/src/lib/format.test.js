import { describe, expect, it } from 'vitest';
import { formatBudget, formatDuration, formatPKR, formatPKRShort, initials } from './format';

describe('formatPKR', () => {
  it('groups thousands', () => expect(formatPKR(25000)).toBe('Rs 25,000'));
  it('shows a dash for missing values rather than "Rs NaN"', () => expect(formatPKR(null)).toBe('—'));
  it('keeps zero', () => expect(formatPKR(0)).toBe('Rs 0'));
});

describe('formatPKRShort', () => {
  it('abbreviates thousands', () => expect(formatPKRShort(25000)).toBe('Rs 25k'));
  it('abbreviates lakhs the way Pakistani users read them', () => expect(formatPKRShort(250000)).toBe('Rs 2.5 lac'));
  it('leaves small amounts alone', () => expect(formatPKRShort(800)).toBe('Rs 800'));
});

describe('formatBudget', () => {
  it('collapses an equal range', () => expect(formatBudget({ min: 500, max: 500 })).toBe('Rs 500'));
  it('shows a range', () => expect(formatBudget({ min: 500, max: 900 })).toBe('Rs 500 – Rs 900'));
});

describe('formatDuration', () => {
  it('singularises', () => expect(formatDuration('monthly', 1)).toBe('1 month'));
  it('pluralises', () => expect(formatDuration('weekly', 3)).toBe('3 weeks'));
  it('returns nothing for an unknown type', () => expect(formatDuration('nope', 2)).toBe(''));
});

describe('initials', () => {
  it('takes the first two words', () => expect(initials('Ahmed Raza Khan')).toBe('AR'));
  it('copes with empty input', () => expect(initials('')).toBe(''));
});
