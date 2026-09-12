import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { clientsApi } from '@/api';
import { LocationFields, fromPoint } from '@/components/forms/LocationFields';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { useAuthStore } from '@/stores/authStore';

export function ClientProfileForm({ profile, onSaved, submitLabel = 'Save profile' }) {
  const [place, setPlace] = useState({ city: profile?.city ?? '', address: profile?.address ?? '', location: fromPoint(profile?.location) });
  const [about, setAbout] = useState(profile?.about ?? '');
  const [localErrors, setLocalErrors] = useState({});
  const setProfile = useAuthStore((s) => s.setProfile);

  const save = useMutation({
    mutationFn: (body) => (profile ? clientsApi.update(body) : clientsApi.create(body)),
    onSuccess: (saved) => {
      setProfile(saved);
      onSaved?.(saved);
    },
  });

  const errors = { ...(save.error?.fieldErrors ?? {}), ...localErrors };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!place.city || !place.location) {
      setLocalErrors({ city: 'Select your city' });
      return;
    }
    setLocalErrors({});
    save.mutate({ city: place.city, address: place.address || undefined, location: place.location, about: about || undefined });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {save.error && <InlineAlert>{save.error.message}</InlineAlert>}
      <Card>
        <CardHeader title="Your location" description="Used to find workers near you. Your exact address is only shared with workers you hire." />
        <CardBody>
          <LocationFields value={place} onChange={setPlace} errors={errors} addressLabel="Home / work address" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="About (optional)" />
        <CardBody>
          <Textarea label="Anything workers should know?" rows={3} maxLength={1000} placeholder="e.g. Family home in DHA, usually need help on weekends." value={about} onChange={(e) => setAbout(e.target.value)} />
        </CardBody>
      </Card>
      <Button type="submit" size="lg" loading={save.isPending} className="w-full sm:w-auto sm:self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
