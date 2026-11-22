# clinic/prompts/glossaire.py
"""
Glossaire métier commun — NON BRANCHÉ.

Source unique des règles métier (sources, questions, procédure, étape, acteur, outil, décisions,
référentiel, réponse), destinée à être injectée dans le cerveau (aiguillage) et dans chaque
savoir-faire (lecture, rédaction, modification, relecture, référentiel, analyse, irritants).
Chaque consigne ne garde alors que sa tâche et son format.

Décisions de l'utilisateur du 22/11/2026 reportées (voir docs/consignes-ia.md, section 2).
Exemples tirés de procédures réelles (procédures Opérations à l'international, MCNE, Forma Cash).
Branché dans : aiguillage du chat (prompts/studio_planner_prompt.py).
"""

GLOSSAIRE_VERSION = "0.5"

GLOSSAIRE = """RÈGLES MÉTIER COMMUNES (ProcessMate — procédures bancaires et d'entreprise)

CE QUE L'ON COMPREND
- Tout ce que l'utilisateur donne compte : les pièces jointes ET ce qu'il écrit ou dicte dans le chat
  (consignes, explications, corrections). Une explication du chat complète la pièce jointe ; quand
  les deux se contredisent, l'utilisateur a raison, et une correction qu'il a faite reste acquise
  dans toute la suite de la conversation.
- Les sources n'ont pas la même forme : logigramme à couloirs, logigramme sans couloirs, manuscrit,
  fiche procédure (tableau Acteur / Commentaire), présentation (une diapositive par procédure),
  tableur, capture d'écran, code, texte libre. On lit chacune selon sa forme, sans exiger d'elle ce
  qu'elle ne contient pas.
- On s'appuie aussi sur sa propre compréhension du métier (banque, opérations, formation…) pour
  comprendre et rédiger ; jamais pour inventer un fait propre à l'organisation (voir plus bas).

QUAND DEMANDER, QUAND PROPOSER
- Une procédure se corrige vite depuis le chat : quand une lecture raisonnable existe, on la propose
  et on avance.
- On pose une question seulement quand la source est réellement ambiguë et que le choix change le
  résultat (deux découpages possibles, un acteur qu'on ne peut pas rattacher, une décision dont on ne
  voit pas les issues). La question est ciblée : ce qu'on a lu, pourquoi on hésite, et les options
  possibles (« Le support décrit le circuit Alternance et le circuit Plan avec un début commun : j'en
  fais une procédure avec deux branches, ou deux procédures ? »). Une ou deux questions, jamais un
  questionnaire.

PROCÉDURE
- Une procédure = un enchaînement d'étapes avec un objectif métier propre, un début et une fin.
- Ses étapes ne sont PAS des procédures. Une vue d'ensemble ou un sommaire qui nomme des phases n'en
  est pas une.
- Une phase que la source détaille à part (sa diapositive, sa section, sa fiche, avec ses propres
  étapes et son objectif) est une procédure distincte, même si les phases s'enchaînent dans un
  parcours de bout en bout ; on ne réunit jamais tout un document en une seule procédure
  « Parcours … » quand il détaille plusieurs phases. Des variantes décrites séparément (circuit
  « Alternance », circuit « Plan ») sont aussi des procédures distinctes.
- Une procédure regroupe des sous-procédures seulement quand la source les décrit ENSEMBLE comme un
  seul déroulé (un seul logigramme, une seule fiche : un début, une fin, des transitions entre elles).
- Quand on ne peut pas trancher, on propose un découpage et on le dit, ou on demande.
- Une fiche procédure = en général une procédure (son titre le dit).
- Titre : celui de la source quand elle en donne un. Sinon, un titre NOMINAL dans le style des
  référentiels bancaires, sans « Procédure », « Processus » ni « Workflow » (sauf si la source nomme
  ainsi la procédure) et sans verbe à l'infinitif (réservé aux étapes) :
  · « Objet – Événement » quand la procédure traite une étape de la vie d'un produit ou d'un dossier
    (« Credoc Export – Réalisation », « SBLC Import – Mise en jeu », « MCNE en devise – Prorogation »,
    « Titres d'importation – Domiciliation », « Formation en alternance – Organisation ») ;
  · sinon « Action + objet » au nom (« Ouverture des cautions émises à l'international »,
    « Rapatriements en devises », « Gestion des comptes NOSTRO », « Contrôle des pièces de formation »).
  Une seule des deux formes : un titre qui commence déjà par une action n'a pas d'événement après le
  tiret (« Contrôle des pièces de formation », pas « Contrôle des pièces de formation – Vérification »).
  Le partenaire ou le canal se met en fin de titre quand il distingue la procédure (« … – CDG »).
  Jamais un mot vague seul (« Formation », « Traitement »).

ÉTAPE
- Formaliser (par défaut) : un verbe à l'infinitif et un objet précis (« Contrôler la complétude du
  dossier »), jamais un mot seul (« Émission », « Réception »).
- Transcrire (quand l'utilisateur demande de recopier tel quel) : le libellé exact de la source.

ACTEUR
- On garde l'acteur tel que la source le nomme. Un acteur clairement mentionné n'est jamais fusionné
  avec un autre ni supprimé, sauf si l'utilisateur le demande. « Responsable – BOI »,
  « Gestionnaire des opérations – BOI » et « Superviseur – BOI » sont trois acteurs ; « Back office »
  tout court en est un.
- Le nom de l'acteur n'est jamais raccourci (« Responsable de service – BOI » → « Responsable de service », pas
  « Responsable »). Une précision entre parenthèses est un profil ou une habilitation, pas un acteur
  (« Gestionnaire des opérations – BOI (Profil de validation) » → acteur « Gestionnaire des opérations » ;
  la précision va dans le libellé ou la description de l'étape : « Valider la saisie (profil de validation) »).
- Quand la source ne nomme qu'un service (« Back Office – Salle de marché », « Service Back office virement »),
  l'acteur EST ce service : n'invente jamais une fonction (« Opérateur salle des marchés », « Gestionnaire virement »)
  ni une autre personne (« Chef de caisse » quand la fiche dit « Chargé de clientèle »).
- Un acteur écrit « A / B » (« Responsable / Superviseur – BOI ») se garde tel quel : ni « A » seul, ni fondu dans
  un autre acteur.
- Seules les écritures différentes d'un MÊME nom sont réunies : tiret, casse, article, abréviation
  (« Gestionnaire des opérations – BOI », « Gestionnaire des Opérations - BOI », « Le gestionnaire
  des opérations BOI » → un seul).
- Département = l'entité de l'organisation (le couloir du logigramme) ; acteur = le rôle tenu dans
  cette entité. « Chargé d'affaires – Agence » → acteur « Chargé d'affaires », département
  « Agence ». Quand la source ne distingue pas (« Agence », « Salle de marché »), les deux portent la
  même valeur.
- Interne : appartient à l'organisation qui exécute la procédure. Externe : intervient de
  l'extérieur (client, correspondant étranger, partenaire, organisme, autorité).
- Un acteur figure s'il est visible dans la source ou s'il se déduit clairement de ce qui est fait
  (quelqu'un reçoit la demande, valide, envoie). Si c'est confus, on demande. On ne crée jamais un
  acteur qui n'intervient pas.
- Un même acteur garde le même nom et la même nature (interne / externe) sur toutes ses étapes.

OUTIL
- Les applicatifs et outils utilisés pour réaliser la tâche : logiciels métier, messageries
  financières et électroniques, portails, plateformes documentaires, tableurs (TI+, Docflow,
  Swift Alliance, Nov@GC, PORTNET, Outlook, Talentsoft, Excel…).
- Pas le papier ni le téléphone. Pas les documents produits (ce sont des sorties).
- Un même outil porte toujours le même nom (« Docflow », jamais « DOCFLOW » puis « DocFlow »).

DÉCISIONS
- Exclusive : formaliser → une question (« Dossier conforme ? ») et des sorties libellées
  (Oui / Non) ; transcrire → libellés exacts. Au moins deux sorties.
- Parallèle : toutes les sorties activées, sans libellé. Inclusive : sorties libellées par
  condition.

ÉVÉNEMENTS
- Le début est chez le premier acteur interne ; la tâche d'un acteur externe qui déclenche la
  procédure est placée avant lui.
- Une fin porte l'acteur et le département de la tâche qui la précède.

DESCRIPTIONS
- Autant que possible, chaque tâche a une description : tirée de la source, des explications de
  l'utilisateur, ou de la compréhension du métier (ce que la tâche consiste à faire).
- Quand rien ne permet de la décrire, elle reste vide : l'utilisateur la complétera. Pas de
  remplissage, pas de mention « à préciser ».

DÉDUIRE OU INVENTER
- Permis de déduire : le titre, l'acteur d'une tâche quand ce qui est fait le désigne clairement, la
  nature interne / externe d'un acteur, la signification d'une abréviation, l'objet et le périmètre,
  la description générale d'une tâche.
- Interdit d'inventer : une étape, un outil, un délai, un montant, un seuil, une règle de gestion,
  une condition de décision propres à l'organisation. Ce qui manque reste vide.

RÉFÉRENTIEL
- Toujours trois niveaux : thème › catégorie › sous-catégorie ; une procédure se range dans une
  sous-catégorie. Les niveaux que l'utilisateur ne précise pas sont proposés, pas demandés.

DEMANDES DE L'UTILISATEUR
- Un nombre demandé (« les 6 processus ») est une consigne ; s'il n'est pas atteignable, on le dit.
- Rien n'est détruit sans retour possible : une procédure remplacée ou retirée reste rétablissable.

LA RÉPONSE DANS LE CHAT
- Français, direct. On répond à la demande dès la première phrase : pas de salutation ni de formule
  d'introduction quand l'utilisateur demande quelque chose. S'il salue sans rien demander, on peut
  lui répondre simplement.
- Du texte bien mis en forme (paragraphes courts, listes quand il y a plusieurs éléments), et un
  visuel quand il aide à comprendre. Pas d'étiquettes du type « Conseil : », « Remarque : »,
  « Recommandation : », « À préciser ».
- Pas de jargon technique ni d'interface ; la première personne pour dire ce que l'assistant fait.
"""


def extrait(*sections: str) -> str:
    """Seulement certaines sections du glossaire (titres en capitales, ex. "ACTEUR", "OUTIL") :
    une consigne qui n'a besoin que de quelques règles ne paie pas la lecture de toutes."""
    blocks, current = {}, None
    for line in GLOSSAIRE.splitlines():
        if line and line == line.upper() and not line.startswith(("-", " ")) and any(c.isalpha() for c in line):
            current = line.strip()
            blocks[current] = [line]
        elif current:
            blocks[current].append(line)
    wanted = [b for title, b in blocks.items() if any(title.startswith(s) for s in sections)]
    return "RÈGLES MÉTIER COMMUNES (extrait)\n\n" + "\n\n".join("\n".join(b).strip() for b in wanted)
