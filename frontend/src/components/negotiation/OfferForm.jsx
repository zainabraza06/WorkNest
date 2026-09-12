import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { DURATION_MAP } from '@/lib/constants';
import { formatPKR } from '@/lib/format';

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/**
 * Used for the first offer (mode="create") and for counter-offers (mode="counter").
 * `renderAside` is a slot for the AI fair-price hint; it receives a setter for the amount.
 */
export function OfferForm({ mode = 'create', initial, durationType, onSubmit, submitting, error, onCancel, renderAside, reference }) {
  const [form, setForm] = useState({
    amount: initial?.amount ?? '',
    durationCount: initial?.durationCount ?? 1,
    startDate: toDateInput(initial?.startDate),
    terms: initial?.terms ?? '',
    note: '',
  });
  const [localError, setLocalError] = useState(null);
  const fieldErrors = error?.fieldErrors ?? {};
  const unit = DURATION_MAP[durationType];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e) => {
    e.preventDefault();
    if (!(Number(form.amount) >= 100)) return setLocalError('Enter an amount of at least Rs 100');
    setLocalError(null);
    onSubmit({
      amount: Number(form.amount),
      durationCount: Number(form.durationCount),
      startDate: form.startDate || undefined,
      terms: form.terms.trim() || undefined,
      ...(mode === 'create' ? { coverNote: form.note.trim() || undefined } : { message: form.note.trim() || undefined }),
    });
  };

  const diff = reference && Number(form.amount) ? Number(form.amount) - reference.amount : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {(localError || (error && !Object.keys(fieldErrors).length)) && <InlineAlert>{localError ?? error.message}</InlineAlert>}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Input
          label={`Your price for the whole job`}
          type="number"
          inputMode="numeric"
          min={100}
          step={100}
          required
          autoFocus
          leading="Rs"
          value={form.amount}
          onChange={(e) => set({ amount: e.target.value })}
          error={fieldErrors.amount}
          hint={
            diff !== null && diff !== 0
              ? `${diff > 0 ? '+' : '−'}${formatPKR(Math.abs(diff))} compared to the current offer`
              : undefined
          }
        />
      </div>
      {renderAside?.((amount) => set({ amount }))}

      <div className="grid grid-cols-2 gap-4">
        <Input label={`Number of ${unit?.unitPlural ?? 'days'}`} type="number" inputMode="numeric" min={1} max={365} value={form.durationCount} onChange={(e) => set({ durationCount: e.target.value })} error={fieldErrors.durationCount} />
        <Input label="Start date" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} error={fieldErrors.startDate} />
      </div>

      <Textarea label="Terms (optional)" rows={2} maxLength={1000} placeholder="e.g. Materials not included. Half-day on Saturdays." value={form.terms} onChange={(e) => set({ terms: e.target.value })} error={fieldErrors.terms} />
      <Textarea
        label={mode === 'create' ? 'Message to the client (optional)' : 'Add a note (optional)'}
        rows={2}
        maxLength={1000}
        placeholder={mode === 'create' ? 'Introduce yourself and explain why you are a good fit.' : 'Explain your counter-offer.'}
        value={form.note}
        onChange={(e) => set({ note: e.target.value })}
      />

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {mode === 'create' ? 'Send offer' : 'Send counter-offer'}
        </Button>
      </div>
    </form>
  );
}
