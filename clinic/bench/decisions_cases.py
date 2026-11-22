"""
Situations du banc d'essai des décisions (voir bench/decisions.py).

Chaque situation : ce que l'utilisateur a devant lui (sources jointes, procédures déjà produites,
procédure affichée, proposition en attente), ce qu'il écrit, et la décision attendue.

Décisions possibles (vocabulaire du banc, indépendant du code actuel) :
  rediger        écrire une ou plusieurs procédures nouvelles
  proposer       lister les procédures trouvées et laisser choisir
  operation      refaire des procédures de la conversation (découper, déplacer, extraire…)
  fusionner      réunir des procédures en une
  retirer        retirer une procédure de la conversation
  modifier       modifier UNE procédure (étape, acteur, outil…)
  refaire        réécrire la procédure affichée à partir d'une source
  expliquer      expliquer une procédure produite
  repondre       répondre (conversation, question générale)
  repondre_sources  répondre sur le contenu des sources jointes
  transcrire     recopier fidèlement une source
  referentiel    proposer un référentiel
  recherche      chercher une information externe
  demander       poser une question ciblée avant d'agir

`attendu` : liste des décisions acceptables (la première est la meilleure).
Contrôles facultatifs : `nombre` (procédures à rédiger), `remplace` (procédures de la conversation
refaites ou retirées), `cible` (procédure modifiée, numéro 1…n).
`note` : pourquoi on attend cela (règle du glossaire concernée).
"""

# Sources réelles : chemins relatifs au dossier des sources (BENCH_SOURCES, voir decisions.py)
FORMACASH = "processMate/clinic/PROPOSITION_DE_PARCOURS_FORMACASH_v5 (1).pptx"
MCNE = "processMate/MCNE en MAD Mise en place v2 (1) (3).pdf"
CREDOC_MODIF = "Desktop/Procedures processmate/CREDOC EXPORT Modification V2 (1).docx"
CREDOC_REAL = "Desktop/Procedures processmate/CREDOC EXPORT Réalisation v2 (2).docx"
VIREMENTS = "Desktop/Procedures processmate/Virements.docx"
CHEQUES_DEVISES = "Desktop/Procedures processmate/Chèques en devises  (1).pdf"
FORMULES = "Desktop/processmate excel/DEP-MP-1016-23 -- GESTION DES FORMULES (CHEQUIERS,CARNETS LCN,LETTRES CHQ,LETTRES LCN).pdf"
INCIDENTS = "Desktop/processmate excel/DEP-MP-575-19 - Mode de traitement des régularisations des incidents de paiement.pdf"
PLAN_RO = "Desktop/processmate excel/Plan d'attenuation RO Opérations à l'international.xlsx"
PAGE_IMAGE = "processMate/.codex_tmp_docs/1016-p03-rot.png"
# À déposer dans le dossier des sources pour activer les cas correspondants
MANUSCRIT = "bench-sources/manuscrit.jpg"
SANS_COULOIRS = "bench-sources/logigramme_sans_couloirs.png"


def _s(i, label, actor, dept=None, tool="", nxt=None, typ="UserTask", cond=""):
    return {"id": str(i), "étape": label, "typeBpmn": typ, "département": dept or actor, "acteur": actor,
            "typeActeur": "interne", "outil": tool, "condition": cond,
            "outputs": [{"targetId": str(n), "label": ""} for n in (nxt or [])]}


