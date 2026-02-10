import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle, Info, CheckCircle, HelpCircle } from 'lucide-react';

// Module-level counter to track how many modals are open.
// Only reset body overflow when the last modal closes.
let openModalCount = 0;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  type?: 'default' | 'danger' | 'warning' | 'success' | 'info';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  footer?: React.ReactNode;
  highZIndex?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  type = 'default',
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
  highZIndex = false
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;

    // Focus the modal container
    const focusTimer = setTimeout(() => modalRef.current?.focus(), 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Focus trap: cycle Tab within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on close
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open (ref-counted for stacked modals)
  useEffect(() => {
    if (isOpen) {
      openModalCount++;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (isOpen) {
        openModalCount--;
        if (openModalCount <= 0) {
          openModalCount = 0;
          document.body.style.overflow = 'unset';
        }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Size classes
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  // Type styles
  const typeStyles = {
    default: {
      border: 'border-gk-header',
      headerBg: 'bg-gk-bg'
    },
    danger: {
      border: 'border-gk-red/50',
      headerBg: 'bg-gk-bg'
    },
    warning: {
      border: 'border-gk-yellow/50',
      headerBg: 'bg-gk-bg'
    },
    success: {
      border: 'border-gk-accent/50',
      headerBg: 'bg-gk-bg'
    },
    info: {
      border: 'border-gk-blue/50',
      headerBg: 'bg-gk-bg'
    }
  };

  const styles = typeStyles[type];
  const iconMap = {
    danger: <AlertTriangle className="w-5 h-5 text-gk-red" />,
    warning: <AlertTriangle className="w-5 h-5 text-gk-yellow" />,
    success: <CheckCircle className="w-5 h-5 text-gk-accent" />,
    info: <Info className="w-5 h-5 text-gk-blue" />,
    default: null
  };

  return (
    <div className={`fixed inset-0 ${highZIndex ? 'z-[70]' : 'z-50'} flex items-center justify-center p-4`}>
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={`relative bg-gk-panel border rounded-lg shadow-2xl animate-scale-in ${sizeClasses[size]} ${styles.border} max-h-[90vh] flex flex-col outline-none`}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className={`flex items-center justify-between px-6 py-4 border-b ${styles.headerBg}`}>
            <div className="flex items-center space-x-3">
              {iconMap[type]}
              {title && (
                <h2 className="text-lg font-semibold text-gray-100">
                  {title}
                </h2>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gk-header flex items-center justify-end space-x-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
