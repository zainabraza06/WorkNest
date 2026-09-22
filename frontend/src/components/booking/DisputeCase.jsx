import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gavel, Paperclip, X } from 'lucide-react';

import { bookingsApi } from '@/api/negotiation';
import { toast } from '@/components/feedback/toastStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/States';
import { formatDate, timeAgo } from '@/lib/format';

const MAX_FILES = 5;

/** Photograph picker shared by both statement forms. */
function EvidencePicker({ files, onChange, disabled }) {
  const input = useRef(null);

  const add = (e) => {
    const picked = [...e.target.files];
    onChange([...files, ...picked].slice(0, MAX_FILES));
    e.target.value = ''; // so the same file can be picked again after removing it
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || files.length >= MAX_FILES} onClick={() => input.current?.click()}>
        <Paperclip className="size-3.5" aria-hidden /> Add photos
      </Button>
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative">
              <img src={URL.createObjectURL(f)} alt={f.name} className="size-16 rounded-md border border-ink-200 object-cover" />
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-ink-950 p-0.5 text-white"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-500">
        {files.length}/{MAX_FILES} photos. Pictures of the work carry more weight than a description of it.
      </p>
    </div>
  );
}

function Statement({ statement, people }) {
  const person = people[String(statement.by)] ?? { name: statement.byRole === 'worker' ? 'The worker' : 'The client' };
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar src={person.avatar?.url} name={person.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {person.name} <span className="font-normal text-ink-500 capitalize">· {statement.byRole}</span>
          </p>
          <p className="text-xs text-ink-500">{timeAgo(statement.at)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm whitespace-pre-line text-ink-700">{statement.text}</p>
      {statement.evidence?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {statement.evidence.map((img) => (
            <li key={img.publicId}>
              <a href={img.url} target="_blank" rel="noreferrer">
                <img src={img.url} alt="Evidence submitted with this statement" className="size-24 rounded-md border border-ink-200 object-cover transition-opacity hover:opacity-80" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The dispute as both parties see it: every statement, every photograph, and the decision.
 *
 * Deciding who keeps the money on one sentence from one side is not a judgement, so the worker
 * can answer and both can show their work. Whoever loses can read why.
 */
export function DisputeCase({ booking, canRespond }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);

  const dispute = booking.dispute;
  const people = {
    [String(booking.client?._id)]: booking.client,
    [String(booking.worker?._id)]: booking.worker,
  };

  const submit = useMutation({
    mutationFn: () => bookingsApi.addStatement(booking._id, text, files),
    onSuccess: (updated) => {
      qc.setQueryData(['booking', booking._id], updated);
      qc.invalidateQueries({ queryKey: ['bookings'] });
      setText('');
      setFiles([]);
      toast({ title: 'Your response was added', tone: 'success' });
    },
    onError: (err) => toast({ title: 'Could not add your response', description: err.message, tone: 'danger' }),
  });

  if (!dispute?.statements?.length) return null;
  const resolved = dispute.resolution?.outcome;

  return (
    <Card>
      <CardHeader
        title="Dispute"
        description={`Opened ${formatDate(dispute.openedAt)} · payment stays in escrow until it is decided`}
      />
      <CardBody>
        {resolved && (
          <InlineAlert tone={resolved === 'release' ? 'success' : 'info'} className="mb-4">
            <span className="font-semibold">
              Resolved: payment {resolved === 'release' ? 'released to the worker' : 'refunded to the client'}.
            </span>
            {dispute.resolution.note && <span className="mt-1 block">{dispute.resolution.note}</span>}
          </InlineAlert>
        )}

        <ul className="divide-y divide-ink-100">
          {dispute.statements.map((s, i) => (
            <Statement key={s._id ?? i} statement={s} people={people} />
          ))}
        </ul>

        {canRespond && !resolved && (
          <form
            className="mt-5 flex flex-col gap-3 border-t border-ink-200 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <Textarea
              label="Your response"
              rows={3}
              maxLength={2000}
              placeholder="Explain what happened from your side. Anything you can show helps."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <EvidencePicker files={files} onChange={setFiles} disabled={submit.isPending} />
            <Button type="submit" className="self-start" loading={submit.isPending} disabled={text.trim().length < 10}>
              <Gavel className="size-4" aria-hidden /> Add my response
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

export { EvidencePicker };