ORGANISER = [
    _s(1, "Recevoir le besoin de formation de l'agence", "Cellule Formation Siège", tool="Talentsoft", nxt=[2], typ="StartEvent"),
    _s(2, "Choisir le circuit", "Cellule Formation Siège", nxt=[3, 6], typ="ExclusiveGateway", cond="Alternance ?"),
    _s(3, "Alternance : vérifier l'éligibilité de l'intérimaire", "Cellule Formation Siège", tool="Talentsoft", nxt=[4]),
    _s(4, "Alternance : déposer la demande de prise en charge OPCO", "Cellule Formation Siège", tool="Portail AKTO", nxt=[5]),
    _s(5, "Alternance : dossier prêt", "Cellule Formation Siège", typ="EndEvent"),
    _s(6, "Plan : valider le budget du plan", "Direction des opérations", tool="Excel", nxt=[7]),
    _s(7, "Plan : inscrire les intérimaires", "Agence d'emploi", tool="ServiceNow", nxt=[8]),
    _s(8, "Plan : dossier prêt", "Cellule Formation Siège", typ="EndEvent"),
]
FORMER = [
    _s(1, "Démarrer la session", "Organisme de formation", nxt=[2], typ="StartEvent"),
    _s(2, "Animer la formation", "Organisme de formation", nxt=[3]),
    _s(3, "Contrôler les émargements", "Cellule Formation Siège", tool="Talentsoft", nxt=[4]),
    _s(4, "Gérer les absences de l'intérimaire", "Agence d'emploi", tool="Winpack", nxt=[5]),
    _s(5, "Session terminée", "Organisme de formation", typ="EndEvent"),
]
VERIFIER = [
    _s(1, "Recevoir les pièces de fin de formation", "Comptabilité formation", tool="GED", nxt=[2], typ="StartEvent"),
    _s(2, "Contrôler la complétude du dossier", "Comptabilité formation", tool="GED", nxt=[3]),
    _s(3, "Viser la facture de l'organisme", "Comptabilité formation", tool="Finergie", nxt=[4]),
    _s(4, "Dossier vérifié", "Comptabilité formation", typ="EndEvent"),
]
CREDOC = [
    _s(1, "Recevoir la demande de modification par SWIFT", "Gestionnaire des opérations", "BOI", "TI+", [2], "StartEvent"),
    _s(2, "Vérifier la demande de modification", "Gestionnaire des opérations", "BOI", "TI+", [3]),
    _s(3, "Demande conforme ?", "Gestionnaire des opérations", "BOI", "", [4, 6], "ExclusiveGateway", "Conforme ?"),
    _s(4, "Saisir la modification", "Gestionnaire des opérations", "BOI", "TI+", [5]),
    _s(5, "Valider la modification", "Responsable", "BOI", "TI+", [7]),
    _s(6, "Rejeter la demande", "Gestionnaire des opérations", "BOI", "Docflow", [7]),
    _s(7, "Notifier le bénéficiaire", "Gestionnaire des opérations", "BOI", "Swift Alliance", [8]),
    _s(8, "Modification traitée", "Gestionnaire des opérations", "BOI", typ="EndEvent"),
]
TROIS = [("Organiser la formation", ORGANISER), ("Former les intérimaires", FORMER), ("Vérifier la fin de formation", VERIFIER)]
UNE = [("Crédit documentaire à l'export – Modification", CREDOC)]

TEXTE_COMPLET = ("Rédige la procédure d'ouverture d'un compte étudiant : le chargé de clientèle en agence reçoit "
                 "l'étudiant et collecte la carte d'identité et le certificat de scolarité, il saisit la demande dans "
                 "Nov@GC ; le back office ouverture de comptes contrôle les pièces ; si elles sont conformes il ouvre "
                 "le compte, sinon il renvoie le dossier à l'agence ; l'agence remet le RIB à l'étudiant.")

