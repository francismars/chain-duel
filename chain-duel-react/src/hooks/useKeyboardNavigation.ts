import { useEffect, useState, useCallback } from 'react';

export type MenuItem = {
  id: string;
  action: () => void;
};

export interface UseKeyboardNavigationOptions {
  items: MenuItem[];
  initialIndex?: number;
  onNavigate?: (index: number) => void;
}

/**
 * Hook for keyboard navigation (arrow keys, Enter/Space)
 * Matches legacy behavior exactly
 */
export function useKeyboardNavigation({
  items,
  initialIndex = 0,
  onNavigate,
}: UseKeyboardNavigationOptions) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const navigate = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right' | 'select') => {
      let newIndex = selectedIndex;

      switch (direction) {
        case 'up':
          newIndex = Math.max(0, selectedIndex - 1);
          break;
        case 'down':
          newIndex = Math.min(items.length - 1, selectedIndex + 1);
          break;
        case 'left':
          // Handle horizontal navigation for double-button items
          // This is handled by the component itself
          break;
        case 'right':
          // Handle horizontal navigation for double-button items
          // This is handled by the component itself
          break;
        case 'select':
          items[selectedIndex]?.action();
          return;
      }

      if (newIndex !== selectedIndex) {
        setSelectedIndex(newIndex);
        onNavigate?.(newIndex);
      }
    },
    [selectedIndex, items, onNavigate]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          navigate('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          navigate('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          navigate('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          navigate('right');
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          navigate('select');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return {
    selectedIndex,
    setSelectedIndex,
    navigate,
  };
}
