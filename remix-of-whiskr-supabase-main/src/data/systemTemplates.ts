export interface TemplateSection {
  id: string;
  label: string;
  description: string;
}

export interface SystemTemplate {
  id: string;
  name: string;
  type: 'soap' | 'wellness' | 'procedure';
  description: string;
  sections: TemplateSection[];
}

export const systemTemplates: SystemTemplate[] = [
  {
    id: 'soap-standard',
    name: 'SOAP Notes',
    type: 'soap',
    description: 'Standard SOAP format for clinical documentation',
    sections: [
      { id: 'subjective', label: 'Subjective', description: 'Patient history, presenting complaint, and owner observations' },
      { id: 'objective', label: 'Objective', description: 'Physical examination findings, vitals, and diagnostic results' },
      { id: 'assessment', label: 'Assessment', description: 'Diagnosis, differential diagnoses, and clinical reasoning' },
      { id: 'plan', label: 'Plan', description: 'Treatment plan, medications, follow-up recommendations' },
    ],
  },
{
    id: 'wellness-standard',
    name: 'Wellness Report',
    type: 'wellness',
    description: 'Comprehensive wellness exam documentation',
    sections: [
      { id: 'patientInformation', label: 'Patient Information', description: 'Patient name, species, breed, age, weight, owner' },
      { id: 'vitalsWeightManagement', label: 'Vitals & Weight Management', description: 'Weight, Temp, HR, RR, BCS, hydration status' },
      { id: 'physicalExamination', label: 'Physical Examination', description: 'Comprehensive head-to-tail examination by body system' },
      { id: 'assessment', label: 'Assessment', description: 'Overall clinical assessment and summary of findings' },
      { id: 'vaccinesAdministered', label: 'Vaccines Administered', description: 'Vaccine details with route, site, and manufacturer' },
      { id: 'preventiveCareStatus', label: 'Preventive Care Status', description: 'Heartworm, flea/tick prevention status and recommendations' },
      { id: 'dietNutrition', label: 'Diet & Nutrition', description: 'Current diet, feeding recommendations, dietary concerns' },
      { id: 'ownerDiscussion', label: 'Owner Discussion', description: 'Topics discussed with owner, concerns addressed' },
      { id: 'recommendations', label: 'Recommendations', description: 'Next steps, follow-up recommendations' },
      { id: 'clientEducation', label: 'Client Education', description: 'Educational points covered with the client' },
    ],
  },
  {
    id: 'procedure-standard',
    name: 'Procedure Notes',
    type: 'procedure',
    description: 'Surgical and procedural documentation',
    sections: [
      { id: 'procedureSummary', label: 'Procedure Summary', description: 'Name, date, patient info, indication' },
      { id: 'preProcedureAssessment', label: 'Pre-Procedure Assessment', description: 'Pre-anesthetic exam, lab work, ASA status' },
      { id: 'anestheticProtocol', label: 'Anesthetic Protocol', description: 'Premedication, induction, maintenance, monitoring' },
      { id: 'procedureDetails', label: 'Procedure Details', description: 'Step-by-step procedure, findings, complications' },
      { id: 'medicationsAdministered', label: 'Medications Administered', description: 'All medications with doses, routes, times' },
      { id: 'postProcedureStatus', label: 'Post-Procedure Status', description: 'Recovery status, vital signs, complications' },
      { id: 'followUpInstructions', label: 'Follow-Up Instructions', description: 'Post-op care, activity restrictions, medications' },
      { id: 'clientCommunication', label: 'Client Communication', description: 'Summary for owner, prognosis, when to call' },
      { id: 'emailToClient', label: 'Email to Client', description: 'Professional email summarizing procedure and aftercare' },
    ],
  },
];
