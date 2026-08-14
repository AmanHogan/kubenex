import { useEffect, useRef, useState } from "react";

/**
 * Turns a raw `isLoading` flag into a "should I actually show a skeleton
 * right now" flag, to avoid two different flashes:
 *  - A fast load (under `delay` ms) never shows a skeleton at all — for a
 *    near-instant response, a skeleton would just flash in and out, which
 *    reads as more broken than showing nothing for a beat.
 *  - Once a skeleton *does* show, it stays for at least `minDuration` ms
 *    even if the data arrives right after — so the skeleton itself doesn't
 *    flash for 10ms before the real content swaps in.
 * @param isLoading The real loading state (e.g. `data === null`).
 * @param delay How long a load has to take before a skeleton appears at all. Default 150ms.
 * @param minDuration Once shown, the minimum time a skeleton stays visible. Default 300ms.
 * @returns Whether to render the skeleton right now.
 */
export function useDelayedLoading(isLoading: boolean, delay = 150, minDuration = 300): boolean {
  const [show, setShow] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (isLoading) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, delay);
    } else if (shownAtRef.current !== null) {
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, minDuration - elapsed);
      hideTimer = setTimeout(() => {
        shownAtRef.current = null;
        setShow(false);
      }, remaining);
    } else {
      setShow(false);
    }

    return (): void => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [isLoading, delay, minDuration]);

  return show;
}
