import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, Clock, ImagePlus, Trash2, Upload } from 'lucide-react';

import { usersApi, workersApi } from '@/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { InlineAlert } from '@/components/ui/States';
import { useAuthStore } from '@/stores/authStore';

function FilePickerButton({ accept, multiple, onFiles, children, ...props }) {
  const ref = useRef(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Button variant="outline" onClick={() => ref.current?.click()} {...props}>
        {children}
      </Button>
    </>
  );
}

export function AvatarUploader() {
  const { user, setUser } = useAuthStore();
  const upload = useMutation({ mutationFn: usersApi.uploadAvatar, onSuccess: setUser });

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        <Avatar src={user?.avatar?.url} name={user?.name} size="xl" />
        <div className="flex-1">
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-ink-600">A clear photo of your face builds trust. JPG, PNG or WebP, max 5 MB.</p>
          {upload.error && <p className="mt-1 text-sm text-danger-700">{upload.error.message}</p>}
        </div>
        <FilePickerButton accept="image/jpeg,image/png,image/webp" onFiles={([f]) => upload.mutate(f)} loading={upload.isPending}>
          <Upload className="size-4" aria-hidden /> Change photo
        </FilePickerButton>
      </CardBody>
    </Card>
  );
}

export function PortfolioManager() {
  const { profile, setProfile } = useAuthStore();
  const portfolio = profile?.portfolio ?? [];

  const add = useMutation({
    mutationFn: (files) => workersApi.addPortfolio(files),
    onSuccess: (items) => setProfile({ ...profile, portfolio: items }),
  });
  const remove = useMutation({
    mutationFn: workersApi.removePortfolio,
    onSuccess: (items) => setProfile({ ...profile, portfolio: items }),
  });

  return (
    <Card>
      <CardHeader
        title="Past work"
        description={`Photos of jobs you've done (${portfolio.length}/12).`}
        action={
          <FilePickerButton accept="image/jpeg,image/png,image/webp" multiple onFiles={(f) => add.mutate(f.slice(0, 6))} loading={add.isPending} disabled={portfolio.length >= 12} size="sm">
            <ImagePlus className="size-4" aria-hidden /> Add
          </FilePickerButton>
        }
      />
      <CardBody>
        {(add.error || remove.error) && <InlineAlert className="mb-3">{(add.error || remove.error).message}</InlineAlert>}
        {portfolio.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {portfolio.map((img) => (
              <li key={img._id} className="group relative aspect-square overflow-hidden rounded-lg bg-ink-100">
                <img src={img.url} alt={img.caption || 'Portfolio photo'} className="size-full object-cover" loading="lazy" />
                <button
                  type="button"
                  onClick={() => remove.mutate(img._id)}
                  disabled={remove.isPending}
                  className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1.5 text-danger-700 shadow hover:bg-white"
                  aria-label={`Remove ${img.caption || 'photo'}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-600">
            Workers with photos of past jobs get hired more often.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

const ID_STATUS = {
  none: { tone: 'neutral', label: 'Not submitted' },
  pending: { tone: 'secondary', label: 'Under review', icon: Clock },
  verified: { tone: 'success', label: 'Verified', icon: BadgeCheck },
  rejected: { tone: 'danger', label: 'Rejected — please resubmit' },
};

export function IdVerificationCard() {
  const { profile, setProfile } = useAuthStore();
  const status = profile?.idVerification?.status ?? 'none';
  const meta = ID_STATUS[status];

  const submit = useMutation({
    mutationFn: workersApi.submitId,
    onSuccess: (data) => setProfile({ ...profile, idVerification: { ...profile.idVerification, ...data } }),
  });

  return (
    <Card>
      <CardHeader
        title="ID verification"
        description="Upload a photo of your CNIC. It's stored privately and never shown to clients — they only see a verified badge."
        action={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />
      {status !== 'verified' && status !== 'pending' && (
        <CardBody>
          {submit.error && <InlineAlert className="mb-3">{submit.error.message}</InlineAlert>}
          <FilePickerButton accept="image/jpeg,image/png,image/webp,application/pdf" onFiles={([f]) => submit.mutate(f)} loading={submit.isPending}>
            <Upload className="size-4" aria-hidden /> Upload CNIC
          </FilePickerButton>
        </CardBody>
      )}
    </Card>
  );
}
