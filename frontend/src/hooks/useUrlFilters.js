import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Keeps filter state in the URL so results are shareable and survive back/forward.
 * Any change other than `page` resets pagination to page 1.
 */
export function useUrlFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out = { ...defaults };
    for (const [k, v] of params.entries()) out[k] = v;
    if (out.page) out.page = Number(out.page);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === '' || v === false) next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const activeCount = [...params.keys()].filter((k) => !['page', 'sort', 'q', 'lat', 'lng'].includes(k)).length;

  return { filters, update, reset, activeCount };
}
