import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { workersApi } from '@/api';
import { ChipSelect } from '@/components/forms/ChipSelect';
import { LocationFields, fromPoint } from '@/components/forms/LocationFields';
import { FairPriceHint } from '@/components/pricing/FairPriceHint';
import { TagInput } from '@/components/forms/TagInput';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { CATEGORIES } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { focusFirstErrorSoon } from '@/lib/focusFirstError';
import { useAuthStore } from '@/stores/authStore';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function initialState(profile) {
  const slots = profile?.availability ?? [];
  return {
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    experienceYears: profile?.experienceYears ?? 0,
    categories: profile?.categories ?? [],
    skills: profile?.skills ?? [],
    rates: { hourly: profile?.rates?.hourly ?? '', daily: profile?.rates?.daily ?? '', monthly: profile?.rates?.monthly ?? '' },
    place: { city: profile?.city ?? '', address: profile?.address ?? '', location: fromPoint(profile?.location) },
    serviceRadiusKm: profile?.serviceRadiusKm ?? 15,
    isAvailable: profile?.isAvailable ?? true,
    days: slots.length ? slots.map((s) => s.dayOfWeek) : [1, 2, 3, 4, 5, 6],
    startTime: slots[0]?.startTime ?? '09:00',
    endTime: slots[0]?.endTime ?? '18:00',
  };
}

function validateLocally(f) {
  const e = {};
  if (!f.categories.length) e.categories = 'Select at least one service';
  if (!Number(f.rates.daily)) e['rates.daily'] = 'Daily rate is required';
  if (f.rates.monthly && Number(f.rates.monthly) < Number(f.rates.daily)) e['rates.monthly'] = 'Monthly rate should not be lower than daily';
  if (!f.place.city) e.city = 'Select your city';
  if (f.days.length && f.startTime >= f.endTime) e.endTime = 'End time must be after start time';
  return e;
}

export function WorkerProfileForm({ profile, onSaved, submitLabel = 'Save profile' }) {
  const [form, setForm] = useState(() => initialState(profile));
  const [localErrors, setLocalErrors] = useState({});
  const formRef = useRef(null);
  const setProfile = useAuthStore((s) => s.setProfile);

  const save = useMutation({
    mutationFn: (body) => (profile ? workersApi.update(body) : workersApi.create(body)),
    onSuccess: (saved) => {
      setProfile(saved);
      onSaved?.(saved);
    },
    // The server's message renders at the top of the form, which is off-screen from the button
    onError: () => focusFirstErrorSoon(formRef.current),
  });

  const errors = { ...(save.error?.fieldErrors ?? {}), ...localErrors };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const num = (v) => (v === '' || v == null ? undefined : Number(v));

  const onSubmit = (e) => {
    e.preventDefault();
    const found = validateLocally(form);
    setLocalErrors(found);
    if (Object.keys(found).length) {
      focusFirstErrorSoon(formRef.current);
      return;
    }

    save.mutate({
      headline: form.headline || undefined,
      bio: form.bio || undefined,
      experienceYears: Number(form.experienceYears) || 0,
      categories: form.categories,
      skills: form.skills,
      rates: { daily: num(form.rates.daily), hourly: num(form.rates.hourly), monthly: num(form.rates.monthly) },
      city: form.place.city,
      address: form.place.address || undefined,
      location: form.place.location,
      serviceRadiusKm: Number(form.serviceRadiusKm),
      isAvailable: form.isAvailable,
      availability: form.days.sort().map((d) => ({ dayOfWeek: d, startTime: form.startTime, endTime: form.endTime })),
    });
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {save.error && <InlineAlert>{save.error.message}</InlineAlert>}

      <Card>
        <CardHeader title="About you" description="This is the first thing clients see." />
        <CardBody className="flex flex-col gap-4">
          <Input label="Headline" placeholder="e.g. Experienced electrician — wiring & UPS installation" maxLength={100} value={form.headline} onChange={(e) => set({ headline: e.target.value })} error={errors.headline} />
          <Textarea label="Bio" rows={4} maxLength={2000} placeholder="Describe your experience, the kind of work you do best, and areas you cover." value={form.bio} onChange={(e) => set({ bio: e.target.value })} error={errors.bio} />
          <Input label="Years of experience" type="number" min={0} max={60} inputMode="numeric" className="sm:max-w-48" value={form.experienceYears} onChange={(e) => set({ experienceYears: e.target.value })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Services & skills" />
        <CardBody className="flex flex-col gap-5">
          <ChipSelect legend="Services you offer (up to 5)" options={CATEGORIES} value={form.categories} onChange={(categories) => set({ categories })} max={5} error={errors.categories} />
          <TagInput label="Specific skills" placeholder="e.g. pipe fitting, geyser repair" value={form.skills} onChange={(skills) => set({ skills })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your rates (PKR)" description="You can always negotiate per job. We'll show a fair-price range to help." />
        <CardBody className="flex flex-col gap-4">
          <FairPriceHint
            category={form.categories[0]}
            city={form.place.city}
            experienceYears={Number(form.experienceYears) || 0}
            onApply={(_min, _max, median) => set({ rates: { ...form.rates, daily: median } })}
            applyLabel="Use typical daily rate"
          />
          <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Daily rate" required type="number" inputMode="numeric" min={0} leading="Rs" value={form.rates.daily} onChange={(e) => set({ rates: { ...form.rates, daily: e.target.value } })} error={errors['rates.daily']} />
          <Input label="Hourly rate" type="number" inputMode="numeric" min={0} leading="Rs" value={form.rates.hourly} onChange={(e) => set({ rates: { ...form.rates, hourly: e.target.value } })} error={errors['rates.hourly']} />
          <Input label="Monthly rate" type="number" inputMode="numeric" min={0} leading="Rs" value={form.rates.monthly} onChange={(e) => set({ rates: { ...form.rates, monthly: e.target.value } })} error={errors['rates.monthly']} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where you work" />
        <CardBody className="flex flex-col gap-4">
          <LocationFields value={form.place} onChange={(place) => set({ place })} errors={errors} addressLabel="Area / neighbourhood" addressHint="Only your city and approximate distance are shown publicly." />
          <div>
            <label htmlFor="radius" className="text-sm font-medium text-ink-800">
              Travel up to <span className="font-semibold text-primary-600">{form.serviceRadiusKm} km</span>
            </label>
            <input id="radius" type="range" min={1} max={100} value={form.serviceRadiusKm} onChange={(e) => set({ serviceRadiusKm: e.target.value })} className="mt-2 w-full accent-primary-500" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Availability"
          action={
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.isAvailable} onChange={(e) => set({ isAvailable: e.target.checked })} className="size-4 accent-primary-500" />
              Taking new work
            </label>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-800">Working days</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d, i) => {
                const on = form.days.includes(i);
                return (
                  <label key={d} className={cn('flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-600', on ? 'border-primary-600 bg-primary-700 text-white' : 'border-ink-300 bg-white text-ink-700')}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set({ days: on ? form.days.filter((x) => x !== i) : [...form.days, i] })} />
                    {d}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Input label="From" type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            <Input label="To" type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} error={errors.endTime} />
          </div>
        </CardBody>
      </Card>

      <div className="sticky bottom-16 z-10 -mx-4 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" size="lg" loading={save.isPending} className="w-full md:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
