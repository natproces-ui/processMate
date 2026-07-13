'use client';

// components/orchestration/GuidePanel.tsx
// Guide d'utilisation interne de ProcessMate — formaliser (BPMN Studio) + piloter (Orchestration).

import React from 'react';
import {
  FileText, Code2, MessageSquare, Mic, Table2, Waypoints, PencilLine,
  Save, Send, Download, FileOutput, ChevronRight, Info, AlertTriangle,
  CheckCircle2, ClipboardList, Megaphone, Sparkles, LayoutGrid,
} from 'lucide-react';

// ─── Petits composants de mise en page ─────────────────────────

function Section({
  id, kicker, title, dek, children,
}: {
  id: string; kicker: string; title: string; dek?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">{kicker}</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-1.5">{title}</h2>
      {dek && <p className="text-sm text-gray-500 max-w-2xl mb-6">{dek}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-gray-900 mt-8 mb-2">{children}</h3>;
}

function Flow({ steps }: { steps: { icon: React.ElementType; title: string; desc: string }[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2 my-4">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <React.Fragment key={s.title}>
            <div className="w-44 shrink-0 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                <Icon className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900 leading-tight mb-1">{s.title}</p>
              <p className="text-xs text-gray-500 leading-snug">{s.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center justify-center w-6 text-gray-300 shrink-0">
                <ChevronRight className="w-4 h-4" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const CALLOUT_STYLES = {
  note: { wrap: 'bg-blue-50 border-blue-200', label: 'text-blue-700', Icon: Info },
  warn: { wrap: 'bg-amber-50 border-amber-200', label: 'text-amber-700', Icon: AlertTriangle },
  fix: { wrap: 'bg-emerald-50 border-emerald-200', label: 'text-emerald-700', Icon: CheckCircle2 },
} as const;

function Callout({
  tone, label, children,
}: { tone: keyof typeof CALLOUT_STYLES; label: string; children: React.ReactNode }) {
  const s = CALLOUT_STYLES[tone];
  const Icon = s.Icon;
  return (
    <div className={`rounded-xl border px-4 py-3 max-w-2xl ${s.wrap}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mb-1 ${s.label}`}>
        <Icon className="w-3.5 h-3.5" />{label}
      </p>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center font-mono text-[12.5px] font-medium bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 whitespace-nowrap">
      {children}
    </span>
  );
}

const PILL_STYLES: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-500 border-gray-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  waiting_info: 'bg-purple-50 text-purple-700 border-purple-200',
  changes_requested: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  validated: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
  cancelled: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
};

function StatusLegend({ items }: { items: { key: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 my-3">
      {items.map(it => (
        <span
          key={it.key}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${PILL_STYLES[it.key] ?? PILL_STYLES.todo}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function DataTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden my-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left font-semibold text-[11px] uppercase tracking-wide text-gray-400 px-4 py-2 w-56">{head[0]}</th>
            <th className="text-left font-semibold text-[11px] uppercase tracking-wide text-gray-400 px-4 py-2">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={a} className={i < rows.length - 1 ? 'border-b border-gray-100' : ''}>
              <td className="px-4 py-2.5 font-medium text-gray-800 align-top whitespace-nowrap">{a}</td>
              <td className="px-4 py-2.5 text-gray-600 align-top">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cheat({ q, path }: { q: string; path: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-900 mb-2">{q}</p>
      <p className="flex flex-wrap items-center gap-1 font-mono text-[12.5px] text-gray-500">
        {path.map((seg, i) => (
          <React.Fragment key={seg}>
            {i === 0 ? <span className="font-semibold text-gray-800">{seg}</span> : <span>{seg}</span>}
            {i < path.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

// ─── Sommaire ───────────────────────────────────────────────────

const TOC = [
  { id: 'guide-overview', label: "Vue d'ensemble" },
  { id: 'guide-nav', label: 'Se connecter et naviguer' },
  { id: 'guide-formaliser', label: 'Formaliser un processus' },
  { id: 'guide-piloter', label: 'Piloter les processus' },
  { id: 'guide-roles', label: 'Qui peut faire quoi' },
  { id: 'guide-memo', label: 'Aide-mémoire' },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Composant principal ────────────────────────────────────────

export default function GuidePanel() {
  return (
    <div className="h-full flex bg-gray-50">

      {/* Sommaire latéral */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-gray-200 bg-white py-5 overflow-y-auto">
        <p className="px-4 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sommaire</p>
        {TOC.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollToSection(item.id)}
            className="text-left px-4 py-1.5 text-sm text-gray-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
          >
            {item.label}
          </button>
        ))}
      </aside>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-16">

          {/* En-tête */}
          <header>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Guide d&apos;utilisation interne</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Naviguer dans ProcessMate</h1>
            <p className="text-base text-gray-500 max-w-2xl mb-4">
              ProcessMate formalise, gère et pilote vos procédures métier de bout en bout : de la collecte des sources à la publication, en passant par l&apos;analyse et le suivi des tâches.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />Formaliser — module BPMN Studio
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />Piloter — module Orchestration
              </span>
            </div>
          </header>

          {/* Vue d'ensemble */}
          <Section id="guide-overview" kicker="01 — Panorama" title="Deux métiers, un seul atelier"
            dek="ProcessMate répond à deux besoins qui se suivent naturellement : faire émerger un processus à partir de ce qui existe déjà, puis le faire vivre dans le temps.">
            <p className="text-sm text-gray-700 max-w-2xl">
              <strong>Formaliser</strong> prend en entrée à peu près tout ce qui décrit déjà un processus dans l&apos;entreprise — documents (PDF, images, notes), dictée vocale, ou même une application legacy (COBOL, WinDev, ABAP…) — et s&apos;appuie sur l&apos;IA pour en extraire un organigramme de processus (BPMN) éditable, puis au besoin une spécification fonctionnelle détaillée.
              {' '}<strong>Piloter</strong> prend le relais une fois le processus formalisé : c&apos;est là qu&apos;on l&apos;assigne, qu&apos;on suit son avancement, qu&apos;on le fait évoluer.
            </p>
            <p className="text-sm text-gray-700 max-w-2xl">
              Les deux métiers vivent dans le <em>même</em> atelier : seule la barre latérale change de panneau. On ne quitte jamais ProcessMate pour passer de l&apos;un à l&apos;autre.
            </p>

            <div className="rounded-xl border border-gray-200 bg-white p-5 max-w-2xl shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Vocabulaire essentiel</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                <dt className="font-semibold text-gray-900 whitespace-nowrap">Procédure</dt>
                <dd className="text-gray-600">Un processus formalisé et enregistré : diagramme, tableau d&apos;étapes, règles de gestion, métadonnées.</dd>
                <dt className="font-semibold text-gray-900 whitespace-nowrap">Tâche</dt>
                <dd className="text-gray-600">Une action assignée à quelqu&apos;un sur une procédure — relire, valider, corriger, informer.</dd>
                <dt className="font-semibold text-gray-900 whitespace-nowrap">Campagne</dt>
                <dd className="text-gray-600">Un regroupement de procédures dans un même projet, avec son propre cycle de vie.</dd>
                <dt className="font-semibold text-gray-900 whitespace-nowrap">Artefact</dt>
                <dd className="text-gray-600">Le résultat d&apos;une Analyse IA : impacts et modifications proposées sur une procédure existante.</dd>
              </dl>
            </div>

            <Callout tone="note" label="À savoir">
              Transformer du code legacy en organigramme, ou générer une spécification fonctionnelle détaillée à partir d&apos;une procédure, ne sont <strong>pas des outils à part</strong> : ce sont des capacités natives de ProcessMate, respectivement l&apos;entrée « Code legacy » du studio de formalisation et l&apos;écran <Kbd>Spécifications</Kbd> du pilotage.
            </Callout>
          </Section>

          {/* Naviguer */}
          <Section id="guide-nav" kicker="02 — Prise en main" title="Se connecter et naviguer"
            dek="Un point d'entrée unique, une barre latérale qui fait tout le reste.">
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 max-w-2xl">
              <li>Depuis la page d&apos;accueil, cliquez sur <Kbd>Mon espace</Kbd> (déjà connecté) ou <Kbd>Démarrer maintenant</Kbd>. Les deux mènent au même atelier.</li>
              <li>La barre latérale gauche donne accès aux deux métiers de ProcessMate : <strong>Orchestration</strong> (le pilotage, ouvert par défaut) et <strong>BPMN Studio</strong> (la formalisation). Deux raccourcis complémentaires y figurent aussi — ils ouvrent en plein écran des outils autonomes dont les capacités clés sont par ailleurs déjà intégrées dans ProcessMate même (code legacy dans le Studio, spécifications dans l&apos;écran dédié).</li>
              <li>Dans le module Orchestration, la navigation donne accès à : <Kbd>Créer / Modifier</Kbd>, <Kbd>Campagnes</Kbd>, <Kbd>Analyse</Kbd>, <Kbd>Suivi des tâches</Kbd>, <Kbd>Espace de travail personnel</Kbd>, <Kbd>Tableau de bord</Kbd>, <Kbd>Spécifications</Kbd>, et — pour les administrateurs — <Kbd>Réglages</Kbd>.</li>
            </ol>
            <p className="text-sm text-gray-700 max-w-2xl">Retenez simplement : <strong>tout part de là</strong>. Les sections qui suivent décrivent ce que vous trouverez derrière chaque écran.</p>
          </Section>

          {/* Formaliser */}
          <Section id="guide-formaliser" kicker="03 — Module Formaliser (BPMN Studio)" title="Transformer un document en processus"
            dek="Le studio de formalisation prend un ou plusieurs documents en entrée et en fait ressortir un organigramme éditable, prêt à être enregistré comme procédure.">
            <p className="text-sm text-gray-700 max-w-2xl">
              Ce n&apos;est pas qu&apos;un outil de dictée vocale : c&apos;est un véritable atelier de formalisation, qui accepte quatre types de sources en entrée.
            </p>

            <SubHeading>Quatre façons d&apos;alimenter le studio</SubHeading>
            <Flow steps={[
              { icon: FileText, title: 'Documents', desc: 'Dépôt multiple de PDF, images ou notes numérisées.' },
              { icon: Code2, title: 'Code legacy', desc: 'Applications historiques — COBOL, WinDev, ABAP… — retravaillées en organigramme.' },
              { icon: MessageSquare, title: 'Assistant / chat', desc: 'Décrire ou coller ses notes à l’assistant, jusqu’à 3 PDF ou images joints.' },
              { icon: Mic, title: 'Dictée vocale', desc: 'Transcription puis extraction automatique des étapes.' },
            ]} />

            <SubHeading>Du document à l&apos;organigramme</SubHeading>
            <Flow steps={[
              { icon: FileText, title: 'Dépôt', desc: 'Les documents sont analysés, une liste de processus candidats est détectée.' },
              { icon: ClipboardList, title: 'Sélection', desc: 'Vous cochez les processus détectés à générer réellement.' },
              { icon: Sparkles, title: 'Génération', desc: 'L’IA produit un tableau d’étapes structuré et enrichi.' },
              { icon: Waypoints, title: 'Organigramme', desc: 'Le tableau est converti automatiquement en diagramme BPMN.' },
            ]} />
            <p className="text-xs text-gray-500 max-w-2xl">
              Précision utile : l&apos;IA ne dessine pas le diagramme directement — elle structure d&apos;abord les étapes en tableau, converti ensuite en BPMN de façon systématique. Le tableau et le diagramme restent donc toujours synchronisés.
            </p>

            <SubHeading>Éditer, discuter, corriger</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">Une fois l&apos;organigramme généré, quatre outils permettent de l&apos;affiner :</p>
            <ul className="space-y-2 text-sm text-gray-700 max-w-2xl">
              <li className="flex gap-2"><Table2 className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>Le tableau</strong> — chaque étape (type BPMN, département, acteur, condition, sorties, outil) est modifiable et réordonnable par glisser-déposer.</span></li>
              <li className="flex gap-2"><Waypoints className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>Le diagramme</strong> — l&apos;organigramme est éditable à même le canevas graphique, avec une palette de composants BPMN.</span></li>
              <li className="flex gap-2"><MessageSquare className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>L&apos;assistant ProcessMate</strong> — pour générer, régénérer entièrement, ou corriger ponctuellement en langage naturel.</span></li>
              <li className="flex gap-2"><PencilLine className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>La révision</strong> — une instruction unique en langage libre (« Ajoute une étape de validation entre 3 et 4 »), avec historique annulable.</span></li>
            </ul>

            <Callout tone="warn" label="Ne pas confondre">
              Cette « Révision » du studio n&apos;est <strong>pas</strong> la « Révision IA » de l&apos;Espace de travail (section Piloter). Même nom, mécanisme différent : ici une instruction ponctuelle sur le diagramme en cours d&apos;édition ; là-bas un audit complet et scoré d&apos;une procédure déjà enregistrée.
            </Callout>

            <SubHeading>Enregistrer, soumettre, exporter</SubHeading>
            <ul className="space-y-2 text-sm text-gray-700 max-w-2xl">
              <li className="flex gap-2"><Save className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><Kbd>Enregistrer</Kbd> — sauvegarde la procédure. Pour une nouvelle procédure, une fenêtre demande nom, catégorie et taxonomie avant l&apos;ajout à la bibliothèque.</span></li>
              <li className="flex gap-2"><Send className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><Kbd>Soumettre</Kbd> — envoie la procédure pour vérification : un sélecteur de destinataire s&apos;ouvre et crée automatiquement une tâche de relecture, notifiée par e-mail.</span></li>
              <li className="flex gap-2"><Download className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><Kbd>Télécharger</Kbd> — exporte le diagramme brut au format .bpmn.</span></li>
              <li className="flex gap-2"><FileOutput className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><Kbd>Générer la procédure Word</Kbd> — produit le document final destiné à être partagé ou archivé.</span></li>
            </ul>

            <Callout tone="fix" label="Précision">
              Le document final généré est un fichier <strong>Word (.docx)</strong>, pas un PDF. Les PDF n&apos;interviennent qu&apos;en <em>entrée</em> : documents sources à formaliser, ou pages annotées à réintégrer via les corrections (voir Espace de travail).
            </Callout>
          </Section>

          {/* Piloter */}
          <Section id="guide-piloter" kicker="04 — Module Piloter (Orchestration)" title="Piloter et gérer les processus"
            dek="Une fois formalisée, une procédure devient vivante : on l'assigne, on la suit, on la fait évoluer.">

            <SubHeading>Les procédures</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">Chaque procédure s&apos;édite dans cinq sections indépendantes, chacune avec son propre bouton « Éditer » :</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 max-w-2xl">
              <li><strong>Caractéristiques</strong> — objet, périmètre, informations générales.</li>
              <li><strong>Qualité</strong> — règles de gestion.</li>
              <li><strong>Diagramme</strong> — le BPMN, avec le même éditeur que dans Formaliser, et l&apos;export Word.</li>
              <li><strong>Descriptions</strong> — le descriptif détaillé de chaque étape.</li>
              <li><strong>Outils</strong> — l&apos;application ou l&apos;outil associé à chaque étape.</li>
            </ul>
            <p className="text-sm text-gray-700 max-w-2xl">Un chat IA est intégré à l&apos;éditeur de procédure : les mêmes corrections que dans Formaliser peuvent s&apos;y faire à la conversation.</p>

            <SubHeading>Les tâches</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">Une tâche assigne une action précise sur une procédure, avec un type, un statut et un rôle RACI :</p>
            <DataTable
              head={['Type de tâche', 'À quoi ça correspond']}
              rows={[
                ['Formalisation', 'Faire émerger ou compléter une procédure.'],
                ['Relecture', 'Vérifier une procédure soumise (créée automatiquement par « Soumettre »).'],
                ['Validation', 'Valider formellement une procédure.'],
                ['Consultation', 'Donner un avis sans responsabilité de validation.'],
                ['Information', 'Tenir une personne informée, sans action attendue.'],
                ['Correction', 'Appliquer une modification identifiée (souvent issue d’une Analyse IA).'],
              ]}
            />
            <p className="text-sm text-gray-700 max-w-2xl">Les statuts possibles, du début à la fin de vie d&apos;une tâche :</p>
            <StatusLegend items={[
              { key: 'todo', label: 'À faire' },
              { key: 'in_progress', label: 'En cours' },
              { key: 'submitted', label: 'Soumise' },
              { key: 'waiting_info', label: "En attente d'info" },
              { key: 'changes_requested', label: 'Modifications demandées' },
              { key: 'blocked', label: 'Bloquée' },
              { key: 'completed', label: 'Terminée' },
              { key: 'validated', label: 'Validée' },
              { key: 'cancelled', label: 'Annulée' },
            ]} />
            <p className="text-sm text-gray-700 max-w-2xl">
              Une tâche naît de plusieurs façons : en soumettant une procédure depuis Formaliser, manuellement depuis l&apos;éditeur de procédure, à partir d&apos;un point relevé par une Révision IA, ou à partir d&apos;une modification proposée par une Analyse IA.
            </p>
            <p className="text-sm text-gray-700 max-w-2xl">
              L&apos;écran <Kbd>Suivi des tâches</Kbd> centralise tout : un tableau filtrable, des compteurs (ouvertes, en retard, soumises, bloquées, modifications demandées, validées) et une liste « Attention » qui remonte ce qui mérite un coup d&apos;œil. Ouvrir une tâche affiche son détail complet — commentaires, historique, actions de changement de statut — et, si elle vient d&apos;une Analyse IA, un bouton pour appliquer directement la modification à la procédure.
            </p>

            <SubHeading>L&apos;espace de travail</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">
              C&apos;est le poste de pilotage personnel : une arborescence de « Mes procédures » regroupées par campagne active, un panneau central selon le contexte (backlog, détail d&apos;une tâche, campagne ou éditeur de procédure), et un tiroir latéral droit qui s&apos;ouvre depuis une tâche pour deux outils IA :
            </p>
            <ul className="space-y-2 text-sm text-gray-700 max-w-2xl">
              <li className="flex gap-2"><Sparkles className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>Révision IA</strong> — un audit complet de la procédure, des points scorés à marquer « Noté » ou « Ignoré », ou à transformer en tâche.</span></li>
              <li className="flex gap-2"><FileText className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" /><span><strong>Corrections PDF</strong> — déposez un PDF annoté (surlignages, remarques manuscrites) : l&apos;IA en extrait les remarques, à marquer « Traité » ou « Ignoré » une par une.</span></li>
            </ul>

            <SubHeading>Les campagnes</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">
              Une campagne regroupe plusieurs procédures dans un même projet. Son cycle de vie se pilote avec <Kbd>Lancer</Kbd>, <Kbd>Pause</Kbd>, <Kbd>Reprendre</Kbd>, <Kbd>Bloquer</Kbd>, <Kbd>Clôturer</Kbd> et <Kbd>Synchroniser</Kbd>. Les procédures s&apos;y ajoutent via un sélecteur de taxonomie hiérarchique.
            </p>

            <SubHeading>Les spécifications</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">
              L&apos;écran <Kbd>Spécifications</Kbd> génère un document de spécification fonctionnelle détaillée à partir d&apos;un périmètre de procédures déjà formalisées — un thème, une catégorie, une sous-catégorie ou une sélection précise. On peut préciser des instructions libres, joindre des sources complémentaires (PDF, image, Excel) ou des URLs, puis laisser l&apos;IA rédiger le document ; il reste ensuite modifiable en conversation avant export.
            </p>

            <SubHeading>L&apos;Analyse IA</SubHeading>
            <p className="text-sm text-gray-700 max-w-2xl">
              À ne pas confondre avec Formaliser : ici on ne crée pas une procédure, on <strong>vérifie une procédure existante</strong> face à un nouveau document — une circulaire, une réglementation, un rapport d&apos;audit.
            </p>
            <Flow steps={[
              { icon: LayoutGrid, title: 'Session', desc: 'Attacher des procédures, déposer les documents sources et une instruction.' },
              { icon: Sparkles, title: 'Analyse', desc: 'L’IA identifie l’intention (conformité, impact réglementaire, risque, etc.).' },
              { icon: ClipboardList, title: 'Artefact', desc: 'Impacts et modifications proposées, classés par section de la procédure.' },
              { icon: CheckCircle2, title: 'Décision', desc: 'Conserver ou rejeter, puis créer des tâches ou appliquer directement.' },
            ]} />
            <p className="text-sm text-gray-700 max-w-2xl">
              Le résultat se consulte en quatre onglets — <strong>Impacts identifiés</strong>, <strong>Modifications proposées</strong>, <strong>Journal</strong>, <strong>Questions</strong> — et se referme par <Kbd>Créer les tâches</Kbd> (assigner) ou <Kbd>Appliquer les modifications</Kbd> (intégrer immédiatement).
            </p>
          </Section>

          {/* Rôles */}
          <Section id="guide-roles" kicker="05 — Accès" title="Qui peut faire quoi"
            dek="Tout le monde voit les mêmes écrans ; les différences se jouent à l'intérieur des panneaux.">
            <DataTable
              head={['Rôle', 'Ce qu’il change concrètement']}
              rows={[
                ['Administrateur', 'Seul rôle à voir l’écran Réglages ; accès le plus large partout ailleurs.'],
                ['Propriétaire de processus', 'Mêmes droits qu’un administrateur sur l’ajout de procédures et le cycle de vie des campagnes.'],
                ['Validateur', 'Droits élargis sur les transitions de tâches de validation.'],
                ['Contributeur', 'Peut formaliser, éditer et soumettre, sans droits d’administration.'],
                ['Observateur', 'Consultation des procédures et tâches.'],
              ]}
            />
            <Callout tone="note" label="Nuance">
              L&apos;Espace de travail personnel affiche par défaut uniquement vos propres tâches, sauf pour les administrateurs qui y voient l&apos;ensemble — cette bascule ne s&apos;applique qu&apos;aux administrateurs, contrairement aux autres écrans où les propriétaires de processus bénéficient d&apos;un accès équivalent.
            </Callout>
          </Section>

          {/* Aide-mémoire */}
          <Section id="guide-memo" kicker="06 — Référence rapide" title="Aide-mémoire"
            dek="Le chemin le plus court pour les besoins les plus courants.">
            <div className="grid sm:grid-cols-2 gap-3">
              <Cheat q="Formaliser un nouveau processus" path={['BPMN Studio', 'déposer / dicter', 'générer', 'enregistrer', 'soumettre']} />
              <Cheat q="Vérifier si une procédure reste conforme" path={['Analyse', 'Analyse IA', 'joindre procédure + document', 'décider']} />
              <Cheat q="Voir mes tâches du jour" path={['Espace de travail', 'Backlog / Mes tâches']} />
              <Cheat q="Exporter le document final" path={['Onglet Diagramme', 'Générer la procédure Word']} />
              <Cheat q="Corriger un PDF annoté à la main" path={['Espace de travail', 'tâche', 'Corrections PDF']} />
              <Cheat q="Auditer une procédure en un clic" path={['Espace de travail', 'tâche', 'Révision IA']} />
              <Cheat q="Faire évoluer un vieux programme legacy" path={['BPMN Studio', 'Code legacy', 'déposer le fichier', 'générer']} />
              <Cheat q="Générer une spécification fonctionnelle" path={['Spécifications', 'choisir un périmètre', 'générer le document']} />
              <Cheat q="Grouper des procédures dans un projet" path={['Campagnes', 'créer', 'ajouter des procédures']} />
            </div>
          </Section>

          <footer className="pt-4 border-t border-gray-200 text-xs text-gray-400 flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5" />
            Guide interne ProcessMate — reflète l&apos;usage réel de l&apos;application.
          </footer>
        </div>
      </div>
    </div>
  );
}
