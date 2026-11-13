/**
 * The console built as a self-contained demo (F3.12): `NEXT_PUBLIC_DEMO=1` at build time. It reads
 * recorded runs from `/demo` instead of asking an orchestrator, so it needs no backend and no keys.
 */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';
