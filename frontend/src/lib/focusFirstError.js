/**
 * Move the viewport and keyboard focus to the first thing that is wrong after a failed submit.
 *
 * Long forms put the submit button well below the fields, so an error rendered next to a field
 * above the fold is invisible: the person presses the button, the page does not move, and the
 * button reads as broken. Validation that the user cannot see has not reported anything.
 *
 * Targets, in DOM order:
 *   [role="alert"]           the summary alert and every field-level error message
 *   [aria-invalid="true"]    the offending control itself
 */
export function focusFirstError(root) {
  if (!root) return;

  const target = root.querySelector('[role="alert"], [aria-invalid="true"]');
  if (!target) return;

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Focus the control, not the message, so the next keystroke fixes the problem. An error <p>
  // sits after its input, so look backwards through the wrapper as well as inside it.
  const selector = 'input, select, textarea';
  const control = target.matches(selector)
    ? target
    : (target.closest('[class]')?.querySelector(selector) ?? root.querySelector(`${selector}[aria-invalid="true"]`));

  // preventScroll: the smooth scroll above owns the movement; focus() would jump past it
  control?.focus({ preventScroll: true });
}

/**
 * Run it after React has painted the errors — calling it in the submit handler would inspect
 * the DOM as it was before the state update.
 */
export const focusFirstErrorSoon = (root) => requestAnimationFrame(() => focusFirstError(root));
