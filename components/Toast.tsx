import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle, Download, Clock } from 'lucide-react';

export interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'update';
  title: string;
  message: string;
  duration?: number; // 0 = persistent
  onClose: (id: string) => void;
  actions?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }[];
}

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
  actions
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 300);
  };

  const themes = {
    success: {
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
      accent: 'bg-emerald-500'
    },
    error: {
      bg: 'bg-red-500/10 border-red-500/30',
      icon: <XCircle className="w-5 h-5 text-red-400" />,
      accent: 'bg-red-500'
    },
    warning: {
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      accent: 'bg-amber-500'
    },
    info: {
      bg: 'bg-blue-500/10 border-blue-500/30',
      icon: <Info className="w-5 h-5 text-blue-400" />,
      accent: 'bg-blue-500'
    },
    update: {
      bg: 'bg-purple-500/10 border-purple-500/30',
      icon: <Download className="w-5 h-5 text-purple-400" />,
      accent: 'bg-purple-500'
    }
  };

  const theme = themes[type];

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${theme.bg} backdrop-blur-sm shadow-xl transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      {/* Accent line */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.accent}`} />

      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {theme.icon}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white">{title}</h4>
            <p className="text-xs text-gray-400 mt-1">{message}</p>

            {actions && actions.length > 0 && (
              <div className="flex gap-2 mt-3">
                {actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      action.onClick();
                      handleClose();
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                      action.variant === 'primary'
                        ? 'bg-gk-purple hover:bg-gk-purple/80 text-white'
                        : 'bg-white/10 hover:bg-white/20 text-gray-300'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Toast Container for managing multiple toasts
export interface ToastItem extends Omit<ToastProps, 'onClose'> {}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={onRemove} />
        </div>
      ))}
    </div>
  );
};

export default Toast;
