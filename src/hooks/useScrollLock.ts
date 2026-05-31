import { useEffect } from 'react';

// N-06: shared scroll lock with reference counter.
// Only restores scroll when ALL consumers have unlocked (counter reaches 0).
// Prevents the "last unmount wins" race when multiple modals are open.

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function acquireScrollLock() {
  if (lockCount === 0) {
    // Compensate for scrollbar width to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount++;
}

function releaseScrollLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/**
 * Locks body scroll while the component is mounted (when `active` is true).
 * Safe to use in multiple simultaneous modals — uses a reference counter.
 *
 * @param active - pass `true` to lock, `false` to skip (default: true)
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    acquireScrollLock();
    return () => { releaseScrollLock(); };
  }, [active]);
}
