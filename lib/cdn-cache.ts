/**
 * Headers for public data that is identical for every viewer. Vercel's CDN keeps
 * one copy for `seconds`, so many open screens cost one function call and one
 * database query per interval instead of one per screen. Browsers still never cache.
 */
export function sharedCacheHeaders(seconds: number) {
  return {
    'Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': `max-age=${seconds}, stale-while-revalidate=${seconds * 5}`,
  };
}
