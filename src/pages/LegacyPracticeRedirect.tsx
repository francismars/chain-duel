import { Navigate, useLocation } from 'react-router-dom';

/** Preserves query string when redirecting legacy /local URLs to /practice. */
export function LegacyPracticeRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/practice${search}`} replace />;
}
