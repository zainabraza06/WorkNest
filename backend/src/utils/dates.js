/** End date for a booking: start + N days / weeks / months. */
export function computeEndDate(startDate, durationType, count = 1) {
  const end = new Date(startDate);
  switch (durationType) {
    case 'weekly':
      end.setDate(end.getDate() + 7 * count);
      break;
    case 'monthly':
      end.setMonth(end.getMonth() + count);
      break;
    default:
      end.setDate(end.getDate() + count);
  }
  return end;
}
