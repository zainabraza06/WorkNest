import { useId, useState } from 'react';
import { X } from 'lucide-react';

/** Free-text tags: Enter or comma adds, Backspace on empty input removes the last one. */
export function TagInput({ label, value = [], onChange, placeholder, max = 20, hint, error }) {
  const [draft, setDraft] = useState('');
  const id = useId();

  const add = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/,$/, '');
    if (tag.length >= 2 && !value.includes(tag) && value.length < max) onChange([...value, tag]);
    setDraft('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
        {label}
      </label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-ink-300 bg-white px-2 py-1.5 focus-within:border-ink-950 focus-within:ring-2 focus-within:ring-ink-950/10">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-sm border border-ink-200 bg-ink-50 py-0.5 pr-1 pl-2 text-sm text-ink-700">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full p-0.5 hover:bg-ink-200" aria-label={`Remove ${tag}`}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
          aria-describedby={`${id}-hint`}
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-base focus:outline-none sm:text-sm"
        />
      </div>
      <p id={`${id}-hint`} className={error ? 'text-xs font-medium text-danger-700' : 'text-xs text-ink-500'}>
        {error ?? hint ?? 'Press Enter or comma to add.'}
      </p>
    </div>
  );
}
