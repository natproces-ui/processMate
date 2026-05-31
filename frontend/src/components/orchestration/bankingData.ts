/**
 * Données de test pour ProcessMate Orchestration
 * Contexte bancaire CIH Bank
 */

export const BANKING_PROCEDURES = [
  {
    id: 'PROC-PF-001',
    nom: 'Préfinancement Exportation',
    ref: 'PF-2024-001',
    version: 3,
    category: 'Financement Court Terme',
    status: 'En cours de validation',
    createdAt: '2024-01-15',
    lastModified: '2024-04-05',
    description: 'Processus de mise en place du préfinancement pour entreprises exportatrices',
    versions: [
      { version: 3, date: '2024-04-05', status: 'En validation', validatedBy: null },
      { version: 2, date: '2024-03-20', status: 'Validée', validatedBy: 'Karim Al-Mansouri' },
      { version: 1, date: '2024-01-15', status: 'Validée', validatedBy: 'Youssef Bennani' },
    ],
  },
  {
    id: 'PROC-CAU-002',
    nom: 'Caution Douanière',
    ref: 'CAU-2024-002',
    version: 2,
    category: 'Garanties',
    status: 'Validée',
    createdAt: '2024-02-10',
    lastModified: '2024-03-25',
    description: 'Mise en place de cautions douanières pour dédouanement marchandises',
    versions: [
      { version: 2, date: '2024-03-25', status: 'Validée', validatedBy: 'Nadia Zaoui' },
      { version: 1, date: '2024-02-10', status: 'Validée', validatedBy: 'Hassan Tabbakh' },
    ],
  },
  {
    id: 'PROC-REF-003',
    nom: 'Refinancement de Crédit',
    ref: 'REF-2024-003',
    version: 2,
    category: 'Financement',
    status: 'En cours de révision',
    createdAt: '2024-03-01',
    lastModified: '2024-04-02',
    description: 'Restructuration et refinancement de crédits existants',
    versions: [
      { version: 2, date: '2024-04-02', status: 'En révision', validatedBy: null },
      { version: 1, date: '2024-03-01', status: 'Rejetée', validatedBy: 'Fatima Alaoui' },
    ],
  },
  {
    id: 'PROC-OC-004',
    nom: 'Opération Office des Changes',
    ref: 'OC-2024-004',
    version: 1,
    category: 'Change & Trésorerie',
    status: 'Brouillon',
    createdAt: '2024-04-01',
    lastModified: '2024-04-06',
    description: 'Gestion des opérations de change via Office des Changes',
    versions: [
      { version: 1, date: '2024-04-01', status: 'Brouillon', validatedBy: null },
    ],
  },
];

export const BANKING_TEAM = [
  {
    id: 'user-001',
    name: 'Karim Al-Mansouri',
    role: 'Chef de Projet Back-Office',
    status: 'active' as const,
    validationsCount: 18,
    avgTime: '2.1h',
    accuracy: 99,
    avatarBg: 'bg-blue-600',
  },
  {
    id: 'user-002',
    name: 'Nadia Zaoui',
    role: 'Formalisatrice Senior',
    status: 'active' as const,
    validationsCount: 24,
    avgTime: '1.5h',
    accuracy: 100,
    avatarBg: 'bg-green-600',
  },
  {
    id: 'user-003',
    name: 'Hassan Tabbakh',
    role: 'Validateur Qualité',
    status: 'absent' as const,
    validationsCount: 12,
    avgTime: '2.8h',
    accuracy: 97,
    avatarBg: 'bg-yellow-600',
  },
  {
    id: 'user-004',
    name: 'Youssef Bennani',
    role: 'Responsable Conformité',
    status: 'active' as const,
    validationsCount: 15,
    avgTime: '3.2h',
    accuracy: 98,
    avatarBg: 'bg-purple-600',
  },
  {
    id: 'user-005',
    name: 'Fatima Alaoui',
    role: 'Coordinatrice Procédures',
    status: 'active' as const,
    validationsCount: 21,
    avgTime: '1.8h',
    accuracy: 96,
    avatarBg: 'bg-red-600',
  },
];

export const BANKING_BOTTLENECKS = [
  {
    id: 'bottleneck-001',
    title: 'Approbation Office des Changes',
    severity: 'high' as const,
    daysSinceBlocked: 3,
    relatedProcedures: ['PROC-OC-004'],
    impact: 'Bloque 2 procédures',
    suggestion: 'Contacter directement Office des Changes pour accélérer approbation',
  },
  {
    id: 'bottleneck-002',
    title: 'Documentation Douanière',
    severity: 'medium' as const,
    daysSinceBlocked: 1,
    relatedProcedures: ['PROC-CAU-002'],
    impact: 'Ralentit validation',
    suggestion: 'Vérifier complétude documentation (Cerfa, factures commerciales)',
  },
  {
    id: 'bottleneck-003',
    title: 'Vérification Conformité Crédit',
    severity: 'medium' as const,
    daysSinceBlocked: 2,
    relatedProcedures: ['PROC-REF-003'],
    impact: 'En attente révision légale',
    suggestion: 'Solliciter révision accélérée du service juridique',
  },
];

export const BANKING_KPI = [
  { label: 'Procédures en cours', value: 4, trend: 5 },
  { label: 'En validation', value: 2, trend: -3 },
  { label: 'En attente retours', value: 2, trend: 1 },
  { label: 'Bloquées', value: 1, trend: 0 },
];

