// ─── Sous-modèles ─────────────────────────────────────────────────────────────

export interface RevisionHistorique {
  version: string;
  date: string;
  auteur: string;
  description: string;
}

export interface DocumentReference {
  nom: string;
  type: string;
  version: string;
  description: string;
}

export interface SFDMeta {
  nom_projet: string;
  client: string;
  version: string;
  date: string;
  statut: string;
  auteurs: string[];
  historique_revisions: RevisionHistorique[];
}

export interface Contexte {
  presentation_client: string;
  contexte_projet: string;
  objectifs_metier: string[];
}

export interface Perimetre {
  inclus: string[];
  exclus: string[];
  hypotheses: string[];
  contraintes_generales: string[];
}

export interface Acteur {
  id: string;
  nom: string;
  type: string;
  role: string;
  description: string;
}

export interface FluxEtape {
  numero: number;
  description: string;
}

export interface CasUtilisation {
  id: string;
  nom: string;
  acteur_principal: string;
  acteurs_secondaires: string[];
  preconditions: string[];
  flux_nominal: FluxEtape[];
  flux_alternatifs: string[];
  flux_erreur: string[];
  postconditions: string[];
}

export interface Fonction {
  id: string;
  nom: string;
  priorite: string;
  description: string;
  donnees_entree: string[];
  donnees_sortie: string[];
  regles_gestion_ids: string[];
  contraintes: string[];
}

export interface Module {
  id: string;
  nom: string;
  description: string;
  fonctions: Fonction[];
}

export interface RegleGestion {
  id: string;
  description: string;
  type: string;
  fonctions_concernees: string[];
}

export interface SpecificationDonnee {
  entite: string;
  attributs: string[];
  description: string;
  flux_associes: string[];
}

export interface ElementUI {
  nom: string;
  type: string;
  description: string;
  obligatoire: boolean;
}

export interface InterfaceUI {
  id: string;
  nom_ecran: string;
  description: string;
  acteur: string;
  elements: ElementUI[];
}

export interface InterfaceExterne {
  id: string;
  nom: string;
  type: string;
  systeme_tiers: string;
  description: string;
  format_echange: string;
}

export interface Interfaces {
  interfaces_ui: InterfaceUI[];
  interfaces_externes: InterfaceExterne[];
}

export interface ExigencesNF {
  performance: string[];
  securite: string[];
  disponibilite: string[];
  ergonomie: string[];
  maintenabilite: string[];
}

export interface MatriceTracabilite {
  id_besoin_source: string;
  description_besoin: string;
  fonctions_couvrant: string[];
}

// ─── Document SFD principal ───────────────────────────────────────────────────

export interface SFDDocument {
  meta: SFDMeta;
  documents_reference: DocumentReference[];
  contexte: Contexte;
  perimetre: Perimetre;
  acteurs: Acteur[];
  cas_utilisation: CasUtilisation[];
  modules: Module[];
  regles_gestion: RegleGestion[];
  specifications_donnees: SpecificationDonnee[];
  interfaces: Interfaces;
  exigences_non_fonctionnelles: ExigencesNF;
  matrice_tracabilite: MatriceTracabilite[];
  glossaire: Record<string, string>;
}

// ─── Session & Chat ───────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export type SectionStatus = 'draft' | 'validated';

export type SectionKey =
  | 'contexte'
  | 'perimetre'
  | 'acteurs'
  | 'cas_utilisation'
  | 'modules'
  | 'regles_gestion'
  | 'specifications_donnees'
  | 'interfaces'
  | 'exigences_non_fonctionnelles'
  | 'matrice_tracabilite'
  | 'glossaire';

export const SECTIONS: { key: SectionKey; label: string; number: string }[] = [
  { key: 'contexte', label: 'Contexte général', number: '1' },
  { key: 'perimetre', label: 'Périmètre fonctionnel', number: '2' },
  { key: 'acteurs', label: 'Acteurs du système', number: '3' },
  { key: 'cas_utilisation', label: "Cas d'utilisation", number: '4' },
  { key: 'modules', label: 'Modules et fonctions', number: '5' },
  { key: 'regles_gestion', label: 'Règles de gestion', number: '6' },
  { key: 'specifications_donnees', label: 'Spécifications des données', number: '7' },
  { key: 'interfaces', label: 'Interfaces', number: '8' },
  { key: 'exigences_non_fonctionnelles', label: 'Exigences non-fonctionnelles', number: '9' },
  { key: 'matrice_tracabilite', label: 'Matrice de traçabilité', number: '10' },
  { key: 'glossaire', label: 'Glossaire', number: '11' },
];

// ─── Style / Thème ────────────────────────────────────────────────────────────

/** Identifiants des thèmes disponibles — doivent correspondre aux clés backend */
export type StyleName = 'al_maghrib' | 'corporate_blue';

export const DEFAULT_STYLE: StyleName = 'al_maghrib';

// ─── États de la page ─────────────────────────────────────────────────────────

export type PageState =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'chatting'
  | 'exporting'
  | 'error';

// ─── Payload InitForm → page ──────────────────────────────────────────────────

export interface InitPayload {
  sessionId: string;
  projectName: string;
  client: string;
  description: string;
  urls: string[];
  files: File[];
  style: StyleName;   // ← nouveau
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    if ('detail' in error) {
      const d = (error as { detail: unknown }).detail;
      if (typeof d === 'string') return d;
      if (Array.isArray(d)) return d.map((e: { msg?: string }) => e.msg).join(', ');
    }
    if ('message' in error) return String((error as { message: unknown }).message);
  }
  return 'Une erreur inconnue est survenue';
}