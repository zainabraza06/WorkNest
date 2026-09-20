import { useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';

import { RadioCards } from '@/components/forms/ChipSelect';
import { LocationFields, fromPoint } from '@/components/forms/LocationFields';
import { TagInput } from '@/components/forms/TagInput';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { CATEGORIES, CATEGORY_MAP, DURATION_MAP, DURATION_TYPES, URGENCY } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { formatBudget, formatDate, formatDuration } from '@/lib/format';

const STEPS = ['The job', 'Timing', 'Location', 'Budget'];

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export function initialJobForm({ job, clientProfile, defaults = {} }) {
  return {
    title: job?.title ?? '',
    description: job?.description ?? '',
    category: job?.category ?? defaults.category ?? '',
    skills: job?.skills ?? [],
    durationType: job?.durationType ?? 'one_day',
    durationCount: job?.durationCount ?? 1,
    startDate: job?.startDate ? job.startDate.slice(0, 10) : todayISO(),
    urgency: job?.urgency ?? 'normal',
    place: {
      city: job?.city ?? clientProfile?.city ?? '',
      address: job?.address ?? clientProfile?.address ?? '',
      location: fromPoint(job?.location ?? clientProfile?.location),
    },
    budgetMin: job?.budget?.min ?? '',
    budgetMax: job?.budget?.max ?? '',
  };
}

function validateStep(step, f) {
  const e = {};
  if (step === 0) {
    if (f.title.trim().length < 5) e.title = 'Give the job a short title (at least 5 characters)';
    if (!f.category) e.category = 'Choose a category';
    if (f.description.trim().length < 20) e.description = 'Describe the job in at least 20 characters';
  }
  if (step === 1) {
    if (!f.startDate) e.startDate = 'Pick a start date';
    else if (f.startDate < todayISO()) e.startDate = 'Start date cannot be in the past';
    if (!(Number(f.durationCount) >= 1)) e.durationCount = 'Must be at least 1';
  }
  if (step === 2 && (!f.place.city || !f.place.location)) e.city = 'Select the city where the work is';
  if (step === 3) {
    if (!(Number(f.budgetMin) >= 100)) e['budget.min'] = 'Minimum budget is Rs 100';
    if (!(Number(f.budgetMax) >= Number(f.budgetMin))) e['budget.max'] = 'Maximum must be at least the minimum';
  }
  return e;
}

// Which step owns each server-side field, so a server error can send the user back to the right step
const FIELD_STEP = { title: 0, category: 0, description: 0, skills: 0, durationType: 1, durationCount: 1, startDate: 1, urgency: 1, city: 2, location: 2, address: 2, 'budget.min': 3, 'budget.max': 3 };

/**
 * Progressive multi-step job form. `renderBudgetAside` lets the page inject
 * the AI fair-price suggestion next to the budget inputs.
 */
export function JobForm({ initial, onSubmit, submitting, serverError, submitLabel = 'Post job', renderBudgetAside }) {
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const allErrors = { ...(serverError?.fieldErrors ?? {}), ...errors };
  const unit = DURATION_MAP[form.durationType];
  const isLast = step === STEPS.length - 1;

  const next = (e) => {
    e.preventDefault();
    const found = validateStep(step, form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!isLast) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onSubmit(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        skills: form.skills,
        durationType: form.durationType,
        durationCount: Number(form.durationCount),
        startDate: form.startDate,
        urgency: form.urgency,
        city: form.place.city,
        address: form.place.address || undefined,
        location: form.place.location,
        budget: { min: Number(form.budgetMin), max: Number(form.budgetMax) },
      },
      {
        onFieldError: (fieldErrors) => {
          const steps = Object.keys(fieldErrors).map((k) => FIELD_STEP[k]).filter((s) => s !== undefined);
          if (steps.length) setStep(Math.min(...steps));
        },
      },
    );
  };

  return (
    <form onSubmit={next} noValidate className="flex flex-col gap-5">
      {/* Progress */}
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined}>
            <div className={cn('h-0.5 transition-colors', i <= step ? 'bg-primary-500' : 'bg-ink-200')} />
            <p className={cn('mt-1.5 flex items-center gap-1 text-xs font-medium', i === step ? 'text-ink-900' : 'text-ink-500')}>
              {i < step && <Check className="size-3" aria-hidden />}
              <span className={cn(i !== step && 'hidden sm:inline')}>{label}</span>
              <span className="sr-only">{i < step ? ' (done)' : ''}</span>
            </p>
          </li>
        ))}
      </ol>

      {serverError && !Object.keys(serverError.fieldErrors).length && <InlineAlert>{serverError.message}</InlineAlert>}

      <Card>
        <CardBody className="flex flex-col gap-5 p-5 sm:p-6">
          {step === 0 && (
            <>
              <h2 className="text-xl">What do you need done?</h2>
              <Input label="Job title" required autoFocus maxLength={120} placeholder="e.g. Fix leaking kitchen sink pipe" value={form.title} onChange={(e) => set({ title: e.target.value })} error={allErrors.title} />
              <Select label="Category" required placeholder="Select a category" options={CATEGORIES} value={form.category} onChange={(e) => set({ category: e.target.value })} error={allErrors.category} />
              <Textarea
                label="Describe the job"
                required
                rows={5}
                maxLength={3000}
                placeholder="What's the problem, what needs to be done, anything the worker should bring…"
                hint={`${form.description.trim().length}/3000 — more detail gets better matches and more accurate offers.`}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                error={allErrors.description}
              />
              <TagInput label="Skills needed (optional)" placeholder="e.g. pipe fitting" max={10} value={form.skills} onChange={(skills) => set({ skills })} />
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl">When and for how long?</h2>
              <RadioCards
                legend="Hiring for"
                name="durationType"
                value={form.durationType}
                onChange={(durationType) => set({ durationType, durationCount: 1 })}
                options={DURATION_TYPES.map((d) => ({ value: d.value, label: d.label, description: d.value === 'one_day' ? 'Single visit' : d.value === 'weekly' ? 'A few weeks' : 'Ongoing work' }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={`Number of ${unit.unitPlural}`} type="number" inputMode="numeric" min={1} max={365} required value={form.durationCount} onChange={(e) => set({ durationCount: e.target.value })} error={allErrors.durationCount} />
                <Input label="Start date" type="date" min={todayISO()} required value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} error={allErrors.startDate} />
              </div>
              <RadioCards legend="How soon?" name="urgency" value={form.urgency} onChange={(urgency) => set({ urgency })} options={URGENCY} />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl">Where is the work?</h2>
              <LocationFields value={form.place} onChange={(place) => set({ place })} errors={allErrors} addressLabel="Address" addressHint="Only shared with the worker you hire. Others see the city and distance." />
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl">What's your budget?</h2>
              <p className="-mt-3 text-sm text-ink-600">
                Total for {formatDuration(form.durationType, Number(form.durationCount) || 1)}. Workers can send counter-offers.
              </p>
              <div className="grid gap-5 md:grid-cols-[1fr_260px]">
                <div className="grid grid-cols-2 gap-4 self-start">
                  <Input label="Minimum" type="number" inputMode="numeric" min={100} step={100} required leading="Rs" value={form.budgetMin} onChange={(e) => set({ budgetMin: e.target.value })} error={allErrors['budget.min']} />
                  <Input label="Maximum" type="number" inputMode="numeric" min={100} step={100} required leading="Rs" value={form.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} error={allErrors['budget.max']} />
                </div>
                {renderBudgetAside?.(form, (min, max) => set({ budgetMin: min, budgetMax: max }))}
              </div>

              <div className="rounded-lg bg-ink-100 p-4 text-sm">
                <p className="mb-2 font-semibold text-ink-800">Summary</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-700">
                  <dt className="text-ink-500">Job</dt>
                  <dd className="truncate">{form.title}</dd>
                  <dt className="text-ink-500">Category</dt>
                  <dd>{CATEGORY_MAP[form.category]?.label}</dd>
                  <dt className="text-ink-500">Duration</dt>
                  <dd>
                    {formatDuration(form.durationType, Number(form.durationCount))} from {formatDate(form.startDate)}
                  </dd>
                  <dt className="text-ink-500">Location</dt>
                  <dd>{form.place.city}</dd>
                  <dt className="text-ink-500">Budget</dt>
                  <dd>{form.budgetMin && form.budgetMax ? formatBudget({ min: Number(form.budgetMin), max: Number(form.budgetMax) }) : '—'}</dd>
                </dl>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="lg" loading={submitting}>
          {isLast ? submitLabel : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