export const BANKING_EVOLUTION = [
  { month: 'Nov', validated: 8, inProgress: 3, pending: 2 },
  { month: 'Déc', validated: 12, inProgress: 4, pending: 1 },
  { month: 'Jan', validated: 10, inProgress: 5, pending: 3 },
  { month: 'Fév', validated: 15, inProgress: 3, pending: 2 },
  { month: 'Mar', validated: 18, inProgress: 4, pending: 1 },
  { month: 'Avr', validated: 12, inProgress: 6, pending: 2 },
];

export const BANKING_WORKFLOW_STAGES = [
  {
    id: 'stage-1',
    title: 'Initiation',
    description: 'Création et documentation initiale',
    duration: '2h',
    status: 'completed' as const,
  },
  {
    id: 'stage-2',
    title: 'Formalisation',
    description: 'Structuration et normalisation du processus',
    duration: '4h',
    status: 'completed' as const,
  },
  {
    id: 'stage-3',
    title: 'Validation Interne',
    description: 'Contrôle qualité et conformité interne',
    duration: '6h',
    status: 'in-progress' as const,
    progress: 65,
  },
  {
    id: 'stage-4',
    title: 'Révision Légale',
    description: 'Vérification conformité réglementaire',
    duration: '8h',
    status: 'blocked' as const,
    blocker: 'En attente retour service juridique',
  },
  {
    id: 'stage-5',
    title: 'Approbation Finale',
    description: 'Signature et mise en publication',
    duration: '2h',
    status: 'pending' as const,
  },
];

export const BANKING_VALIDATION_ISSUES = [
  {
    id: 'issue-001',
    procedureId: 'PROC-REF-003',
    title: 'Calcul taux de refinancement incorrect',
    severity: 'error' as const,
    description: 'Le taux appliqué ne correspond pas aux grilles BCRM',
    suggestedFix: 'Appliquer taux selon grid: 5.2% pour maturité > 3 ans',
    status: 'open' as const,
  },
  {
    id: 'issue-002',
    procedureId: 'PROC-REF-003',
    title: 'Documentation crédit client manquante',
    severity: 'error' as const,
    description: 'Dossier crédit client incomplet (états financiers manquants)',
    suggestedFix: 'Télécharger états financiers 2023-2024 et garanties supplémentaires',
    status: 'open' as const,
  },
  {
    id: 'issue-003',
    procedureId: 'PROC-OC-004',
    title: 'Code ISO devises non standard',
    severity: 'warning' as const,
    description: 'Certains codes devises ne suivent pas standard ISO 4217',
    suggestedFix: 'Utiliser uniquement codes ISO validés (EUR, USD, MAD, etc.)',
    status: 'open' as const,
  },
];

export const BANKING_RACI_PEOPLE = [
  'Karim Al-Mansouri',
  'Nadia Zaoui',
  'Hassan Tabbakh',
  'Youssef Bennani',
  'Fatima Alaoui',
];

export const BANKING_RACI_PROCEDURES = [
  'PROC-PF-001',
  'PROC-CAU-002',
  'PROC-REF-003',
  'PROC-OC-004',
  'PROC-LDD-005',
  'PROC-ISC-006',
  'PROC-GAR-007',
];

export const BANKING_RACI_MATRIX = [
  { procedure: 'PROC-PF-001', 'Karim Al-Mansouri': 'A', 'Nadia Zaoui': 'R', 'Hassan Tabbakh': 'C', 'Youssef Bennani': 'I', 'Fatima Alaoui': 'C' },
  { procedure: 'PROC-CAU-002', 'Karim Al-Mansouri': 'R', 'Nadia Zaoui': 'A', 'Hassan Tabbakh': 'R', 'Youssef Bennani': 'C', 'Fatima Alaoui': 'I' },
  { procedure: 'PROC-REF-003', 'Karim Al-Mansouri': 'A', 'Nadia Zaoui': 'R', 'Hassan Tabbakh': 'I', 'Youssef Bennani': 'R', 'Fatima Alaoui': 'C' },
  { procedure: 'PROC-OC-004', 'Karim Al-Mansouri': 'I', 'Nadia Zaoui': 'R', 'Hassan Tabbakh': 'C', 'Youssef Bennani': 'A', 'Fatima Alaoui': 'R' },
];

export const BANKING_EMAILS = [
  {
    id: 'email-001',
    type: 'sent' as const,
    from: 'Marie Descartes <marie.descartes@cihbank.ma>',
    to: 'Karim Al-Mansouri <k.almansouri@cihbank.ma>',
    date: '2024-04-06 14:30',
    subject: 'Procédure PROC-REF-003 - Demande de révision',
    body: 'Karim,\n\nLa procédure de refinancement est prête pour révision. Veuillez vérifier les calculs de taux et la documentation crédit.\n\nMerci',
    linkedValidation: { id: 'val-003', procedure: 'PROC-REF-003', status: 'En révision' },
  },
  {
    id: 'email-002',
    type: 'received' as const,
    from: 'Youssef Bennani <y.bennani@cihbank.ma>',
    to: 'Marie Descartes <marie.descartes@cihbank.ma>',
    date: '2024-04-06 16:45',
    subject: 'RE: Procédure PROC-REF-003 - Erreurs détectées',
    body: 'Marie,\n\nJ\'ai détecté 2 erreurs:\n1. Taux refinancement incorrect\n2. Documentation crédit incomplète\n\nDetails en pièce jointe.',
    linkedValidation: { id: 'val-003', procedure: 'PROC-REF-003', status: 'Modifications demandées', errors: 2 },
  },
];
