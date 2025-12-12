"""
Processeur d'images 
Extrait les workflows depuis des images et retourne au format Table1Row
+ Amélioration de workflows existants
VERSION AMÉLIORÉE : Prompt adaptatif avec analyse réflexive
"""

import google.generativeai as genai
from PIL import Image
import io
import json
import re
from typing import Dict, List, Any
import os
import logging
import asyncio
from functools import partial
import time  # Pour backoff
import random  # Pour jitter

logger = logging.getLogger(__name__)

class ImageProcessor:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        
        genai.configure(api_key=api_key)
        
        self.model = genai.GenerativeModel(
            'gemini-2.5-flash',
            generation_config={
                "temperature": 0.1,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 16384,
            }
        )
        
        # Timeout applicatif (via asyncio.wait_for) – up pour vision lourde
        self.request_timeout = 600  # 10 minutes pour BPMN complexes
        self.max_retries = 3
        self.base_backoff = 1  # Start à 1s
    
    async def extract_workflow(self, image_data: bytes, content_type: str) -> Dict[str, Any]:
        """
        Extrait un workflow structuré depuis une image
        
        Args:
            image_data: Données binaires de l'image
            content_type: Type MIME de l'image
        
        Returns:
            Dict avec workflow au format Table1Row[] et métadonnées
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # Optimisation : Resize + compression pour accélérer vision (réduit tokens)
            max_size = 1024
            if max(image.size) > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                # Sauvegarde en mémoire comme JPEG quality 85 (petit boost vitesse)
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=85, optimize=True)
                image = Image.open(buffer)
                logger.info(f"Image optimisée: {image.size} px, ~{len(buffer.getvalue())} bytes")
            
            prompt = self._build_extraction_prompt()
            
            response = None
            for attempt in range(self.max_retries + 1):
                try:
                    # Timeout via asyncio.wait_for (sans request_options – SDK GenAI le gère pas)
                    response = await asyncio.wait_for(
                        asyncio.to_thread(
                            self.model.generate_content,  # Direct, pas de partial avec kwargs invalides
                            [prompt, image]
                        ),
                        timeout=self.request_timeout
                    )
                    break  # Succès !
                    
                except asyncio.TimeoutError:
                    error_msg = f"Timeout app après {self.request_timeout}s (tentative {attempt+1}/{self.max_retries+1})."
                    logger.warning(error_msg)
                    
                except Exception as e:
                    error_msg = str(e)
                    if "504" in error_msg or "DeadlineExceeded" in error_msg:
                        error_msg = f"Timeout serveur Gemini (tentative {attempt+1}/{self.max_retries+1})."
                    else:
                        # Log full pour debug (ex. quotas, auth)
                        logger.error(f"Erreur inattendue tentative {attempt+1}: {error_msg}")
                    logger.warning(error_msg)
                    
                if attempt < self.max_retries:
                    # Exponential backoff + jitter random (évite sync retries)
                    sleep_time = self.base_backoff * (2 ** attempt) + random.uniform(0, 1)
                    logger.info(f"Retry après {sleep_time:.1f}s (backoff + jitter)...")
                    await asyncio.sleep(sleep_time)
                else:
                    raise ValueError(
                        f"Échec après {self.max_retries+1} tentatives: {error_msg}. "
                        "L'image est trop complexe, quotas free tier capés, ou API surchargée. "
                        "Vérifiez quotas sur AI Studio et réessayez plus tard."
                    )
            
            logger.info(f"✓ Réponse Gemini reçue ({len(response.text)} caractères)")
            
            workflow_data = self._parse_gemini_response(response.text)
            
            validated = self._validate_and_normalize_workflow(workflow_data)
            
            # Métadonnées enrichies
            metadata = self._build_metadata(validated, image)
            
            return {
                "workflow": validated,
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur extraction workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'extraire le workflow: {str(e)}")
    
    async def improve_workflow(self, workflow: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        🆕 Améliore un workflow existant avec Gemini 2.5 Flash
        
        Args:
            workflow: Tableau Table1Row[] existant
        
        Returns:
            Dict avec workflow amélioré et métadonnées de comparaison
        """
        try:
            prompt = self._build_improvement_prompt(workflow)
            
            response = self.model.generate_content(prompt)
            
            logger.info(f"✓ Réponse Gemini amélioration reçue ({len(response.text)} caractères)")
            
            improved_data = self._parse_gemini_response(response.text)
            
            validated = self._validate_and_normalize_workflow(improved_data)
            
            # Métadonnées de comparaison
            comparison = self._build_comparison_metadata(workflow, validated)
            
            return {
                "workflow": validated,
                "metadata": comparison
            }
            
        except Exception as e:
            logger.error(f"❌ Erreur amélioration workflow: {str(e)}", exc_info=True)
            raise ValueError(f"Impossible d'améliorer le workflow: {str(e)}")
    
    def _build_extraction_prompt(self) -> str:
        """Construit le prompt adaptatif renforcé pour Gemini"""
        return """Tu es un expert en extraction de processus métier depuis des diagrammes BPMN visuels.

🎯 OBJECTIF: Produire un JSON structuré qui remplira un tableau pour générer un BPMN.
Ne prends pas trop de tempss à réfléchir, mais sois méthodique et précis.
ne neglige aucune étape visible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PHASE 1 : ANALYSE VISUELLE CRITIQUE (RÉFLEXION INTERNE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant toute extraction, **analyse méthodiquement** le diagramme :

1️⃣ **STRUCTURE DES SWIMLANES** :
   - Y a-t-il des bandes horizontales/verticales avec en-têtes ? (swimlanes = acteurs)
   - Les en-têtes sont-ils en haut, à gauche, ou dans une colonne dédiée ?
   - Exemples typiques d'en-têtes : "Client", "Agence/Chef de caisse", "CAE/Middle Office BPP", 
     "Gestionnaire des opérations Back Office International", "Mandataires habilités"

2️⃣ **DISTINCTION ACTEURS vs OUTILS (⚠️ CRITIQUE)** :
   
   **ACTEURS** = Rôles humains ou organisationnels qui EXÉCUTENT les tâches
   - Positionnés dans les en-têtes de swimlanes (bandes)
   - Exemples : "Nov@ OA" n'est JAMAIS un acteur, c'est un outil !
   - Acteurs valides : "Client", "Gestionnaire", "CAE/Middle Office", "Mandataires habilités"
   
   **OUTILS** = Systèmes informatiques UTILISÉS pour réaliser les tâches
   - Mentionnés À CÔTÉ ou DANS les rectangles/cercles d'étapes
   - Souvent avec @ ou des icônes : "Nov@ OA", "Nov@ CL", "TI+", "Portal", "CRM", "Email"
   - Peuvent apparaître en annotations près des formes géométriques
   
   ⚠️ **RÈGLE ABSOLUE** :
   - Si tu vois "Nov@ OA" ou tout autre nom de système PRÈS d'une forme → c'est un OUTIL, pas un acteur
   - L'acteur est celui dans l'EN-TÊTE de la swimlane où se trouve cette forme
   - Ne JAMAIS mettre un outil dans le champ "acteur"

3️⃣ **HIÉRARCHIE DES GROUPEMENTS** :
   
   **CAGES/RECTANGLES ENGLOBANTS** = Groupes d'étapes sous un titre commun
   - Un rectangle avec un titre général contient PLUSIEURS formes à l'intérieur
   - Exemple : "Identification du souscripteur" n'est PAS une étape unique, mais un TITRE
     pour plusieurs étapes : "Recherche client", "Entretien", "Définir usage", etc.
   
   **RÈGLE** : Si un rectangle contient d'autres formes, c'est un GROUPEMENT, pas une étape

4️⃣ **IDENTIFICATION PRÉCISE DES FORMES BPMN** :
   
   **Cercles/ovales** :
   - Simple (trait fin) = **StartEvent** (début du processus)
   - Double/épais/rempli = **EndEvent** (fin du processus)
   - ⚠️ Ne confonds PAS un cercle avec annotation "Nov@ OA" avec un acteur !
   
   **Rectangles** :
   - Coins droits ou arrondis = **Task** (action à réaliser)
   - Peut contenir du texte OU avoir du texte à côté avec un trait
   - Si un trait relie un texte à un rectangle peu visible → c'est quand même une Task
   
   **Losanges** :
   - = **ExclusiveGateway** (décision binaire ou multiple)
   - Doit avoir AU MOINS 2 sorties (Oui/Non, Approuvé/Rejeté, etc.)
   
   **Annotations sur flèches** :
   - Labels comme "Oui", "Non", "Conforme", "Rejeté" → ce sont des CONDITIONS de flux
   - ⚠️ Ce ne sont PAS des étapes ! Ne crée pas d'entrée JSON pour elles

5️⃣ **FLUX ET GATEWAYS COMPLEXES** :
   
   **Gateway avec retour en arrière** :
   - Un Gateway peut rediriger vers une étape précédente (boucle)
   - Exemple : "Justificatifs conformes ?" → Non → retour à "Analyser dossier"
   
   **Gateway avec jonction (OU logique)** :
   - Après un Gateway, plusieurs chemins peuvent SE REJOINDRE sur une même étape
   - Exemple : Gateway → "Oui" → Task A ; Gateway → "Non" → End Event
   
   **Séquence Gateway → Gateway** :
   - Un Gateway peut mener à un autre Gateway
   - Chaque Gateway doit être une étape distincte avec sa propre condition

6️⃣ **END EVENTS vs TASKS FINALES** :
   
   ⚠️ **DISTINCTION CRUCIALE** :
   - **EndEvent** = Cercle épais/double qui TERMINE le processus (pas de sortie)
   - **Task finale** = Rectangle qui peut avoir une sortie vers un EndEvent
   
   Exemple incorrect : "Surseoir à la demande" → si c'est un cercle épais, c'est un EndEvent
   Exemple correct : "Transmettre bordereau" (rectangle) → outputOui → EndEvent (cercle)
   les endevents doivent être palces daans les swimlanes appropriées
   on n'invante pas de endevent ni de swimlane
   les endevents ne doivent jamais avoir des acteurs vides
   les endevents et les taches peuvent avoir les memes  acteurs ou swimlanes  si cest ce que l'on voit sur l'image
   ne veux pas que ya une regle impose pour un swimlane donnee. tu 
   tu remplis le json selon ce que tu as vu sur l'image sans casser la structure, les appartenances aux acteurs

   on sait que tu est fort,
   tu dois pouvoir bien lire et comprendre les elements sur l'images, pouvoir reflechir et extraire tout ce qui est visible pour faire un json parfait


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖊️ PHASE 1.5 : TRAITEMENT DES DIAGRAMMES MANUSCRITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **SI LE DIAGRAMME EST MANUSCRIT** (traits irréguliers, écriture à la main) :

🎯 **OBJECTIF** : Produire UN SEUL FLOW JSON continu, COHÉRENT et PROFESSIONNEL, même si le manuscrit est imparfait.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MÉTHODOLOGIE EN 4 ÉTAPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ÉTAPE 1 : SCANNER ET IDENTIFIER**
- Repère TOUTES les formes (cercles, rectangles, losanges) sur TOUTE la page
- Note TOUTES les zones/sections (même avec titres différents)
- Suis TOUTES les flèches (même imparfaites, en pointillés, courbées)

**ÉTAPE 2 : CORRIGER ET REFORMULER (⚠️ CRITIQUE)**

Les manuscrits contiennent souvent des erreurs. Tu dois les CORRIGER :

✅ **Orthographe et grammaire** :
- "Controle des docs" → "Contrôle des documents"
- "Validat" → "Validation"
- "traitemt ope" → "Traitement opérationnel"
- "Notife-mail" → "Notification par email"
- "Aller-Retour client" → "Aller-retour avec le client"

✅ **Verbes à l'infinitif** :
- "Blocage prov" → "Bloquer provisoirement"
- "Scan DOCS" → "Scanner les documents"
- "Validat SWIFT" → "Valider le message SWIFT"

✅ **Textes incomplets ou abrégés** :
- "docs" → "documents"
- "prov" → "provisoire/provisoirement"
- "ope" → "opération/opérationnel"
- "motif" → "motif de rejet"

✅ **Contextualisation** :
- Si tu vois "Rejet + motif" → reformule en "Notifier le rejet avec motif"
- Si tu vois "KO" seul → déduis du contexte : "Validation KO" → étape "Gestion du refus"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 NORMALISATION DES GATEWAYS (⚠️ RÈGLE ABSOLUE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**TOUS les ExclusiveGateway doivent avoir des sorties Oui/Non LOGIQUES**

📌 **CAS 1 : Gateway avec OK/KO**
```
Manuscrit :  [Losange] "OK ?" 
             ↓ OK        ↓ KO
```
✅ **Transformation** :
```json
{
  "id": "X",
  "étape": "Contrôle validé ?",  // ou "Analyse positive ?" selon contexte
  "typeBpmn": "ExclusiveGateway",
  "condition": "Contrôle validé ?",
  "outputOui": "Y",    // → Chemin OK
  "outputNon": "Z"     // → Chemin KO
}
```

📌 **CAS 2 : Gateway avec Succès/Échec**
```
Manuscrit :  [Losange] après "Effectuer tâche"
             ↓ Succès    ↓ Échec
```
✅ **Transformation** :
```json
{
  "id": "X",
  "étape": "Tâche effectuée avec succès ?",
  "typeBpmn": "ExclusiveGateway",
  "condition": "Tâche effectuée avec succès ?",
  "outputOui": "Y",    // → Succès
  "outputNon": "Z"     // → Échec
}
```

📌 **CAS 3 : Gateway avec Conforme/Non conforme**
```
Manuscrit :  [Losange] "Conforme ?"
             ↓ Conforme    ↓ Non conforme
```
✅ **Transformation** :
```json
{
  "id": "X",
  "étape": "Documents conformes ?",
  "typeBpmn": "ExclusiveGateway",
  "condition": "Documents conformes ?",
  "outputOui": "Y",    // → Conforme
  "outputNon": "Z"     // → Non conforme
}
```

📌 **CAS 4 : Gateway avec Oui/Non (déjà bon)**
```
Manuscrit :  [Losange] "Validat ?"
             ↓ Oui      ↓ Non
```
✅ **Transformation** :
```json
{
  "id": "X",
  "étape": "Validation approuvée ?",
  "typeBpmn": "ExclusiveGateway",
  "condition": "Validation approuvée ?",
  "outputOui": "Y",
  "outputNon": "Z"
}
```

📌 **CAS 5 : Gateway implicite (pas de texte clair)**
```
Manuscrit :  [Losange] sans texte, après "Analyser dossier"
             ↓ une flèche    ↓ une flèche
```
✅ **Déduction contextuelle** :
```json
{
  "id": "X",
  "étape": "Dossier validé ?",
  "typeBpmn": "ExclusiveGateway",
  "condition": "Dossier validé ?",
  "outputOui": "Y",
  "outputNon": "Z"
}
```

🚨 **RÈGLE ABSOLUE** : 
- **JAMAIS** de "OK/KO", "Succès/Échec", "Conforme/Non conforme" dans outputOui/outputNon
- **TOUJOURS** transformer en question claire avec réponse Oui/Non
- **TOUJOURS** garder la LOGIQUE : ce qui était "OK" devient outputOui, ce qui était "KO" devient outputNon

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**ÉTAPE 3 : COMPRENDRE LES CONNEXIONS**
- Les flèches montrent les connexions RÉELLES entre zones
- Une flèche qui traverse les zones = ces zones sont CONNECTÉES
- Si Zone A → flèche → Zone B : outputOui de dernière étape de A pointe vers première étape de B

**ÉTAPE 4 : FUSIONNER EN UN SEUL FLOW**
- **UN SEUL StartEvent** au début du processus global
- **Toutes les sections sont des BRANCHES** d'un même processus
- Les branches se rejoignent sur le flux principal via les connexions
- **Plusieurs EndEvent possibles** selon les issues (succès, rejet, report, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ERREURS À ÉVITER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ **Copier-coller le texte manuscrit** tel quel (avec fautes, abrévations)
❌ **Créer plusieurs StartEvent** indépendants (sauf si vraiment séparés)
❌ **Laisser "OK/KO"** au lieu de "Oui/Non" dans les Gateway
❌ **Perdre des connexions** entre zones du diagramme
❌ **Inventer des étapes** qui n'existent pas visuellement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ BONNES PRATIQUES OBLIGATOIRES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ **Corriger, reformuler, professionnaliser** le texte manuscrit
✅ **Normaliser TOUS les Gateway** en questions Oui/Non
✅ **Suivre TOUTES les flèches** pour capturer toutes les connexions
✅ **Produire UN flow CONTINU et LOGIQUE**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ EXEMPLE COMPLET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Manuscrit vu** :
- Cercle : "Présntat en agence"
- Rectangle : "Scan DOCS" avec "Nova Caisse" à côté
- Rectangle : "Controle des docs" 
- Losange : "OK ?" → OK vers "Blocage prov" / KO vers "Validat ?"
- Losange : "Validat ?" → Oui vers "Aller-Retour client" / Non vers "Rejet + motif"

**JSON corrigé** :
```json
{
  "workflow": [
    {
      "id": "1",
      "étape": "Présentation en agence",
      "typeBpmn": "StartEvent",
      "département": "Commercial",
      "acteur": "Client",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "2",
      "étape": "Scanner les documents",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "BOI",
      "condition": "",
      "outputOui": "3",
      "outputNon": "",
      "outil": "Nova Caisse"
    },
    {
      "id": "3",
      "étape": "Contrôle des documents",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "BOI",
      "condition": "",
      "outputOui": "4",
      "outputNon": "",
      "outil": "Nova BO"
    },
    {
      "id": "4",
      "étape": "Contrôle validé ?",
      "typeBpmn": "ExclusiveGateway",
      "département": "Back Office",
      "acteur": "BOI",
      "condition": "Contrôle validé ?",
      "outputOui": "5",
      "outputNon": "6",
      "outil": ""
    },
    {
      "id": "5",
      "étape": "Bloquer provisoirement",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "BOI",
      "condition": "",
      "outputOui": "6",
      "outputNon": "",
      "outil": "BO Main"
    },
    {
      "id": "6",
      "étape": "Validation approuvée ?",
      "typeBpmn": "ExclusiveGateway",
      "département": "Agence",
      "acteur": "Agence",
      "condition": "Validation approuvée ?",
      "outputOui": "7",
      "outputNon": "8",
      "outil": ""
    },
    {
      "id": "7",
      "étape": "Aller-retour avec le client",
      "typeBpmn": "Task",
      "département": "Agence",
      "acteur": "Agence",
      "condition": "",
      "outputOui": "9",
      "outputNon": "",
      "outil": "Nova Caisse"
    },
    {
      "id": "8",
      "étape": "Notifier le rejet avec motif",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "BOI",
      "condition": "",
      "outputOui": "10",
      "outputNon": "",
      "outil": "Nova BO Main"
    },
    {
      "id": "9",
      "étape": "Fin du processus (validation)",
      "typeBpmn": "EndEvent",
      "département": "Agence",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "10",
      "étape": "Fin du processus (rejet)",
      "typeBpmn": "EndEvent",
      "département": "Back Office",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    }
  ]
}
```

🎯 **VÉRIFICATION FINALE** :
Avant de retourner le JSON, vérifie :
✓ Toutes les fautes d'orthographe corrigées ?
✓ Tous les Gateway ont des conditions en questions Oui/Non ?
✓ Toutes les connexions (flèches) sont capturées ?
✓ Le flow est CONTINU, LOGIQUE et fait DU SENS métier ?
✓ Les acteurs sont dans les swimlanes, pas les outils ?



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PHASE 2 : EXTRACTION AU FORMAT JSON STRICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**FORMAT OBLIGATOIRE** :
{
  "workflow": [
    {
      "id": "1",
      "étape": "Nom descriptif de l'action",
      "typeBpmn": "StartEvent | Task | ExclusiveGateway | EndEvent",
      "département": "Service métier déduit",
      "acteur": "Rôle responsable depuis swimlane",
      "condition": "Question pour Gateway (sinon vide)",
      "outputOui": "ID étape suivante",
      "outputNon": "ID alternatif (Gateway uniquement)",
      "outil": "Système informatique utilisé (sinon vide)"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RÈGLES D'EXTRACTION RENFORCÉES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 **EXTRACTION DES ACTEURS (SELON STRUCTURE DÉTECTÉE)** :

**CAS 1 : DIAGRAMME AVEC SWIMLANES (bandes avec en-têtes)** :
   ✅ **acteur** = Copie EXACTEMENT le texte de l'en-tête de la swimlane
      - "Agence/Chef de caisse Super CCO" → acteur: "Agence/Chef de caisse Super CCO"
      - "CAE/Middle Office BPP" → acteur: "CAE/Middle Office BPP"
      - "Gestionnaire des opérations Back Office International" → acteur: "Gestionnaire des opérations Back Office International"
      - **NE JAMAIS raccourcir ou modifier**
   
   ✅ **département** = Déduis le service métier général depuis l'acteur
      - "CAE/Middle Office" → département: "Middle Office"
      - "Agence" → département: "Commercial"
      - "Gestionnaire Back Office" → département: "Back Office"
   
   ⚠️ **ERREUR FRÉQUENTE À ÉVITER** :
      - Si tu vois "Nov@ OA" écrit PRÈS d'une étape dans la swimlane "Client"
      - ❌ FAUX : acteur: "Nov@ OA" (c'est un outil !)
      - ✅ CORRECT : acteur: "Client", outil: "Nov@ OA"

**CAS 2 : ACTEURS DANS LES FORMES (sans swimlanes)** :
   ✅ **acteur** = Extrait le rôle depuis le texte de la forme
      - "Engineering Team Lead review" → acteur: "Engineering Team Lead", étape: "Review"
      - "Editor verifies" → acteur: "Editor", étape: "Verify content"
   
   ✅ **département** = Déduis depuis le rôle
      - "Engineering Team Lead" → département: "Engineering"
      - "Project Manager" → département: "Management"

**CAS 3 : AUCUN ACTEUR VISIBLE** :
   ✅ **acteur** = "" (chaîne vide)
   ✅ **département** = Déduis du contexte si possible, sinon ""
   ⚠️ **NE JAMAIS inventer d'acteurs**

📌 **EXTRACTION DES OUTILS (⚠️ CRITIQUE)** :

**OUTILS MÉTIER COURANTS** :
   - Systèmes avec @ : "Nov@ OA", "Nov@ CL", "Nov@ Bank"
   - Applications métier : "TI+", "CRM", "Portal", "SAP", "Swift"
   - Communication : "Email", "Mail", "Fax"
   
**LOCALISATION DES OUTILS** :
   - Texte À CÔTÉ d'une forme (rectangle, cercle) avec ou sans trait de liaison
   - Annotation dans ou près d'une étape
   - Icônes ou logos près des formes
   
**NORMALISATION** :
   - "nov@ oa" → "Nov@ OA"
   - "crm" → "CRM"
   - "email" → "Email"
   
**RÈGLE** :
   - Si un outil est mentionné → remplis le champ "outil"
   - Si rien n'est mentionné → ""

📌 **GESTION DES GROUPEMENTS (CAGES)** :

**SI tu détectes un rectangle englobant avec un titre** :
   1. Le titre n'est PAS une étape
   2. Extrais CHAQUE forme géométrique À L'INTÉRIEUR comme étape séparée
   3. Respecte l'ordre visuel des étapes dans le groupe
   
   **Exemple** :
   - Rectangle "Identification du souscripteur" contient :
     → Task "Recherche client dans Nov@Bank"
     → Task "Entretien avec le client"
     → Task "Définir l'usage de la dotation"
   
   ✅ Crée 3 entrées JSON distinctes pour ces Tasks
   ❌ NE crée PAS d'entrée pour "Identification du souscripteur"

📌 **CONNEXIONS ET FLUX COMPLEXES** :

**RÈGLES GÉNÉRALES** :
   - **outputOui** = ID de l'étape suivante dans le flux principal
   - **outputNon** = ID de l'alternative (UNIQUEMENT pour ExclusiveGateway)
   
**POUR LES GATEWAYS** :
   1. Identifie les labels sur les flèches sortantes :
      - "Oui"/"Non", "Approved"/"Rejected", "Conforme"/"Non conforme"
   
   2. **Flux avec retour en arrière** :
      - Si "Non" retourne à une étape précédente → outputNon = ID de cette étape
      - Exemple : Gateway "Conforme ?" (id: "5") → Non → "Analyser dossier" (id: "3")
        → outputNon: "3"
   
   3. **Flux avec jonction (OU)** :
      - Si plusieurs chemins se rejoignent sur une même étape
      - Exemple : Gateway1 → Oui → Task A ; Gateway2 → Oui → Task A
      - Les deux Gateways ont outputOui pointant vers Task A
   
   4. **Gateway vers Gateway** :
      - Chaque Gateway est une étape distincte
      - outputOui/outputNon peut pointer vers un autre Gateway

**POUR LES END EVENTS** :
   - outputOui = "" (pas de sortie)
   - outputNon = ""

📌 **CONDITIONS (pour ExclusiveGateway)** :

**FORMULATION** :
   - Extrais le texte du losange
   - Transforme en question si nécessaire
   - Exemples :
     * "Dossier conforme" → condition: "Dossier conforme ?"
     * "Justificatifs OK ?" → condition: "Justificatifs OK ?"
     * "Approved" → condition: "Content approved ?"
   
**SI PAS DE TEXTE CLAIR** :
   - Déduis depuis le contexte
   - Exemple : Gateway après "Analyser dossier" → condition: "Analyse positive ?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ RÈGLES STRICTES DE FORMATAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ✅ Tous les champs OBLIGATOIRES (utilise `""` si vide, JAMAIS `null`)
2. ✅ IDs séquentiels : "1", "2", "3", "4"... (dans l'ordre du flux)
3. ✅ Pour **ExclusiveGateway** : 
   - condition OBLIGATOIRE (non vide)
   - outputOui ET outputNon REQUIS (sauf si fin de processus)
4. ✅ Pour **Task/StartEvent/EndEvent** : 
   - condition = ""
   - outputNon = ""
5. ✅ **LITTÉRALITÉ** : Ne traduis pas, ne paraphrase pas les noms
6. ✅ **EXHAUSTIVITÉ** : Extrais TOUTES les formes géométriques visibles
7. ✅ **JSON PUR** : Retourne UNIQUEMENT le JSON, sans markdown ```json```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ EXEMPLES COMPLEXES DE RÉFÉRENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Exemple 1 : Swimlanes + Outils + Gateway avec retour**
{
  "workflow": [
    {
      "id": "1",
      "étape": "Saisie de la demande du crédit d'enlèvement",
      "typeBpmn": "StartEvent",
      "département": "Commercial",
      "acteur": "Agence/Chef de caisse Super CCO",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "Nov@ OA"
    },
    {
      "id": "2",
      "étape": "Validation de la saisie de la demande",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Agence/Chef de caisse Super CCO",
      "condition": "",
      "outputOui": "3",
      "outputNon": "",
      "outil": "Nov@ OA"
    },
    {
      "id": "3",
      "étape": "Analyse de la demande du crédit d'enlèvement",
      "typeBpmn": "Task",
      "département": "Middle Office",
      "acteur": "CAE/Middle Office BPP",
      "condition": "",
      "outputOui": "4",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "4",
      "étape": "Statuer sur la demande du crédit d'enlèvement",
      "typeBpmn": "ExclusiveGateway",
      "département": "Middle Office",
      "acteur": "CAE/Middle Office BPP",
      "condition": "Statuer sur la demande du crédit d'enlèvement",
      "outputOui": "5",
      "outputNon": "6",
      "outil": ""
    },
    {
      "id": "5",
      "étape": "Validation de la saisie de la demande du crédit",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Agence/Chef de caisse Super CCO",
      "condition": "",
      "outputOui": "7",
      "outputNon": "",
      "outil": "Nov@ OA"
    },
    {
      "id": "6",
      "étape": "Refus de la demande du crédit",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Agence/Chef de caisse Super CCO",
      "condition": "",
      "outputOui": "8",
      "outputNon": "",
      "outil": "Nov@ OA"
    },
    {
      "id": "7",
      "étape": "Envoyer notification à l'agence",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "Gestionnaire Back Office",
      "condition": "",
      "outputOui": "9",
      "outputNon": "",
      "outil": "Email"
    },
    {
      "id": "8",
      "étape": "Communication du refus au client",
      "typeBpmn": "Task",
      "département": "Commercial",
      "acteur": "Agence/Chef de caisse Super CCO",
      "condition": "",
      "outputOui": "10",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "9",
      "étape": "Signature de la soumission cautionnée",
      "typeBpmn": "Task",
      "département": "Legal",
      "acteur": "Mandataires habilités",
      "condition": "",
      "outputOui": "11",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "10",
      "étape": "Fin du processus (refus)",
      "typeBpmn": "EndEvent",
      "département": "Commercial",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "11",
      "étape": "Fin du processus (accepté)",
      "typeBpmn": "EndEvent",
      "département": "Legal",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    }
  ]
}

**Exemple 2 : Groupement d'étapes dans une cage**
{
  "workflow": [
    {
      "id": "1",
      "étape": "Présentation du tiers",
      "typeBpmn": "StartEvent",
      "département": "Commercial",
      "acteur": "Client",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "2",
      "étape": "Recherche client dans Nov@Bank",
      "typeBpmn": "Task",
      "département": "Agence",
      "acteur": "Nov@ CL",
      "condition": "",
      "outputOui": "3",
      "outputNon": "",
      "outil": "Nov@Bank"
    },
    {
      "id": "3",
      "étape": "Client existe ?",
      "typeBpmn": "ExclusiveGateway",
      "département": "Agence",
      "acteur": "Nov@ CL",
      "condition": "Client existe ?",
      "outputOui": "5",
      "outputNon": "4",
      "outil": ""
    },
    {
      "id": "4",
      "étape": "Fin du processus",
      "typeBpmn": "EndEvent",
      "département": "Agence",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "5",
      "étape": "Entretien avec le client",
      "typeBpmn": "Task",
      "département": "Agence",
      "acteur": "Nov@ CL",
      "condition": "",
      "outputOui": "6",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "6",
      "étape": "Définir l'usage de la dotation d'études",
      "typeBpmn": "Task",
      "département": "Agence",
      "acteur": "Nov@ CL",
      "condition": "",
      "outputOui": "7",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "7",
      "étape": "Justificatifs conformes ?",
      "typeBpmn": "ExclusiveGateway",
      "département": "Back Office",
      "acteur": "Gestionnaire BOI",
      "condition": "Justificatifs conformes ?",
      "outputOui": "8",
      "outputNon": "9",
      "outil": ""
    },
    {
      "id": "8",
      "étape": "Validation du dossier",
      "typeBpmn": "Task",
      "département": "Back Office",
      "acteur": "Gestionnaire BOI",
      "condition": "",
      "outputOui": "10",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "9",
      "étape": "Surseoir à la demande",
      "typeBpmn": "EndEvent",
      "département": "Back Office",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    },
    {
      "id": "10",
      "étape": "Fin du processus",
      "typeBpmn": "EndEvent",
      "département": "Back Office",
      "acteur": "",
      "condition": "",
      "outputOui": "",
      "outputNon": "",
      "outil": ""
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 DIRECTIVE FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Analyse visuelle critique** selon les 6 axes de la Phase 1
2. **Distingue rigoureusement** :
   - Acteurs (en-têtes swimlanes) vs Outils (systèmes à côté des formes)
   - Étapes (formes géométriques) vs Groupements (cages englobantes)
   - Tasks finales vs EndEvents (cercles épais)
3. **Extrais exhaustivement** TOUTES les formes géométriques
4. **Gère les flux complexes** : retours, jonctions, Gateway→Gateway
5. ** les endevents doivent toujours avoir des acteurs non vides
6. **Retourne UNIQUEMENT le JSON** sans balises markdown


⚡ COMMENCE L'ANALYSE ET L'EXTRACTION MAINTENANT :"""

    def _build_improvement_prompt(self, workflow: List[Dict[str, str]]) -> str:
        """
        🆕 Construit le prompt pour améliorer un workflow existant
        """
        workflow_json = json.dumps(workflow, ensure_ascii=False, indent=2)
        
        return f"""Tu es un expert en modélisation de processus métier BPMN. 

🎯 MISSION: Améliorer le workflow suivant pour qu'il soit plus professionnel, cohérent et exploitable.

📋 WORKFLOW ACTUEL:
```json
{workflow_json}
```

✨ AMÉLIORATIONS À APPORTER:

1. **FORMULATION DES ÉTAPES**:
   - Utilise des verbes d'action à l'infinitif (ex: "Vérifier", "Envoyer", "Valider")
   - Sois précis et professionnel (évite "Faire qqchose", privilégie "Effectuer la vérification KYC")
   - Harmonise le style rédactionnel

2. **COHÉRENCE STRUCTURELLE**:
   - Vérifie que les connexions (outputOui/outputNon) sont logiques
   - Assure-toi qu'il y a UN StartEvent au début
   - Assure-toi qu'il y a au moins UN EndEvent
   - Valide que les IDs référencés existent

3. **DÉPARTEMENTS & ACTEURS**:
   - Unifie les noms (ex: "Vente" vs "Commercial" → choisis un seul terme)
   - Complète les acteurs manquants si le contexte le permet
   - Organise logiquement les swimlanes

4. **OUTILS**:
   - Identifie et ajoute les outils métier manquants (CRM, Email, Portail, etc.)
   - Normalise les noms d'outils (ex: "crm" → "CRM")

5. **CONDITIONS (pour ExclusiveGateway)**:
   - Formule des questions claires (ex: "Document valide ?" au lieu de "check doc")
   - Assure-toi que chaque Gateway a une condition

⚠️ RÈGLES STRICTES:
1. **GARDE LA MÊME STRUCTURE**: Ne change pas les IDs, ne supprime pas d'étapes
2. **CONSERVE LES CONNEXIONS**: outputOui/outputNon doivent rester cohérents
3. **FORMAT JSON OBLIGATOIRE**: Retourne UNIQUEMENT le JSON, sans markdown
4. **TOUS LES CHAMPS REQUIS**: id, étape, typeBpmn, département, acteur, condition, outputOui, outputNon, outil
5. **PAS DE NULL**: Utilise toujours "" pour les champs vides

📊 FORMAT DE SORTIE (identique au format d'entrée):
{{
  "workflow": [
    {{
      "id": "1",
      "étape": "Démarrer le processus de création de compte",
      "typeBpmn": "StartEvent",
      "département": "Service Client",
      "acteur": "Client",
      "condition": "",
      "outputOui": "2",
      "outputNon": "",
      "outil": "Portail en ligne"
    }},
    ...
  ]
}}

🚀 AMÉLIORE MAINTENANT LE WORKFLOW:"""

    def _parse_gemini_response(self, text: str) -> List[Dict[str, str]]:
        """Parse la réponse JSON de Gemini"""
        try:
            text = text.strip()
            
            # Extraire le JSON (gérer markdown)
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            
            # Nettoyer les balises markdown
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            
            data = json.loads(text)
            
            if "workflow" in data:
                workflow = data["workflow"]
            elif isinstance(data, list):
                workflow = data
            else:
                raise ValueError("Format JSON invalide - clé 'workflow' manquante")
            
            if not workflow or len(workflow) == 0:
                raise ValueError("Workflow vide retourné par Gemini")
            
            logger.info(f"✓ {len(workflow)} étapes extraites")
            return workflow
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ Erreur parsing JSON: {str(e)}\nTexte: {text[:500]}")
            raise ValueError(f"Réponse non-JSON de Gemini: {str(e)}")
    
    def _validate_and_normalize_workflow(self, workflow: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Valide et normalise au format Table1Row strict"""
        validated = []
        all_ids = [str(step.get("id", "")) for step in workflow]
        
        for idx, step in enumerate(workflow):
            # Normalisation stricte
            normalized = {
                "id": str(step.get("id", str(idx + 1))),
                "étape": str(step.get("étape", "")).strip() or f"Étape {idx + 1}",
                "typeBpmn": str(step.get("typeBpmn", "Task")),
                "département": str(step.get("département", "")).strip(),
                "acteur": str(step.get("acteur", "")).strip(),
                "condition": str(step.get("condition", "")).strip(),
                "outputOui": str(step.get("outputOui", "")).strip(),
                "outputNon": str(step.get("outputNon", "")).strip(),
                "outil": str(step.get("outil", "")).strip()
            }
            
            # Validation du type BPMN
            valid_types = ["StartEvent", "Task", "ExclusiveGateway", "EndEvent"]
            if normalized["typeBpmn"] not in valid_types:
                logger.warning(f"⚠️ Type invalide '{normalized['typeBpmn']}' → Task")
                normalized["typeBpmn"] = "Task"
            
            # Règles métier pour Gateway
            if normalized["typeBpmn"] == "ExclusiveGateway":
                if not normalized["condition"]:
                    normalized["condition"] = normalized["étape"] or "Décision"
            else:
                # Non-Gateway: pas de condition ni outputNon
                normalized["condition"] = ""
                normalized["outputNon"] = ""
            
            # Validation des connexions
            if normalized["outputOui"] and normalized["outputOui"] not in all_ids:
                logger.warning(f"⚠️ OutputOui invalide pour {normalized['id']}")
            
            if normalized["outputNon"] and normalized["outputNon"] not in all_ids:
                logger.warning(f"⚠️ OutputNon invalide pour {normalized['id']}")
            
            validated.append(normalized)
        
        logger.info(f"✅ Workflow validé: {len(validated)} étapes")
        return validated
    
    def _build_metadata(self, workflow: List[Dict[str, str]], image: Image.Image) -> Dict[str, Any]:
        """Construit les métadonnées du workflow"""
        actors = list(set(s["acteur"] for s in workflow if s["acteur"]))
        departments = list(set(s["département"] for s in workflow if s["département"]))
        tools = list(set(s["outil"] for s in workflow if s["outil"]))
        
        return {
            "image_info": {
                "size": f"{image.width}x{image.height}",
                "format": image.format
            },
            "workflow_stats": {
                "total_steps": len(workflow),
                "start_events": sum(1 for s in workflow if s["typeBpmn"] == "StartEvent"),
                "end_events": sum(1 for s in workflow if s["typeBpmn"] == "EndEvent"),
                "tasks": sum(1 for s in workflow if s["typeBpmn"] == "Task"),
                "gateways": sum(1 for s in workflow if s["typeBpmn"] == "ExclusiveGateway")
            },
            "business_info": {
                "actors": actors if actors else ["Non spécifié"],
                "actors_count": len(actors),
                "departments": departments if departments else ["Non spécifié"],
                "departments_count": len(departments),
                "tools": tools if tools else ["Non spécifié"],
                "tools_count": len(tools)
            }
        }
    
    def _build_comparison_metadata(self, 
                                   original: List[Dict[str, str]], 
                                   improved: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        🆕 Construit les métadonnées de comparaison avant/après amélioration
        """
        original_actors = set(s["acteur"] for s in original if s["acteur"])
        improved_actors = set(s["acteur"] for s in improved if s["acteur"])
        
        original_departments = set(s["département"] for s in original if s["département"])
        improved_departments = set(s["département"] for s in improved if s["département"])
        
        original_tools = set(s["outil"] for s in original if s["outil"])
        improved_tools = set(s["outil"] for s in improved if s["outil"])
        
        return {
            "comparison": {
                "actors_added": list(improved_actors - original_actors),
                "actors_removed": list(original_actors - improved_actors),
                "departments_added": list(improved_departments - original_departments),
                "departments_removed": list(original_departments - improved_departments),
                "tools_added": list(improved_tools - original_tools),
                "tools_removed": list(original_tools - improved_tools)
            },
            "workflow_stats": {
                "total_steps": len(improved),
                "start_events": sum(1 for s in improved if s["typeBpmn"] == "StartEvent"),
                "end_events": sum(1 for s in improved if s["typeBpmn"] == "EndEvent"),
                "tasks": sum(1 for s in improved if s["typeBpmn"] == "Task"),
                "gateways": sum(1 for s in improved if s["typeBpmn"] == "ExclusiveGateway")
            },
            "improvements": {
                "steps_reformulated": sum(
                    1 for i, orig in enumerate(original) 
                    if i < len(improved) and orig["étape"] != improved[i]["étape"]
                ),
                "actors_clarified": len(improved_actors) - len(original_actors),
                "tools_identified": len(improved_tools) - len(original_tools)
            }
        }