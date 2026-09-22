import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { CITIES, CITY_MAP } from '@/lib/constants';

/** GeoJSON { coordinates: [lng, lat] } → { lat, lng } */
export const fromPoint = (point) => (point?.coordinates ? { lng: point.coordinates[0], lat: point.coordinates[1] } : null);

/**
 * Browsers report three distinct failures through one callback, and collapsing them into one
 * message makes a blocked permission indistinguishable from a timeout — which is the difference
 * between "change a setting" and "try again".
 */
const GEO_ERRORS = {
  1: 'Location access is blocked. Allow it for this site in your browser settings, then try again.',
  2: 'Your device could not determine a position. Check that location services are switched on.',
  3: 'Getting your location timed out. Try again, ideally near a window or on Wi-Fi.',
};

export function getCurrentPosition({ maximumAge = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device'));
    // Geolocation silently fails outside a secure context, which looks like a broken button
    if (!window.isSecureContext) return reject(new Error('Location needs a secure (https) connection'));

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(GEO_ERRORS[err?.code] ?? 'Could not get your location')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge },
    );
  });
}

/**
 * value: { city, location: { lat, lng }, address }
 * Choosing a city sets approximate coordinates; "Use my location" makes them precise.
 */
export function LocationFields({ value, onChange, errors = {}, addressLabel = 'Address / area', addressHint }) {
  const [status, setStatus] = useState({ state: 'idle' });
  const precise = value.locationSource === 'gps';

  const onCity = (e) => {
    const city = e.target.value;
    const centre = CITY_MAP[city];
    onChange({ ...value, city, ...(!precise && centre && { location: { lat: centre.lat, lng: centre.lng } }) });
  };

  const locate = async () => {
    setStatus({ state: 'loading' });
    try {
      // maximumAge 0: the user asked for their position *now*, and a cached fix returns so
      // fast that the button appears to do nothing at all.
      const { accuracy, ...location } = await getCurrentPosition({ maximumAge: 0 });
      onChange({ ...value, location, locationSource: 'gps' });
      setStatus({ state: 'done', location, accuracy });
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="City"
        required
        placeholder="Select your city"
        options={CITIES.map((c) => ({ value: c.value }))}
        value={value.city ?? ''}
        onChange={onCity}
        error={errors.city}
      />
      <Input label={addressLabel} hint={addressHint} value={value.address ?? ''} onChange={(e) => onChange({ ...value, address: e.target.value })} error={errors.address} maxLength={200} />
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ink-100 px-3 py-2.5">
        <MapPin className="size-4 text-ink-500" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-ink-700" aria-live="polite">
          {precise
            ? 'Using your exact location for distance matching.'
            : value.location
              ? `Using the ${value.city} city centre. Share your location for better nearby matches.`
              : 'Pick a city or share your location.'}
          {/* Confirm the pin that was just taken. Without this, pressing the button a second
              time changes nothing on screen and reads as a dead control. */}
          {status.state === 'done' && status.location && (
            <span className="numeric block text-xs text-ink-500">
              Pinned at {status.location.lat.toFixed(4)}, {status.location.lng.toFixed(4)}
              {status.accuracy ? ` · accurate to about ${Math.round(status.accuracy)} m` : ''}
            </span>
          )}
          {status.state === 'error' && <span className="block text-danger-700">{status.message}</span>}
        </p>
        <Button variant="outline" size="sm" onClick={locate} loading={status.state === 'loading'}>
          <LocateFixed className="size-4" aria-hidden /> {precise ? 'Update location' : 'Use my location'}
        </Button>
      </div>
      {errors.location && <p className="text-xs font-medium text-danger-700">{errors.location}</p>}
    </div>
  );
}
