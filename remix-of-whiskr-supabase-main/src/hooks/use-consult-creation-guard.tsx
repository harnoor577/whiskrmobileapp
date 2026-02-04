import { useState } from 'react';
import { useConsultUsage } from './use-consult-usage';

export function useConsultCreationGuard() {
  const { hasReachedCap, consultsUsed, consultsCap, isUnlimited, currentTier } = useConsultUsage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  const canCreateConsult = isUnlimited || !hasReachedCap;
  
  const attemptConsultCreation = (onProceed: () => void) => {
    if (canCreateConsult) {
      onProceed();
    } else {
      setShowUpgradeModal(true);
    }
  };
  
  return {
    canCreateConsult,
    hasReachedCap,
    consultsUsed,
    consultsCap,
    currentTier,
    showUpgradeModal,
    setShowUpgradeModal,
    attemptConsultCreation,
  };
}
