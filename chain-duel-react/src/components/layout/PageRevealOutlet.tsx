import { Outlet, useLocation } from 'react-router-dom';
import '@/styles/page-reveal.css';

const GAMEPLAY_PATHS = new Set(['/game', '/network/game']);

export function PageRevealOutlet() {
  const { pathname } = useLocation();
  const gameplay = GAMEPLAY_PATHS.has(pathname);

  return (
    <div
      key={pathname}
      className={
        gameplay
          ? 'page-reveal-scope page-reveal-scope--gameplay'
          : 'page-reveal-scope'
      }
    >
      <Outlet />
    </div>
  );
}
