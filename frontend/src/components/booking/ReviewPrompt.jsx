import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';

import { reviewsApi } from '@/api/negotiation';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { StarInput } from '@/components/ui/StarRating';
import { InlineAlert } from '@/components/ui/States';

const ASPECTS = [
  { key: 'quality', label: 'Quality of work' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'communication', label: 'Communication' },
];

/** Shown on a completed booking until the signed-in party has left their review. */
export function ReviewPrompt({ booking }) {
  const alreadyReviewed = booking.myRole === 'client' ? booking.reviewed?.byClient : booking.reviewed?.byWorker;
  const other = booking.myRole === 'worker' ? booking.client : booking.worker;

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [aspects, setAspects] = useState({});
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: () =>
      reviewsApi.create(booking._id, {
        rating,
        text: text.trim() || undefined,
        aspects: Object.keys(aspects).length ? aspects : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', booking._id] });
      queryClient.invalidateQueries({ queryKey: ['worker', other?._id] });
    },
  });

  if (booking.status !== 'completed') return null;

  if (alreadyReviewed || submit.isSuccess) {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-success-600" aria-hidden />
          <p className="text-sm text-ink-700">Thanks — your review has been posted.</p>
        </CardBody>
      </Card>
    );
  }

  const onSubmit = (e) => {
    e.preventDefault();
    if (!rating) return setError('Please choose a star rating');
    setError(null);
    submit.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={`How was your experience with ${other?.name ?? 'the other party'}?`}
        description="Reviews are public and help build trust for everyone on WorkNest."
      />
      <CardBody>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {(error || submit.error) && <InlineAlert>{error ?? submit.error.message}</InlineAlert>}

          <StarInput value={rating} onChange={setRating} label="Overall rating" />

          {booking.myRole === 'client' && (
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-medium text-ink-800">Rate the details (optional)</legend>
              {ASPECTS.map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-1 text-sm text-ink-600">
                  {label}
                  <select
                    value={aspects[key] ?? ''}
                    onChange={(e) => setAspects((a) => ({ ...a, [key]: e.target.value ? Number(e.target.value) : undefined }))}
                    className="h-10 rounded-lg border border-ink-300 bg-white px-2 text-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-600/30 focus:outline-none"
                  >
                    <option value="">—</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} ★
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          )}

          <Textarea
            label="Your review (optional)"
            rows={3}
            maxLength={1500}
            placeholder={booking.myRole === 'client' ? 'Was the work done well? Would you hire again?' : 'Were the instructions clear? Was payment on time?'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <Button type="submit" loading={submit.isPending} className="sm:self-start">
            Post review
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
