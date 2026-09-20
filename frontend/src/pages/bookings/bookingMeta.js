export const BOOKING_STATUS_META = {
  pending_payment: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'solid' },
  in_progress: { label: 'In progress', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  disputed: { label: 'Disputed', tone: 'danger' },
};

export const PAYMENT_STATUS_META = {
  requires_payment: { label: 'Not paid yet', tone: 'warning' },
  held: { label: 'Held in escrow', tone: 'solid' },
  released: { label: 'Released to worker', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  failed: { label: 'Payment failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const BOOKING_STEPS = [
  { status: 'pending_payment', label: 'Payment' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
];
