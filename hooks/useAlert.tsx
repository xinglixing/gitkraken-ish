import React, { createContext, useContext, useState, useCallback } from 'react';
import AlertDialog from '../components/AlertDialog';

type AlertType = 'success' | 'error' | 'info' | 'warning';

interface AlertState {
  isOpen: boolean;
  title: string;
  message: string;
  type: AlertType;
  details?: string;
}

interface AlertContextValue {
  showAlert: (title: string, message: string, type: AlertType, details?: string) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alert, setAlert] = useState<AlertState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showAlert = useCallback((title: string, message: string, type: AlertType, details?: string) => {
    setAlert({ isOpen: true, title, message, type, details });
  }, []);

  const handleClose = useCallback(() => {
    setAlert(prev => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertDialog
        isOpen={alert.isOpen}
        onClose={handleClose}
        title={alert.title}
        type={alert.type}
        highZIndex
      >
        <div>
          <p className="text-gray-300">{alert.message}</p>
          {alert.details && (
            <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap">{alert.details}</p>
          )}
        </div>
      </AlertDialog>
    </AlertContext.Provider>
  );
};

export const useAlert = (): AlertContextValue => {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return ctx;
};
