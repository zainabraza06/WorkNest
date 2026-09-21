import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { usersApi } from '@/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { StarDisplay } from '@/components/ui/StarRating';
import { timeAgo } from '@/lib/format';

const PAGE_SIZE = 10;

function Review({ review }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar src={review.from?.avatar?.url} name={review.from?.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{review.from?.name}</p>
          <p className="text-xs text-ink-500">
            {timeAgo(review.createdAt)}
            {review.job?.title && <> · {review.job.title}</>}
          </p>
        </div>
        <StarDisplay rating={review.rating} />
      </div>
      {review.text && <p className="mt-2 text-sm text-ink-700">{review.text}</p>}
    </li>
  );
}

/**
 * The profile endpoint embeds the five most recent reviews, which is all most visitors read.
 * Asking for the rest pages through /users/:id/reviews rather than inflating every profile
 * response with a review history nobody opened.
 */
export function ReviewList({ userId, total = 0, initial = [] }) {
  const [page, setPage] = useState(null); // null = showing the embedded preview

  const query = useQuery({
    queryKey: ['reviews', userId, page],
    queryFn: () => usersApi.reviews(userId, { page, limit: PAGE_SIZE }),
    enabled: page !== null,
    placeholderData: keepPreviousData,
  });

  if (!total && !initial.length) {
    return <p className="text-sm text-ink-600">No reviews yet — reviews appear here after completed jobs.</p>;
  }

  const paged = page !== null;
  const items = paged ? query.data?.items : initial;

  if (paged && query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      <ul className={`divide-y divide-ink-100 ${query.isPlaceholderData ? 'opacity-50' : ''}`}>
        {items?.map((r) => (
          <Review key={r._id} review={r} />
        ))}
      </ul>

      {!paged && total > initial.length && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <Button variant="outline" size="sm" onClick={() => setPage(1)}>
            Show all {total} reviews
          </Button>
        </div>
      )}

      {paged && query.data?.totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onChange={setPage} />
        </div>
      )}
    </>
  );
}
