import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function SearchBar({ value = '', onSearch, placeholder, label = 'Search' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft.trim());
      }}
      className="flex min-w-0 gap-2"
    >
      <label htmlFor="search-input" className="sr-only">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          id="search-input"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-md border border-ink-300 bg-white pr-10 pl-10 text-base transition-[border-color,box-shadow] placeholder:text-ink-400 focus:border-ink-950 focus:ring-2 focus:ring-ink-950/10 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {draft && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onSearch('');
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <Button type="submit" size="lg" className="hidden sm:inline-flex">
        Search
      </Button>
    </form>
  );
}
