import { describe, expect, it } from 'vitest';
import { CATEGORIES, CITIES, nearestCity } from './constants';

describe('nearestCity', () => {
  it('finds Lahore from a point in the city', () => {
    expect(nearestCity({ lat: 31.55, lng: 74.34 })).toBe('Lahore');
  });

  it('tells Islamabad and Rawalpindi apart despite being ~15 km apart', () => {
    expect(nearestCity({ lat: 33.6844, lng: 73.0479 })).toBe('Islamabad');
    expect(nearestCity({ lat: 33.5651, lng: 73.0169 })).toBe('Rawalpindi');
  });

  it('falls back to Other far from every listed city', () => {
    expect(nearestCity({ lat: 28.0, lng: 69.0 })).toBe('Other');
  });

  it('is null-safe', () => expect(nearestCity(null)).toBeNull());
});

describe('shared taxonomy', () => {
  // The backend validates against this list; a drift means the form offers an option the API rejects
  const backend = [
    'plumbing', 'electrical', 'carpentry', 'painting', 'masonry', 'cleaning', 'house_help', 'cooking',
    'babysitting', 'elderly_care', 'gardening', 'driving', 'ac_repair', 'appliance_repair', 'welding',
    'moving_labor', 'security_guard', 'other',
  ];
  it('offers exactly the categories the backend accepts', () => {
    expect(CATEGORIES.map((c) => c.value).sort()).toEqual([...backend].sort());
  });
  it('lists the cities the backend accepts', () => {
    expect(CITIES.map((c) => c.value)).toContain('Karachi');
    expect(CITIES.at(-1).value).toBe('Other');
  });
});
