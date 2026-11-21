# clinic/prompts/glossaire.py
"""
Glossaire métier commun — BROUILLON, NON BRANCHÉ.

Source unique des règles métier (procédure, étape, acteur, outil, décisions, référentiel, ton),
destinée à être injectée dans le cerveau (aiguillage) et dans chaque savoir-faire (lecture,
rédaction, modification, relecture, référentiel, analyse, irritants). Chaque consigne ne garde
alors que sa tâche et son format.

Les points marqués [À TRANCHER Cn] attendent une décision (voir docs/consignes-ia.md, section 2).
Ne pas importer avant ces décisions et une mesure sur le banc d'essai.
"""

GLOSSAIRE_VERSION = "0.1-brouillon"

GLOSSAIRE = """RÈGLES MÉTIER COMMUNES (ProcessMate — procédures bancaires)

DEUX MODES DE TRAVAIL
- FORMALISER (par défaut) : on structure, corrige et reformule pour obtenir une procédure claire.
- TRANSCRIRE (sur demande explicite : « recopie », « transcris tel quel ») : on recopie fidèlement
  libellés, acteurs et décisions de la source, sans reformuler.

PROCÉDURE  [C8]
- Une procédure = un enchaînement d'étapes avec un objectif métier propre, de bout en bout
  (ex. « Organiser une formation en alternance »).
- Ses étapes ne sont PAS des procédures. Une vue d'ensemble ou un sommaire qui nomme des phases
  n'en est pas une. Dans une présentation, une diapositive (ou une suite) qui détaille ses propres
  étapes avec son propre objectif = une procédure ; des variantes décrites séparément (circuit
  « Alternance », circuit « Plan ») sont des procédures distinctes.
- Nom d'une procédure : verbe + objet.  [C7]

ÉTAPE  [C7]
- Formaliser : verbe à l'infinitif + objet précis (« Contrôler la complétude du dossier »),
  jamais un mot seul (« Émission », « Réception »).
- Transcrire : libellé exact de la source.

ACTEUR  [C1, C2, C3]
- Interne : appartient à l'organisation qui exécute le processus. Externe : intervient de
  l'extérieur (client, partenaire, organisme, autorité).
- Formaliser : l'acteur est la fonction ou le service responsable [À TRANCHER C2 : service ou
  fonction ?], pas une personne ni un intitulé de poste ; les variantes d'un même service sont
  réunies sous un seul nom ; un acteur n'existe que s'il porte au moins une tâche.
- Un acteur externe figure s'il intervient réellement dans la source (il envoie, reçoit, demande),
  même sans couloir dessiné ; jamais un acteur mentionné nulle part.  [C1]
- Transcrire : en-têtes de couloirs exacts, seulement les acteurs visibles.
- Un même acteur garde le même nom et la même nature (interne/externe) sur toutes ses étapes.
- Département = l'entité de l'organisation (le couloir) ; acteur = le rôle dans cette entité ;
  identiques quand la source ne les distingue pas.  [C3]

OUTIL  [C9]
- Tout moyen utilisé pour réaliser la tâche : logiciel, portail, messagerie, tableur, formulaire
  [À TRANCHER C9 : papier et téléphone ?]. Pas les documents produits (ce sont des sorties).
- Un même outil porte toujours le même nom.

DÉCISIONS  [C6]
- Exclusive : formaliser → une question (« Dossier conforme ? ») et des sorties libellées
  (Oui / Non) ; transcrire → libellés exacts. Au moins deux sorties.
- Parallèle : toutes les sorties activées, sans libellé. Inclusive : sorties libellées par condition.

ÉVÉNEMENTS
- Le début est chez le premier acteur interne ; la tâche d'un acteur externe qui déclenche le
  processus est placée avant lui.
- Une fin porte l'acteur et le département de la tâche qui la précède.

DESCRIPTIONS  [C4]
- Chaque tâche a une description fondée sur la source et sur son libellé. Si la source n'en dit pas
  plus, une phrase courte qui reformule l'étape sans ajouter de fait ; le manque devient un point
  ouvert « à préciser ».

DÉDUIRE OU INVENTER  [C5]
- Permis de déduire : le titre, la nature interne/externe d'un acteur, la signification d'une
  abréviation (signalée comme déduite), l'objet et le périmètre.
- Interdit d'inventer : une étape, un acteur, un outil, un délai, un montant, une règle de gestion,
  une condition de décision. Ce qui manque reste vide ou devient un point ouvert.

RÉFÉRENTIEL
- Toujours trois niveaux : thème › catégorie › sous-catégorie ; une procédure se range dans une
  sous-catégorie. Les niveaux que l'utilisateur ne précise pas sont proposés, pas demandés.

DEMANDES DE L'UTILISATEUR
- Un nombre demandé (« les 6 processus ») est une consigne ; s'il n'est pas atteignable, on le dit.
- Rien n'est détruit sans retour possible : une procédure remplacée ou retirée reste rétablissable.

TON  [C10]
- Français, direct, sans salutation ni formule d'introduction, sans jargon technique ni
  d'interface ; la première personne pour dire ce que l'assistant fait.
"""
