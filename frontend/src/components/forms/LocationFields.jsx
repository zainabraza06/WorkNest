import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { CITIES, CITY_MAP } from '@/lib/constants';

/** GeoJSON { coordinates: [lng, lat] } → { lat, lng } */
export const fromPoint = (point) => (point?.coordinates ? { lng: point.coordinates[0], lat: point.coordinates[1] } : null);

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Could not get your location — permission denied or unavailable')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
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
      const location = await getCurrentPosition();
      onChange({ ...value, location, locationSource: 'gps' });
      setStatus({ state: 'done' });
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
        <p className="flex-1 text-sm text-ink-700" aria-live="polite">
          {precise
            ? 'Using your exact location for distance matching.'
            : value.location
              ? `Using the ${value.city} city centre. Share your location for better nearby matches.`
              : 'Pick a city or share your location.'}
          {status.state === 'error' && <span className="block text-danger-700">{status.message}</span>}
        </p>
        <Button variant="outline" size="sm" onClick={locate} loading={status.state === 'loading'}>
          <LocateFixed className="size-4" aria-hidden /> Use my location
        </Button>
      </div>
      {errors.location && <p className="text-xs font-medium text-danger-700">{errors.location}</p>}
    </div>
  );
}
