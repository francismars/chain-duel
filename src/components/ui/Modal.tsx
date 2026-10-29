import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './Modal.css';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** id of the element that names the dialog, or use `label`. */
  labelledBy?: string;
  label?: string;
  /** Extra class on the dialog box (page-specific look). */
  className?: string;
  /** Extra class on the backdrop. */
  backdropClassName?: string;
  /** Tapping outside the box closes it. */
  closeOnBackdrop?: boolean;
  /** Show the × in the top-right corner. */
  showClose?: boolean;
}

/**
 * One dialog shell: backdrop tap, Escape and a × all close it. Centered box on
 * desktop, full-screen sheet on phones.
 */
export function Modal({
  onClose,
  children,
  labelledBy,
  label,
  className,
  backdropClassName,
  closeOnBackdrop = true,
  showClose = true,
}: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={['modal-backdrop', backdropClassName]
        .filter(Boolean)
        .join(' ')}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={['modal', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        onClick={(event) => event.stopPropagation()}
      >
        {showClose ? (
          <Button
            variant="icon"
            className="modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </Button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body
  );
}
