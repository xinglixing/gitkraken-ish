import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  type?: 'success' | 'error' | 'info' | 'warning';
  onConfirm?: () => void;
  confirmText?: string;
  size?: 'sm' | 'md' | 'lg';
  showCloseButton?: boolean;
  highZIndex?: boolean;
  hideDefaultButton?: boolean; // Hide the default OK/Confirm button when using custom buttons
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  onClose,
  title,
  type = 'info',
  children,
  size = 'md',
  showCloseButton = true,
  onConfirm,
  confirmText = 'OK',
  highZIndex = false,
  hideDefaultButton = false
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus dialog on open
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      const timer = setTimeout(() => dialogRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = 'unset'; };
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 150);
  };

  const handleConfirm = () => {
    onConfirm?.();
    handleClose();
  };

  if (!isOpen) return null;

  // Theme configuration
  const themes = {
    error: {
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-400',
      iconRing: 'ring-red-500/20',
      buttonBg: 'bg-red-500 hover:bg-red-600',
      accentLine: 'bg-gradient-to-r from-red-500 to-red-600',
      Icon: XCircle
    },
    warning: {
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      iconRing: 'ring-amber-500/20',
      buttonBg: 'bg-amber-500 hover:bg-amber-600',
      accentLine: 'bg-gradient-to-r from-amber-500 to-orange-500',
      Icon: AlertTriangle
    },
    info: {
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      iconRing: 'ring-blue-500/20',
      buttonBg: 'bg-blue-500 hover:bg-blue-600',
      accentLine: 'bg-gradient-to-r from-blue-500 to-cyan-500',
      Icon: Info
    },
    success: {
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      iconRing: 'ring-emerald-500/20',
      buttonBg: 'bg-emerald-500 hover:bg-emerald-600',
      accentLine: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      Icon: CheckCircle
    }
  };

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg'
  };

  const theme = themes[type];
  const IconComponent = theme.Icon;

  return (
    <div className={`fixed inset-0 ${highZIndex ? 'z-[100]' : 'z-[80]'} flex items-center justify-center p-4`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'alert-title' : undefined}
        className={`relative w-full ${sizeClasses[size]} transform transition-all duration-200 outline-none ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        {/* Card */}
        <div className="bg-[#1e2028] rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-white/[0.06]">
          {/* Accent line */}
          <div className={`h-1 ${theme.accentLine}`} />

          {/* Content */}
          <div className="p-6">
            {/* Header with icon */}
            <div className="flex items-start gap-4">
              {/* Icon container */}
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${theme.iconBg} ring-1 ${theme.iconRing} flex items-center justify-center`}>
                <IconComponent className={`w-6 h-6 ${theme.iconColor}`} />
              </div>

              {/* Title and content */}
              <div className="flex-1 min-w-0 pt-1">
                {title && (
                  <h3
                    id="alert-title"
                    className="text-lg font-semibold text-white leading-tight mb-2"
                  >
                    {title}
                  </h3>
                )}
                <div className="text-sm text-gray-400 leading-relaxed">
                  {children}
                </div>
              </div>

              {/* Close button */}
              {showCloseButton && (
                <button
                  onClick={handleClose}
                  className="flex-shrink-0 p-1.5 -mr-1.5 -mt-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Actions - only show if not hidden */}
          {!hideDefaultButton && (
            <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex items-center justify-end">
              <button
                onClick={handleConfirm}
                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all shadow-lg shadow-black/20 ${theme.buttonBg}`}
              >
                {confirmText}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertDialog;
