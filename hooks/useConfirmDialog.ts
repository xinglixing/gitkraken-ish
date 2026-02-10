import { useState, useCallback, useRef } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  details?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  icon?: React.ReactNode;
}

export interface ConfirmDialogState extends ConfirmOptions {
  isOpen: boolean;
}

export interface UseConfirmDialogReturn {
  dialogState: ConfirmDialogState;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

/**
 * Promise-based confirmation dialog hook.
 *
 * Usage:
 *   const { dialogState, confirm, handleConfirm, handleCancel } = useConfirmDialog();
 *
 *   // In handler:
 *   const ok = await confirm({ title: 'Delete?', message: 'Are you sure?' });
 *   if (!ok) return;
 *
 *   // In JSX:
 *   <ConfirmDialog {...dialogState} onConfirm={handleConfirm} onClose={handleCancel} />
 */
export function useConfirmDialog(): UseConfirmDialogReturn {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialogState({
        isOpen: true,
        ...options,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return { dialogState, confirm, handleConfirm, handleCancel };
}
