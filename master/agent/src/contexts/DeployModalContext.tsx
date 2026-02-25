'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import DeployModal from '@/components/widget/DeployModal';

interface DeployModalContextType {
  openModal: () => void;
  closeModal: () => void;
  isOpen: boolean;
  setOnFormSubmit: (callback: (() => void) | null) => void;
}

const DeployModalContext = createContext<DeployModalContextType | undefined>(undefined);

export function DeployModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [onFormSubmitCallback, setOnFormSubmitCallback] = useState<(() => void) | null>(null);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  const setOnFormSubmit = useCallback((callback: (() => void) | null) => {
    setOnFormSubmitCallback(() => callback);
  }, []);

  const handleFormSubmit = useCallback(() => {
    if (onFormSubmitCallback) {
      onFormSubmitCallback();
    }
  }, [onFormSubmitCallback]);

  return (
    <DeployModalContext.Provider value={{ openModal, closeModal, isOpen, setOnFormSubmit }}>
      {children}
      <DeployModal isOpen={isOpen} onClose={closeModal} onFormSubmit={handleFormSubmit} />
    </DeployModalContext.Provider>
  );
}

export function useDeployModal() {
  const context = useContext(DeployModalContext);
  if (context === undefined) {
    throw new Error('useDeployModal must be used within a DeployModalProvider');
  }
  return context;
}
