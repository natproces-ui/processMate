"""
Prompt pour la détection automatique des interfaçages applicatifs
depuis un workflow Table1Row[]
VERSION 2 : Déduplication par application cible
"""

import json


def get_interface_detection_prompt(workflow: list) -> str:
    """
    Génère le prompt pour détecter les interfaçages dans un workflow complet.
    UNE interface = UN système applicatif, même s'il apparaît sur plusieurs tâches.
    """

    workflow_json = json.dumps(workflow, ensure_ascii=False, indent=2)

    analysable = [
        row for row in workflow
        if row.get("typeBpmn") in ("Task", "ExclusiveGateway")
    ]
    analysable_ids = [r.get("id") for r in analysable]

    return f"""Tu es un expert en architecture des systèmes d'information bancaires et en analyse de processus métier.

🎯 OBJECTIF : Analyser un workflow BPMN et détecter toutes les interfaces applicatives.
Une interface = UN SYSTÈME APPLICATIF UNIQUE, même s'il est utilisé par plusieurs tâches.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 WORKFLOW COMPLET À ANALYSER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{workflow_json}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 RÈGLE FONDAMENTALE : UNE INTERFACE = UN SYSTÈME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ DÉDUPLICATION OBLIGATOIRE :
- Si "Nov@GC" apparaît sur 3 tâches → UNE seule interface Nov@GC avec 3 tâches liées
- Si "TI+" apparaît sur 4 tâches → UNE seule interface TI+ avec 4 tâches liées  
- Si "Core Banking" apparaît sur 2 tâches → UNE seule interface Core Banking avec 2 tâches liées

NE JAMAIS créer deux interfaces pour le même système applicatif.
Regroupe toutes les tâches qui utilisent le même système dans UNE interface,
dans le champ "taches_liees" (liste des tâches concernées).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 SIGNAUX D'INTERFAÇAGE À DÉTECTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **SIGNAL FORT (interface Confirmée)** :
   - La colonne "outil" contient un nom de système identifiable
     (ex: "Nov@GC", "TI+", "Core Banking", "Active Directory", "Swift Alliance")
   - Le libellé contient un verbe d'échange + un système nommé

2️⃣ **SIGNAL MOYEN (interface Suggérée)** :
   - L'outil est vide MAIS le libellé contient un verbe d'échange
     ("Envoyer", "Recevoir", "Interroger", "Alimenter", "Consulter", "Générer")
   - L'acteur est un rôle technique avec outil vide

3️⃣ **SIGNAL FAIBLE (interface Incertaine)** :
   - Le contexte métier suggère un système sans signal explicite

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STRUCTURE D'UNE INTERFACE (déduplication incluse)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chaque interface a :

**id_interface** : "INT-001", "INT-002"...
**application_cible** : Nom unique du système (ex: "Nov@GC", "TI+", "Core Banking")
**taches_liees** : Liste des tâches qui utilisent ce système :
    [
      {{ "id_tache": "3", "nom_etape": "Rattacher les documents" }},
      {{ "id_tache": "5", "nom_etape": "Procéder au contrôle du dossier" }}
    ]
**description_fonctionnelle** : Description globale du rôle de ce système dans le processus (50-150 caractères)
**type_developpement** : "Développement Interne" | "Développement Externe" | "Progiciel" | "Inconnu"
**type_flux** : "API REST" | "Webservice" | "Flux fichier" | "Lecture/Écriture BDD" | "Email" | "Inconnu"
**sens_flux** : "Sortant" | "Entrant" | "Bidirectionnel" | "Inconnu"
**flux_intra_module** : "Oui" | "Non" | "Inconnu"
**flux_vers_CBS** : "Oui" | "Non" | "Inconnu"
**interface_jetable** : "Oui" | "Non" | "Inconnu"
**niveau_confiance** : "Confirmée" | "Suggérée" | "Incertaine"
**champs_a_completer** : Liste des champs non renseignés avec certitude

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES STRICTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✅ Analyse UNIQUEMENT typeBpmn = "Task" ou "ExclusiveGateway"
   IDs concernés : {analysable_ids}

2. ✅ DÉDUPLICATION STRICTE : une application_cible = une seule interface
   Vérifie chaque nouveau système contre ceux déjà créés avant d'en ajouter un

3. ✅ Si tu n'es pas certain d'un champ → "Inconnu" + ajoute dans champs_a_completer

4. ✅ "Email interne" n'est PAS une interface applicative — ignore sauf système nommé

5. ✅ flux_vers_CBS = "Oui" uniquement si Core Banking System clairement impliqué

6. ✅ La description_fonctionnelle doit couvrir TOUTES les tâches liées, pas une seule

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 FORMAT DE SORTIE (JSON PUR, sans markdown)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{
  "interfaces": [
    {{
      "id_interface": "INT-001",
      "application_cible": "Nov@GC",
      "taches_liees": [
        {{ "id_tache": "3", "nom_etape": "Rattacher les documents" }},
        {{ "id_tache": "5", "nom_etape": "Procéder au contrôle du dossier" }},
        {{ "id_tache": "8", "nom_etape": "Valider l'opération" }}
      ],
      "description_fonctionnelle": "Système de gestion documentaire utilisé pour l'attachement, contrôle et validation des dossiers",
      "type_developpement": "Progiciel",
      "type_flux": "Lecture/Écriture BDD",
      "sens_flux": "Bidirectionnel",
      "flux_intra_module": "Non",
      "flux_vers_CBS": "Non",
      "interface_jetable": "Non",
      "niveau_confiance": "Confirmée",
      "champs_a_completer": []
    }},
    {{
      "id_interface": "INT-002",
      "application_cible": "TI+",
      "taches_liees": [
        {{ "id_tache": "10", "nom_etape": "Génération d'un évènement Acceptation sur TI+" }},
        {{ "id_tache": "11", "nom_etape": "Compléter la saisie" }},
        {{ "id_tache": "12", "nom_etape": "Valider l'acceptation" }}
      ],
      "description_fonctionnelle": "Système de traitement des opérations internationales pour saisie et validation des acceptations",
      "type_developpement": "Inconnu",
      "type_flux": "Inconnu",
      "sens_flux": "Bidirectionnel",
      "flux_intra_module": "Non",
      "flux_vers_CBS": "Inconnu",
      "interface_jetable": "Non",
      "niveau_confiance": "Confirmée",
      "champs_a_completer": ["type_developpement", "type_flux", "flux_vers_CBS"]
    }}
  ],
  "resume": {{
    "total_interfaces": 2,
    "confirmees": 2,
    "suggerees": 0,
    "incertaines": 0,
    "systemes_identifies": ["Nov@GC", "TI+"],
    "taches_sans_interface": ["1", "2"]
  }}
}}

⚡ ANALYSE MAINTENANT — REGROUPE PAR SYSTÈME, NE DUPLIQUE PAS :"""