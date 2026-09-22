export const ROLES = Object.freeze({ WORKER: 'worker', CLIENT: 'client', ADMIN: 'admin' });

export const CATEGORIES = Object.freeze([
  'plumbing',
  'electrical',
  'carpentry',
  'painting',
  'masonry',
  'cleaning',
  'house_help',
  'cooking',
  'babysitting',
  'elderly_care',
  'gardening',
  'driving',
  'ac_repair',
  'appliance_repair',
  'welding',
  'moving_labor',
  'security_guard',
  'other',
]);

export const DURATION_TYPES = Object.freeze(['one_day', 'weekly', 'monthly']);

export const URGENCY = Object.freeze(['flexible', 'normal', 'urgent']);

export const CITIES = Object.freeze([
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Hyderabad',
  'Sialkot',
  'Gujranwala',
  'Other',
]);

// posted → negotiating → confirmed → in_progress → completed → reviewed
export const JOB_STATUS = Object.freeze({
  POSTED: 'posted',
  NEGOTIATING: 'negotiating',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REVIEWED: 'reviewed',
  CANCELLED: 'cancelled',
});

export const OFFER_STATUS = Object.freeze({
  PENDING: 'pending', // waiting for the other party to respond to the latest round
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  CLOSED: 'closed', // another worker was hired for this job
});

export const BOOKING_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
});

export const PAYMENT_STATUS = Object.freeze({
  REQUIRES_PAYMENT: 'requires_payment',
  HELD: 'held', // funds authorised and held in escrow
  RELEASED: 'released', // captured and paid out to worker
  REFUNDED: 'refunded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const ID_VERIFICATION_STATUS = Object.freeze(['none', 'pending', 'verified', 'rejected']);

export const PLATFORM_FEE_RATE = 0.05;

export const WITHDRAWAL_STATUS = Object.freeze({
  REQUESTED: 'requested', // waiting for the platform to send the money
  PAID: 'paid',
  REJECTED: 'rejected',
});

export const PAYOUT_METHODS = Object.freeze(['bank', 'easypaisa', 'jazzcash']);

/** Not worth a bank transfer below this, and it keeps the admin queue meaningful. */
export const MIN_WITHDRAWAL_PKR = 500;
