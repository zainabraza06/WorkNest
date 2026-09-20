import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock, ShieldCheck } from 'lucide-react';

import { bookingsApi } from '@/api/negotiation';
import { Button } from '@/components/ui/Button';
import { InlineAlert } from '@/components/ui/States';
import { formatPKR } from '@/lib/format';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
// Refuse anything but a test key: this project never processes real payments
const stripePromise = publishableKey?.startsWith('pk_test_') && publishableKey !== 'pk_test_xxx' ? loadStripe(publishableKey) : null;

function CheckoutForm({ bookingId, amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });

    if (stripeError) {
      setError(stripeError.message);
      setSubmitting(false);
      return;
    }

    try {
      // Pull the authorised status from Stripe right away (the webhook does the same in the background)
      const booking = await bookingsApi.syncPayment(bookingId);
      queryClient.setQueryData(['booking', bookingId], booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <InlineAlert>{error}</InlineAlert>}
      <PaymentElement options={{ layout: 'tabs' }} />
      <Button type="submit" size="lg" loading={submitting} disabled={!stripe}>
        <Lock className="size-4" aria-hidden /> Pay {formatPKR(amount)} into escrow
      </Button>
    </form>
  );
}

export function EscrowPayment({ booking }) {
  const start = useMutation({ mutationFn: () => bookingsApi.startPayment(booking._id) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-lg bg-ink-50 p-3 text-sm text-primary-900">
        <ShieldCheck className="size-5 shrink-0 text-primary-600" aria-hidden />
        <p>Your payment is held securely and only released to the worker after you confirm the job is complete. Cancel before the job starts for a full refund.</p>
      </div>

      <dl className="divide-y divide-ink-100 text-sm">
        <div className="flex justify-between py-2">
          <dt className="text-ink-600">Agreed price</dt>
          <dd className="font-semibold">{formatPKR(booking.agreedPrice)}</dd>
        </div>
        <div className="flex justify-between py-2">
          <dt className="text-ink-600">Service fee</dt>
          <dd className="text-ink-700">Rs 0 (deducted from worker payout)</dd>
        </div>
        <div className="flex justify-between py-2 text-base">
          <dt className="font-semibold">You pay</dt>
          <dd className="font-display font-bold">{formatPKR(booking.agreedPrice)}</dd>
        </div>
      </dl>

      {!stripePromise ? (
        <InlineAlert tone="warning">
          Payments are not configured. Set <code>VITE_STRIPE_PUBLISHABLE_KEY</code> to a Stripe <strong>test</strong> key (pk_test_…) in <code>frontend/.env</code>.
        </InlineAlert>
      ) : start.data ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: start.data.clientSecret,
            appearance: { theme: 'stripe', variables: { colorPrimary: '#0f766e', borderRadius: '8px', fontFamily: 'Inter, system-ui, sans-serif' } },
          }}
        >
          <CheckoutForm bookingId={booking._id} amount={start.data.amount} />
        </Elements>
      ) : (
        <>
          {start.error && <InlineAlert>{start.error.message}</InlineAlert>}
          <Button size="lg" loading={start.isPending} onClick={() => start.mutate()}>
            <Lock className="size-4" aria-hidden /> Continue to payment
          </Button>
        </>
      )}

      <p className="text-xs text-ink-500">
        Test mode — no real money moves. Use card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any CVC.
      </p>
    </div>
  );
}
