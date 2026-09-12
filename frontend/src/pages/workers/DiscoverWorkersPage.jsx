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
import { cn } from '@/lib/cn';
import { CATEGORIES, CITIES } from '@/lib/constants';

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
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">Find workers</h1>
      <p className="mt-1 mb-4 text-ink-600">Describe the job in your own words — we'll match the right skills.</p>

      <SearchBar
        value={filters.q ?? ''}
        onSearch={(q) => update({ q, mode: q ? filters.mode ?? 'smart' : undefined, sort: q ? 'relevance' : filters.sort === 'relevance' ? 'trust' : filters.sort })}
        placeholder="e.g. need someone to fix a leaking pipe today"
        label="Search workers"
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <FilterPanel activeCount={activeCount} onReset={reset}>
          <Select label="Service" placeholder="All services" options={CATEGORIES} value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value })} />
          <Select label="City" placeholder="All cities" options={CITIES.map((c) => ({ value: c.value }))} value={filters.city ?? ''} onChange={(e) => update({ city: e.target.value })} />
          <Input label="Max daily rate" type="number" inputMode="numeric" min={0} step={500} leading="Rs" value={filters.maxRate ?? ''} onChange={(e) => update({ maxRate: e.target.value })} />
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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink-800">Show only</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary-700" checked={filters.verified === 'true'} onChange={(e) => update({ verified: e.target.checked && 'true' })} />
              ID-verified workers
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary-700" checked={filters.available === 'true'} onChange={(e) => update({ available: e.target.checked && 'true' })} />
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600" aria-live="polite">
              {data ? `${data.total} worker${data.total === 1 ? '' : 's'} found` : ' '}
              {smartApplied && <span className="ml-1 text-primary-700">· ranked by best match</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {hasGeo ? (
                <Button variant="ghost" size="sm" onClick={() => update({ lat: '', lng: '', radiusKm: '', sort: filters.sort === 'nearest' ? 'trust' : filters.sort })}>
                  Clear location
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={nearMe} loading={locating}>
                  <LocateFixed className="size-4" aria-hidden /> Near me
                </Button>
              )}
              {filters.q && (
                <button
                  type="button"
                  onClick={() => update({ mode: smartOn ? 'keyword' : 'smart' })}
                  aria-pressed={smartOn}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors',
                    smartOn ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-100',
                  )}
                >
                  <Sparkles className="size-4" aria-hidden /> Smart match
                </button>
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
              <ul className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
                {data.items.map((w) => (
                  <li key={w._id} className="flex">
                    <WorkerCard worker={w} />
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => update({ page })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
