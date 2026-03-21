/** Color tier for ping badges (matches game + lobby). */
export function onlinePingAccent(ms: number): 'good' | 'ok' | 'high' {
  return ms < 90 ? 'good' : ms < 180 ? 'ok' : 'high';
}
