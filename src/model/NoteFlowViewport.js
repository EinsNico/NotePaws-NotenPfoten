// Keep the page still while allowing the score and result panels to scroll.
// The event guard also covers WebViews that rubber-band despite CSS containment.
export function lockNoteFlowViewport(root) {
  const doc = root && root.ownerDocument;
  const view = doc && doc.defaultView;
  if (!view || !doc.body || !doc.documentElement) return () => {};

  const styles = [];
  [doc.documentElement, doc.body].forEach(element => {
    ["overflow", "overscroll-behavior"].forEach(property => {
      styles.push({ element, property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property) });
      element.style.setProperty(property,
        property === "overflow" ? "hidden" : "none");
    });
  });

  function canScroll(target, deltaX, deltaY) {
    const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
    const delta = vertical ? deltaY : deltaX;
    if (!delta) return true;
    let element = target && (target.nodeType === 1 ? target : target.parentElement);
    while (element && root.contains(element)) {
      const style = view.getComputedStyle(element);
      const overflow = vertical ? style.overflowY : style.overflowX;
      const extent = vertical ? element.scrollHeight - element.clientHeight
        : element.scrollWidth - element.clientWidth;
      if (/^(auto|scroll|overlay)$/.test(overflow) && extent > 1) {
        const position = vertical ? element.scrollTop : element.scrollLeft;
        return delta < 0 ? position > 0 : position < extent - 1;
      }
      if (element === root) break;
      element = element.parentElement;
    }
    return false;
  }
  function guard(event, deltaX, deltaY) {
    if (event.cancelable && !canScroll(event.target, deltaX, deltaY)) {
      event.preventDefault();
    }
  }
  function wheel(event) {
    // Preserve browser zoom, including trackpad pinch gestures.
    if (event.ctrlKey || event.metaKey) return;
    guard(event, event.deltaX, event.deltaY);
  }
  let touch = null;
  function touchStart(event) {
    touch = event.touches.length === 1 ? {
      x: event.touches[0].clientX, y: event.touches[0].clientY
    } : null;
  }
  function touchMove(event) {
    if (!touch || event.touches.length !== 1) { touch = null; return; }
    const next = event.touches[0];
    guard(event, touch.x - next.clientX, touch.y - next.clientY);
    touch = { x: next.clientX, y: next.clientY };
  }
  function touchEnd() { touch = null; }
  root.addEventListener("wheel", wheel, { passive: false });
  root.addEventListener("touchstart", touchStart, { passive: true });
  root.addEventListener("touchmove", touchMove, { passive: false });
  root.addEventListener("touchend", touchEnd, { passive: true });
  root.addEventListener("touchcancel", touchEnd, { passive: true });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    root.removeEventListener("wheel", wheel);
    root.removeEventListener("touchstart", touchStart);
    root.removeEventListener("touchmove", touchMove);
    root.removeEventListener("touchend", touchEnd);
    root.removeEventListener("touchcancel", touchEnd);
    styles.forEach(({ element, property, value, priority }) => {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    });
  };
}
