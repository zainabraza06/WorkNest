import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LocateFixed, Sparkles, Users } from 'lucide-react';

import { workersApi } from '@/api';
import { getCurrentPosition } from '@/components/forms/LocationFields';
import { FilterPanel, SortSelect } from '@/components/search/FilterPanel';
import { SearchBar } from '@/components/search/SearchBar';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingRegion } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { WorkerCard, WorkerCardSkeleton } from '@/components/workers/WorkerCard';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { CATEGORIES, CITIES } from '@/lib/constants';
import { cn } from '@/lib/cn';

const SORTS = [
  { value: 'trust', label: 'Trust Score' },
  { value: 'relevance', label: 'Best match' },
  { value: 'rating', label: 'Rating' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'nearest', label: 'Nearest' },
];

export default function DiscoverWorkersPage() {
  const { filters, update, reset, activeCount } = useUrlFilters({ sort: 'trust', page: 1 });
  const [geoError, setGeoError] = useState(null);
  const [locating, setLocating] = useState(false);

  const query = useQuery({
    queryKey: ['workers', filters],
    queryFn: () => workersApi.search(filters),
    placeholderData: keepPreviousData,
  });

  const nearMe = async () => {
    setLocating(true);
    setGeoError(null);
    try {
      const { lat, lng } = await getCurrentPosition();
      update({ lat: lat.toFixed(5), lng: lng.toFixed(5), sort: 'nearest' });
    } catch (err) {
      setGeoError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const data = query.data;
  const hasGeo = Boolean(filters.lat);
  const smartOn = filters.mode === 'smart' && Boolean(filters.q);
  const smartApplied = data?.mode === 'smart';
  const sortOptions = hasGeo ? SORTS : SORTS.filter((s) => s.value !== 'nearest');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">Discovery</p>
        <h1 className="mt-2 text-3xl lg:text-4xl">Find workers</h1>
        <p className="mt-2 text-ink-500">Describe the job in plain words — matching reads intent, not just keywords.</p>
      </header>

      <div className="mt-6">
        <SearchBar
          value={filters.q ?? ''}
          onSearch={(q) => update({ q, mode: q ? (filters.mode ?? 'smart') : undefined, sort: q ? 'relevance' : filters.sort === 'relevance' ? 'trust' : filters.sort })}
          placeholder="e.g. need someone to fix a leaking pipe today"
          label="Search workers"
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[236px_minmax(0,1fr)]">
        <FilterPanel activeCount={activeCount} onReset={reset}>
          <Select label="Service" placeholder="All services" options={CATEGORIES} value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value })} />
          <Select label="City" placeholder="All cities" options={CITIES.map((c) => ({ value: c.value }))} value={filters.city ?? ''} onChange={(e) => update({ city: e.target.value })} />
          <Input label="Max daily rate" type="number" inputMode="numeric" min={0} step={500} leading="Rs" placeholder="Any" value={filters.maxRate ?? ''} onChange={(e) => update({ maxRate: e.target.value })} />
          <Select
            label="Minimum Trust Score"
            placeholder="Any"
            options={[
              { value: '85', label: '85+ Highly trusted' },
              { value: '70', label: '70+ Trusted' },
              { value: '50', label: '50+' },
            ]}
            value={filters.minTrust ?? ''}
            onChange={(e) => update({ minTrust: e.target.value })}
          />
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">Show only</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="size-3.5 rounded-xs accent-primary-500" checked={filters.verified === 'true'} onChange={(e) => update({ verified: e.target.checked && 'true' })} />
              ID-verified workers
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" className="size-3.5 rounded-xs accent-primary-500" checked={filters.available === 'true'} onChange={(e) => update({ available: e.target.checked && 'true' })} />
              Available now
            </label>
          </fieldset>
          {hasGeo && (
            <Select
              label="Distance"
              options={[5, 10, 25, 50, 100].map((km) => ({ value: String(km), label: `Within ${km} km` }))}
              value={filters.radiusKm ?? '25'}
              onChange={(e) => update({ radiusKm: e.target.value })}
            />
          )}
        </FilterPanel>

        <section aria-label="Results" className="min-w-0">
          <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4">
            <p className="text-sm text-ink-500" aria-live="polite">
              {data ? (
                <>
                  <span className="numeric font-bold text-ink-950">{data.total}</span> worker{data.total === 1 ? '' : 's'}
                  {smartApplied && <span className="ml-1.5 text-primary-600">· ranked by best match</span>}
                </>
              ) : (
                ' '
              )}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {filters.q && (
                <button
                  type="button"
                  onClick={() => update({ mode: smartOn ? 'keyword' : 'smart' })}
                  aria-pressed={smartOn}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors',
                    smartOn ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-950 hover:text-ink-950',
                  )}
                >
                  <Sparkles className="size-3.5" aria-hidden /> Smart match
                </button>
              )}
              {hasGeo ? (
                <Button variant="ghost" size="sm" onClick={() => update({ lat: '', lng: '', radiusKm: '', sort: filters.sort === 'nearest' ? 'trust' : filters.sort })}>
                  Clear location
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={nearMe} loading={locating}>
                  <LocateFixed className="size-3.5" aria-hidden /> Near me
                </Button>
              )}
              {!smartApplied && <SortSelect value={filters.sort} onChange={(sort) => update({ sort })} options={sortOptions} />}
            </div>
          </div>

          {geoError && <p className="mb-3 text-sm text-danger-700">{geoError}</p>}

          {query.isPending ? (
            <LoadingRegion label="Loading workers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <WorkerCardSkeleton key={i} />
              ))}
            </LoadingRegion>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={query.refetch} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No workers match your search"
              description="Try fewer filters, a wider distance, or describe the job differently."
              action={activeCount > 0 && <Button variant="outline" onClick={reset}>Clear filters</Button>}
            />
          ) : (
            <>
              <ul className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', query.isPlaceholderData && 'opacity-50')}>
                {data.items.map((w) => (
                  <li key={w._id} className="min-w-0">
                    <WorkerCard worker={w} />
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => update({ page })} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
