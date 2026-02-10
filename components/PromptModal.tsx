import React, { useState, useEffect, useRef } from 'react';

export interface PromptModalProps {
  isOpen: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
  onClose?: () => void; // Alias for onCancel
}

const PromptModal: React.FC<PromptModalProps> = ({ isOpen, title, defaultValue = '', placeholder, onConfirm, onCancel, onClose }) => {
  const handleCancel = onCancel || onClose || (() => {});
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Small delay to ensure modal is rendered before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select(); // Also select text for easy replacement
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-gk-panel border border-gk-header p-6 rounded-lg shadow-2xl w-96 animate-scale-in">
        <h3 className="text-lg font-bold text-gray-200 mb-4">{title}</h3>
        <input 
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(value);
            if (e.key === 'Escape') handleCancel();
          }}
          placeholder={placeholder}
          className="w-full bg-gk-bg border border-white/10 rounded px-3 py-2 text-white mb-6 focus:border-gk-blue outline-none placeholder-gray-600"
        />
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded text-gray-400 hover:text-white text-sm hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(value)} 
            className="px-4 py-2 bg-gk-blue text-white rounded font-bold text-sm shadow-lg hover:brightness-110 transition-all"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptModal;