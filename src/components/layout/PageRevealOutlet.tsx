import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import '@/styles/page-reveal.css';

export function PageRevealOutlet() {
  const { pathname } = useLocation();
  const gameplay = pathname === '/game';

  useEffect(() => {
    document.body.classList.toggle('game-page', gameplay);
    return () => {
      document.body.classList.remove('game-page');
    };
  }, [gameplay]);

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
