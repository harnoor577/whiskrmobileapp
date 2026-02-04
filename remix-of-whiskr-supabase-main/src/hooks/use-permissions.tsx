import { useAuth } from '@/lib/auth';

/**
 * Hook to check user permissions based on account and clinic roles
 */
export function usePermissions() {
  const { userRole, clinicRole, canEdit } = useAuth();

  const isReceptionist = clinicRole === 'receptionist';
  const isVetTech = clinicRole === 'vet_tech';
  const isVet = clinicRole === 'vet';
  const isDVM = clinicRole === 'vet' || userRole === 'admin' || userRole === 'super_admin';

  return {
    // Account-level permissions
    canAccessBilling: userRole === 'admin' || userRole === 'super_admin',
    canAccessAdminPanel: userRole === 'admin' || userRole === 'super_admin',
    canAccessMasterAdmin: userRole === 'super_admin',
    
    // Clinic-level permissions
    canEditClinicalData: canEdit, // vet or vet_tech
    canCreatePatient: canEdit || isReceptionist,
    canEditPatient: canEdit || isReceptionist,
    canDeletePatient: canEdit,
    canManageTemplates: canEdit,
    
    // Visit recording - Receptionist, Tech, and DVM can record visits
    canRecordVisit: isReceptionist || isVetTech || isDVM,
    
    // Consult operations - DVM ONLY
    canCreateConsult: isDVM,
    canEditConsult: isDVM,
    canDeleteConsult: isDVM,
    canFinalizeConsult: isDVM,
    canUnfinalizeConsult: isDVM, // Only admins, dvms, and vets
    canExportConsult: isDVM,
    canUploadToConsult: isDVM,
    canUseChatInConsult: isDVM,
    canViewConsult: true,
    
    // Vet tech specific restrictions
    canEditPhysicalExam: !isVetTech,
    canEditAssessment: !isVetTech,
    canEditTreatmentPlan: !isVetTech,
    canOnlyEditVitals: isVetTech,
    
    // Role flags
    isDVM: isDVM,
    isReceptionist: isReceptionist,
    isVet: isVet,
    isVetTech: isVetTech,
    
    // Role info
    accountRole: userRole,
    clinicRole: clinicRole,
  };
}