/** Which of `count` stations is active at a scroll progress from 0 to 1 (equal slices). */
export function stationAt(progress: number, count: number): number {
  if (count <= 0) return 0;
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(count - 1, Math.floor(p * count));
}
