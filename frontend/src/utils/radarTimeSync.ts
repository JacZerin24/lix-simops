/** Preserve actual observation time when changing radar products or tilts.
 *
 * Different Level II moments can have legitimately different frame counts.
 * Prefer the newest actual scan no later than the reference time; if none
 * exists, choose the earliest available scan rather than fabricate a frame.
 */
export function frameIndexAtOrBefore(
  frames: ReadonlyArray<{ timestamp: string }>,
  referenceTime: string,
): number {
  if (!frames.length) return 0;
  const wanted = Date.parse(referenceTime);
  if (!Number.isFinite(wanted)) return frames.length - 1;

  let low = 0;
  let high = frames.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = Date.parse(frames[mid].timestamp);
    if (value <= wanted) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // A first scan after reference time is historical but is not time-matched.
  return best === -1 ? 0 : best;
}