CASES = [
    # ── Rédiger depuis des sources ───────────────────────────────────────────────────────────────
    dict(id="src-pptx-tout", cat="sources", files=[FORMACASH], message="Fais les procédures de ce support.",
         attendu=["rediger", "proposer"], note="Une diapositive qui détaille ses étapes = une procédure"),
    dict(id="src-pptx-6", cat="sources", files=[FORMACASH], message="Il y a 6 processus dans ce support, fais-les.",
         attendu=["rediger"], nombre=6, note="Un nombre demandé est une consigne"),
    dict(id="src-fiche", cat="sources", files=[CREDOC_MODIF], message="Formalise cette procédure.",
         attendu=["rediger"], nombre=1, note="Une fiche procédure = une procédure"),
    dict(id="src-deux-fiches", cat="sources", files=[CREDOC_MODIF, CREDOC_REAL], message="Fais les procédures.",
         attendu=["rediger"], nombre=2),
    dict(id="src-pdf-logigramme", cat="sources", files=[MCNE], message="Génère la procédure.",
         attendu=["rediger"], nombre=1),
    dict(id="src-pdf-fiche", cat="sources", files=[CHEQUES_DEVISES], message="Peux-tu formaliser ça ?",
         attendu=["rediger"], nombre=1),
    dict(id="src-pdf-long", cat="sources", files=[FORMULES], message="Fais-moi les procédures de ce mode opératoire.",
         attendu=["rediger", "proposer"]),
    dict(id="src-pdf-incidents", cat="sources", files=[INCIDENTS], message="Formalise.",
         attendu=["rediger", "proposer"]),
    dict(id="src-image-page", cat="sources", files=[PAGE_IMAGE], message="Fais la procédure de cette page.",
         attendu=["rediger", "demander"]),
    dict(id="src-manuscrit", cat="sources", files=[MANUSCRIT], message="Voici mes notes, fais-en une procédure.",
         attendu=["rediger"], nombre=1),
    dict(id="src-sans-couloirs", cat="sources", files=[SANS_COULOIRS], message="Formalise ce logigramme.",
         attendu=["rediger"], nombre=1),
    dict(id="src-salut", cat="sources", files=[CREDOC_MODIF], message="Salut, tu peux me faire la procédure de cette fiche ?",
         attendu=["rediger"], nombre=1, note="Une salutation avec une demande : on fait la demande"),

    # ── Le chat comme source ─────────────────────────────────────────────────────────────────────
    dict(id="chat-correction-avec-fiche", cat="chat-source", files=[CREDOC_MODIF],
         message="Formalise cette fiche. Attention : chez nous la modification est validée par le Superviseur – BOI, pas par le Responsable.",
         attendu=["rediger"], nombre=1, note="Le chat complète et corrige la pièce jointe"),
    dict(id="chat-texte-complet", cat="chat-source", message=TEXTE_COMPLET, attendu=["rediger"], nombre=1),
    dict(id="chat-texte-dicte", cat="chat-source",
         message="alors en fait quand le client vient pour un virement international le guichetier vérifie le solde ensuite "
                 "le back office international saisit dans TI+ et envoie le swift et la conformité contrôle si c'est au-dessus "
                 "du seuil, fais moi la procédure",
         attendu=["rediger"], nombre=1),
    dict(id="chat-explication-puis-fiche", cat="chat-source", files=[VIREMENTS],
         history=[("user", "Je vais te donner la fiche des virements. Chez nous il n'y a qu'un seul circuit, émis et reçus ensemble."),
                  ("assistant", "D'accord, envoyez-moi la fiche.")],
         message="La voici.", attendu=["rediger"], nombre=1, note="L'explication donnée avant compte"),

    # ── Demander plutôt que deviner ──────────────────────────────────────────────────────────────
    dict(id="ask-vide", cat="demander", message="Fais une procédure.", attendu=["demander"],
         note="Rien à formaliser : question ciblée"),
    dict(id="ask-sujet-seul", cat="demander", message="Je veux formaliser la gestion des chéquiers.",
         attendu=["demander", "rediger"], note="Une lecture raisonnable existe (métier connu) : proposer est permis"),
    dict(id="ask-singulier-plusieurs", cat="demander", files=[FORMACASH], message="Fais la procédure.",
         attendu=["proposer", "demander", "rediger"], note="Singulier alors que le support en décrit plusieurs"),
    dict(id="ask-tableur-risques", cat="demander", files=[PLAN_RO], message="Fais la procédure à partir de ce fichier.",
         attendu=["demander", "repondre_sources"], note="Un plan d'atténuation des risques n'est pas une procédure"),

    # ── Questions ────────────────────────────────────────────────────────────────────────────────
    dict(id="q-combien", cat="questions", files=[FORMACASH], message="Combien de procédures décrit ce support ?",
         attendu=["repondre_sources", "proposer"]),
    dict(id="q-qui-valide", cat="questions", files=[CREDOC_MODIF], message="Qui valide la modification dans cette fiche ?",
         attendu=["repondre_sources"]),
    dict(id="q-resume-source", cat="questions", files=[MCNE], message="Résume-moi ce document en trois lignes.",
         attendu=["repondre_sources"]),
    dict(id="q-expliquer", cat="questions", conv=UNE, message="Explique-moi cette procédure.",
         attendu=["expliquer", "repondre"]),
    dict(id="q-pourquoi", cat="questions", conv=UNE, message="Pourquoi il y a une validation par le responsable ?",
         attendu=["expliquer", "repondre"]),
    dict(id="q-general", cat="questions", message="C'est quoi la différence entre une procédure et un processus ?",
         attendu=["repondre"]),
    dict(id="q-reglementation", cat="questions",
         message="Quelle est la réglementation de Bank Al-Maghrib sur les transferts en devises en 2026 ?",
         attendu=["recherche", "repondre"]),
    dict(id="hello", cat="questions", message="Bonjour", attendu=["repondre"]),
    dict(id="merci", cat="questions", conv=UNE, message="Merci, c'est parfait.", attendu=["repondre"]),

    # ── Transcrire ───────────────────────────────────────────────────────────────────────────────
    dict(id="tr-pdf", cat="transcrire", files=[MCNE], message="Recopie ce logigramme tel quel, sans reformuler.",
         attendu=["transcrire"]),
    dict(id="tr-fiche", cat="transcrire", files=[CHEQUES_DEVISES], message="Transcris la fiche à l'identique.",
         attendu=["transcrire"]),
    dict(id="tr-image", cat="transcrire", files=[PAGE_IMAGE], message="Transcris exactement ce qui est écrit.",
         attendu=["transcrire"]),

    # ── Modifier une procédure ───────────────────────────────────────────────────────────────────
    dict(id="mod-acteur", cat="modifier", conv=UNE, message="L'étape 5 est faite par le Superviseur – BOI.",
         attendu=["modifier"]),
    dict(id="mod-ajout", cat="modifier", conv=UNE,
         message="Ajoute un contrôle de la Direction conformité après la saisie quand le montant dépasse le seuil.",
         attendu=["modifier"]),
    dict(id="mod-suppr-etape", cat="modifier", conv=UNE, message="Supprime l'étape de rejet.", attendu=["modifier"]),
    dict(id="mod-outil", cat="modifier", conv=UNE, message="On n'utilise plus Docflow, c'est Outlook maintenant.",
         attendu=["modifier"]),
    dict(id="mod-titre", cat="modifier", conv=UNE, message="Renomme-la « Modification d'un crédit documentaire export ».",
         attendu=["modifier"]),
    dict(id="mod-implicite", cat="modifier", conv=UNE, message="Le responsable ne valide pas, c'est automatique dans TI+.",
         attendu=["modifier"], note="Correction sans verbe d'action"),
    dict(id="mod-fusion-acteurs", cat="modifier", conv=UNE,
         message="Réunis Responsable et Gestionnaire des opérations sous « Back office international ».",
         attendu=["modifier"], note="Fusionner des acteurs : seulement sur demande"),
    dict(id="mod-cible-2", cat="modifier", conv=TROIS, active=1,
         message="Dans Vérifier la fin de formation, ajoute une relance de l'organisme si la facture manque.",
         attendu=["modifier"], cible=3, note="Une autre procédure que celle affichée"),
    dict(id="mod-cible-affichee", cat="modifier", conv=TROIS, active=2, message="Ajoute une étape d'évaluation à chaud à la fin.",
         attendu=["modifier"], cible=2),
    dict(id="mod-nouvelle-version", cat="modifier", conv=UNE, files=[CREDOC_MODIF],
         message="Voici la nouvelle version de la fiche, mets la procédure à jour.",
         attendu=["refaire", "operation"], note="Une nouvelle source pour la procédure affichée"),

    # ── Opérations sur l'ensemble de la conversation ─────────────────────────────────────────────
    dict(id="op-decouper", cat="ensemble", conv=TROIS, message="Alternance et Plan sont deux process à part : coupe Organiser en deux.",
         attendu=["operation"], remplace=[1], nombre=2),
    dict(id="op-deplacer", cat="ensemble", conv=TROIS,
         message="Le contrôle des émargements doit se faire dans Vérifier, pas dans Former : déplace cette étape.",
         attendu=["operation"], remplace=[2, 3]),
    dict(id="op-extraire", cat="ensemble", conv=TROIS, message="Sors la gestion des absences de Former et fais-en une procédure à part.",
         attendu=["operation"], remplace=[2]),
    dict(id="op-fusion", cat="ensemble", conv=TROIS, message="Fusionne Former et Vérifier en une seule procédure.",
         attendu=["fusionner", "operation"], remplace=[2, 3]),
    dict(id="op-retirer", cat="ensemble", conv=TROIS, message="Enlève la procédure Vérifier, on ne la garde pas.",
         attendu=["retirer"], remplace=[3]),
    dict(id="op-nouvelle-texte", cat="ensemble", conv=TROIS,
         message="Ajoute une procédure pour le paiement de l'organisme : la comptabilité reçoit la facture visée, la saisit dans Finergie et lance le virement.",
         attendu=["rediger"], nombre=1, remplace=[], note="Une nouvelle procédure ne refait pas les autres"),
    dict(id="op-decouper-avec-fichier", cat="ensemble", conv=TROIS, files=[FORMACASH],
         message="Organiser devrait être en deux : alternance d'un côté, plan de l'autre.", attendu=["operation"], remplace=[1]),
    dict(id="op-renommer-toutes", cat="ensemble", conv=TROIS, message="Ajoute « FormaCash – » devant le titre de chaque procédure.",
         attendu=["operation", "modifier"]),

    # ── Proposition en attente ───────────────────────────────────────────────────────────────────
    dict(id="prop-deux", cat="proposition", files=[FORMACASH], proposal=6, message="Fais seulement la 2 et la 4.",
         attendu=["rediger"], nombre=2),
    dict(id="prop-toutes", cat="proposition", files=[FORMACASH], proposal=6, message="Toutes.", attendu=["rediger"], nombre=6),
    dict(id="prop-ajout", cat="proposition", files=[FORMACASH], proposal=6,
         message="Il en manque une : l'inscription en formation interne.", attendu=["proposer", "rediger"]),

    # ── Référentiel ──────────────────────────────────────────────────────────────────────────────
    dict(id="ref-sources", cat="referentiel", files=[CREDOC_MODIF, CREDOC_REAL, VIREMENTS],
         message="Propose-moi un référentiel pour ranger ces procédures.", attendu=["referentiel"]),
    dict(id="ref-texte", cat="referentiel", files=[FORMACASH],
         message="Organise-moi tout ça en thèmes, catégories et sous-catégories.", attendu=["referentiel"]),
]
