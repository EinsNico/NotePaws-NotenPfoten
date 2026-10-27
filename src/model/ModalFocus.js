const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Lock sibling branches, never an ancestor of the dialog. This also covers
// app-wide notices outside the page component and restores their prior state.
export function createModalFocusGuard(dialog, overlay, doc, returnFocus) {
  const background = [];
  const opener = returnFocus || doc.activeElement;
  const previousOverflow = doc.body.style.overflow;
  let active = true;
  let redirecting = false;
  const moveFocus = element => {
    if (!element || typeof element.focus !== 'function') return;
    try { element.focus({ preventScroll: true }); } catch (ignored) { element.focus(); }
  };
  // Move the invoking focus before hiding its branch from accessibility APIs.
  moveFocus(dialog);
  let branch = overlay;
  while (branch && branch.parentElement) {
    const parent = branch.parentElement;
    Array.from(parent.children).forEach(element => {
      if (element === branch || ['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) return;
      background.push({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') });
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
    if (parent === doc.body) break;
    branch = parent;
  }
  doc.body.style.overflow = 'hidden';

  const focusable = () => Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(element => (
    element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]')
      && element.getClientRects().length > 0
  ));
  const focusInside = () => moveFocus(dialog);
  const handleKeydown = event => {
    if (event.key !== 'Tab' || !active) return;
    const elements = focusable();
    const first = elements[0] || dialog;
    const last = elements[elements.length - 1] || dialog;
    const current = doc.activeElement;
    if (!dialog.contains(current) || current === dialog || !elements.length
      || (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(event.shiftKey ? last : first);
    }
  };
  const handleFocus = event => {
    if (!active || redirecting || dialog.contains(event.target)) return;
    redirecting = true;
    focusInside();
    redirecting = false;
  };
  doc.addEventListener('keydown', handleKeydown, true);
  doc.addEventListener('focusin', handleFocus, true);
  focusInside();
  return {
    release() {
      if (!active) return;
      active = false;
      doc.removeEventListener('keydown', handleKeydown, true);
      doc.removeEventListener('focusin', handleFocus, true);
      background.forEach(entry => {
        if (entry.inert === null) entry.element.removeAttribute('inert');
        else entry.element.setAttribute('inert', entry.inert);
        if (entry.hidden === null) entry.element.removeAttribute('aria-hidden');
        else entry.element.setAttribute('aria-hidden', entry.hidden);
      });
      doc.body.style.overflow = previousOverflow;
      if (opener && doc.body.contains(opener) && !opener.disabled
        && !opener.closest('[inert], [hidden]')) moveFocus(opener);
    }
  };
}
