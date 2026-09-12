import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/feedback/toastStore';
import { formatPKR } from '@/lib/format';
import { useSocketEvent } from './socket';

const BOOKING_TOASTS = {
  confirmed: 'Payment is held in escrow — the booking is confirmed.',
  in_progress: 'The worker has started the job.',
  completed: 'Job completed and payment released.',
  cancelled: 'A booking was cancelled.',
  disputed: 'A dispute was opened on a booking.',
};

/** Turns server push events into cache invalidations + notifications. Rendered once inside the app layout. */
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const invalidate = (...keys) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

  useSocketEvent('offer:new', (offer) => {
    invalidate(['offers'], ['jobs']);
    toast({
      title: 'New offer received',
      description: `${offer.worker?.name ?? 'A worker'} offered ${formatPKR(offer.rounds?.at(-1)?.amount)} for “${offer.job?.title ?? 'your job'}”`,
      to: `/negotiations/${offer._id}`,
    });
  });

  useSocketEvent('offer:updated', (offer) => {
    invalidate(['offers'], ['offer', offer._id], ['jobs']);
    if (!pathname.includes(offer._id) && offer.status === 'accepted') {
      toast({ title: 'Offer accepted', description: offer.job?.title, tone: 'success', to: `/negotiations/${offer._id}` });
    }
  });

  useSocketEvent('thread:activity', ({ offerId, message }) => {
    invalidate(['offers']);
    if (!pathname.includes(offerId)) toast({ title: 'New message', description: message.text, to: `/negotiations/${offerId}` });
  });

  useSocketEvent('booking:updated', (booking) => {
    invalidate(['bookings'], ['booking', booking._id], ['jobs']);
    const msg = BOOKING_TOASTS[booking.status];
    if (msg && !pathname.includes(booking._id)) toast({ title: 'Booking update', description: msg, to: `/bookings/${booking._id}` });
  });

  useSocketEvent('review:new', (review) => {
    invalidate(['worker'], ['reviews']);
    toast({ title: 'You received a review', description: `${review.rating}★ from ${review.from?.name ?? 'a user'}`, tone: 'success' });
  });

  return null;
}
