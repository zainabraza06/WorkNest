import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Clock, Landmark, Wallet } from 'lucide-react';

import { earningsApi } from '@/api';
import { toast } from '@/components/feedback/toastStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionLabel } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/States';
import { formatDate, formatPKR, timeAgo } from '@/lib/format';

const METHODS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'jazzcash', label: 'JazzCash' },
];

const WITHDRAWAL_META = {
  requested: { label: 'Waiting to be paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

function Money({ label, value, hint, icon: Icon, accent = false }) {
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className={`numeric mt-1 font-display text-2xl font-extrabold ${accent ? 'text-primary-600' : 'text-ink-950'}`}>
        {formatPKR(value)}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function PayoutMethodForm({ current, onSaved }) {
  const [form, setForm] = useState(
    current ?? { type: 'bank', accountTitle: '', accountNumber: '', bankName: '' },
  );
  const [errors, setErrors] = useState({});
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => earningsApi.setMethod(form),
    onSuccess: () => {
      toast({ title: 'Payout details saved', tone: 'success' });
      setErrors({});
      onSaved?.();
    },
    onError: (err) => {
      setErrors(err.fieldErrors ?? {});
      if (!err.details?.length) toast({ title: 'Could not save', description: err.message, tone: 'danger' });
    },
  });

  const isBank = form.type === 'bank';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Select
        label="How should we pay you?"
        options={METHODS}
        value={form.type}
        onChange={(e) => set({ type: e.target.value })}
      />
      <Input
        label="Account title"
        hint="The name exactly as it appears on the account"
        value={form.accountTitle}
        onChange={(e) => set({ accountTitle: e.target.value })}
        error={errors.accountTitle}
      />
      <Input
        label={isBank ? 'IBAN or account number' : 'Registered mobile number'}
        placeholder={isBank ? 'PK36SCBL0000001123456702' : '03001234567'}
        value={form.accountNumber}
        onChange={(e) => set({ accountNumber: e.target.value })}
        error={errors.accountNumber}
      />
      {isBank && (
        <Input label="Bank" placeholder="e.g. HBL, Meezan, UBL" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} error={errors.bankName} />
      )}
      <Button type="submit" loading={save.isPending} className="self-start">
        Save payout details
      </Button>
    </form>
  );
}

export default function EarningsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);

  const query = useQuery({ queryKey: ['earnings'], queryFn: earningsApi.get });

  const request = useMutation({
    mutationFn: () => earningsApi.request(Number(amount)),
    onSuccess: () => {
      toast({ title: 'Withdrawal requested', description: 'You will be notified once it has been paid.', tone: 'success' });
      setModal(null);
      setAmount('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['earnings'] });
    },
    onError: (err) => setError(err.message),
  });

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading earnings" className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </LoadingRegion>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} className="py-20" />;

  const d = query.data;
  const canWithdraw = d.available >= d.minWithdrawal && d.payoutMethod && !d.withdrawals.some((w) => w.status === 'requested');
  const waiting = d.withdrawals.find((w) => w.status === 'requested');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Earnings</h1>
        <p className="mt-1 text-ink-600">Money from completed jobs, less the {5}% platform fee.</p>
      </header>

      <div className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
        <Money label="Available" value={d.available} icon={Wallet} accent hint="Ready to withdraw" />
        <Money label="In escrow" value={d.inEscrow} icon={Clock} hint="Held against jobs not yet finished" />
        <Money label="Withdrawn" value={d.paid} icon={Banknote} hint="Already sent to you" />
        <Money label="Earned" value={d.earned} icon={Landmark} hint={`Across ${d.jobsPaid} paid job${d.jobsPaid === 1 ? '' : 's'}`} />
      </div>

      {waiting && (
        <InlineAlert tone="info" className="mt-4">
          <span className="font-semibold">{formatPKR(waiting.amount)} requested {timeAgo(waiting.requestedAt)}.</span>{' '}
          We will send it to your {waiting.method.type === 'bank' ? 'bank account' : waiting.method.type} and let you know.
        </InlineAlert>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={!canWithdraw} onClick={() => setModal('withdraw')}>
          Withdraw
        </Button>
        {!d.payoutMethod && <p className="text-sm text-ink-600">Add your payout details below first.</p>}
        {d.payoutMethod && d.available < d.minWithdrawal && !waiting && (
          <p className="text-sm text-ink-600">The smallest withdrawal is {formatPKR(d.minWithdrawal)}.</p>
        )}
      </div>

      <SectionLabel className="mt-10 mb-3">Payout details</SectionLabel>
      <Card>
        <CardBody>
          <PayoutMethodForm current={d.payoutMethod} onSaved={() => qc.invalidateQueries({ queryKey: ['earnings'] })} />
        </CardBody>
      </Card>

      <SectionLabel className="mt-10 mb-3">Withdrawals</SectionLabel>
      {d.withdrawals.length ? (
        <Card>
          <ul className="divide-y divide-ink-100">
            {d.withdrawals.map((w) => (
              <li key={w._id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="numeric font-bold">{formatPKR(w.amount)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-600">
                  {w.method.type === 'bank' ? w.method.bankName : w.method.type} · {w.method.accountNumber}
                  {w.reference && ` · ref ${w.reference}`}
                  {w.note && ` · ${w.note}`}
                </span>
                <span className="text-xs text-ink-500">{formatDate(w.requestedAt)}</span>
                <Badge tone={WITHDRAWAL_META[w.status].tone}>{WITHDRAWAL_META[w.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={Banknote} title="No withdrawals yet" description="Once a client releases a payment, you can withdraw it here." />
      )}

      <SectionLabel className="mt-10 mb-3">Payments</SectionLabel>
      {d.payments.length ? (
        <Card>
          <ul className="divide-y divide-ink-100">
            {d.payments.map((p) => (
              <li key={p._id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.booking?.job?.title ?? 'Booking'}</span>
                <span className="numeric text-sm text-ink-500">
                  {formatPKR(p.amount)} − {formatPKR(p.platformFee)} fee
                </span>
                <span className="numeric font-bold">{formatPKR(p.workerPayout)}</span>
                <Badge tone={p.status === 'released' ? 'success' : 'warning'}>{p.status === 'released' ? 'Paid out' : 'In escrow'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={Wallet} title="No payments yet" description="Payments appear here once a client pays into escrow." />
      )}

      <Modal
        open={modal === 'withdraw'}
        onClose={() => setModal(null)}
        title="Withdraw your earnings"
        description={`Up to ${formatPKR(d.available)} is available. We send it to the account below and confirm once it has gone out.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button loading={request.isPending} onClick={() => request.mutate()}>
              Request withdrawal
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
          <Input
            label="Amount"
            type="number"
            inputMode="numeric"
            leading="Rs"
            min={d.minWithdrawal}
            max={d.available}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={`Between ${formatPKR(d.minWithdrawal)} and ${formatPKR(d.available)}`}
          />
          <Button variant="outline" size="sm" className="self-start" onClick={() => setAmount(String(d.available))}>
            Withdraw everything
          </Button>
          {d.payoutMethod && (
            <p className="text-sm text-ink-600">
              To <span className="font-semibold">{d.payoutMethod.accountTitle}</span> ·{' '}
              {d.payoutMethod.type === 'bank' ? d.payoutMethod.bankName : d.payoutMethod.type} · {d.payoutMethod.accountNumber}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
