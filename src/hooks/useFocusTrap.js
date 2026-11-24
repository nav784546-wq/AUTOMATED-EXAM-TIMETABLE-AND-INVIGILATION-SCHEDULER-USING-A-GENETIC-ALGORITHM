import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps keyboard focus inside an active modal/drawer, closes on Escape,
 * prevents background scrolling, and restores focus on close.
 */
export function useFocusTrap({ isOpen, onClose, initialFocusRef = null, lockScroll = true }) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = lockScroll ? document.body.style.overflow : '';
    if (lockScroll) {
      document.body.style.overflow = 'hidden';
    }

    const focusTimer = requestAnimationFrame(() => {
      if (initialFocusRef?.current && typeof initialFocusRef.current.focus === 'function') {
        initialFocusRef.current.focus();
        return;
      }
      const container = containerRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        container.focus();
      }
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (typeof onClose === 'function') {
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (lockScroll) {
        document.body.style.overflow = prevOverflow;
      }
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, initialFocusRef, lockScroll]);

  return containerRef;
}
