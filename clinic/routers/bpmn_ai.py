"""
Router FastAPI pour l'enrichissement IA des tableaux BPMN
Enrichit UNIQUEMENT les colonnes manquantes (Département, Acteur, Outil) + améliore les titres d'étapes
"""

from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
import google.generativeai as genai
import os
import json

router = APIRouter(prefix="/api/bpmn-ai", tags=["BPMN AI"])

# Configuration Gemini
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ✅ Modèle Pydantic pour les lignes du tableau
class TableRowInput(BaseModel):
    id: str
    étape: str
    typeBpmn: str
    actions: str
    département: str = ""
    acteur: str = ""
    outil: str = ""

class EnrichTableRequest(BaseModel):
    rows: List[TableRowInput]

    class Config:
        schema_extra = {
            "example": {
                "rows": [
                    {
                        "id": "1",
                        "étape": "Préparer la requête pour la table TIERS_GARANTIES",
                        "typeBpmn": "Task",
                        "actions": "Initialiser le tableau associatif pArgsD pour stocker les données",
                        "département": "",
                        "acteur": "",
                        "outil": ""
                    }
                ]
            }
        }

SYSTEM_PROMPT = """
Tu es un expert en analyse de processus métier bancaires et assurance.

## 🎯 TA MISSION

Tu reçois un tableau de processus métier avec :
- ✅ **Étape** : Titre de l'étape (parfois technique, à améliorer)
- ✅ **Actions** : Détails de ce qui est fait
- ✅ **Type BPMN** : StartEvent, Task, ExclusiveGateway, EndEvent
- ❌ **Département** : VIDE (à remplir)
- ❌ **Acteur** : VIDE (à remplir)
- ❌ **Outil** : VIDE (à remplir)

Tu dois :
1. **Améliorer le titre de l'étape** (si trop technique ou vague)
2. **Déterminer le département responsable**
3. **Identifier l'acteur/rôle** qui exécute l'étape
4. **Reconnaître l'outil métier** utilisé

## 📋 DÉPARTEMENTS (choisis parmi cette liste UNIQUEMENT)

- **Commercial** : Vente, relation client, prospection, signature contrats, conseil client
- **Conformité** : KYC, vérification identité, contrôle réglementaire, lutte anti-blanchiment, analyse risques
- **Back Office** : Comptabilité, gestion des comptes, opérations bancaires, saisie données, traitement administratif
- **IT / Support technique** : Gestion des accès, création utilisateurs, configuration systèmes, support technique
- **Direction / Management** : Approbations exceptionnelles, décisions stratégiques, escalades, validations managériales
- **Front Office / Client** : Actions du client lui-même (portail web, app mobile, signature électronique)

## 👤 ACTEURS (exemples de rôles précis)

Selon le département :
- **Commercial** : Conseiller clientèle, Chargé de clientèle, Commercial, Gestionnaire de comptes, Agent d'accueil
- **Conformité** : Analyste KYC, Responsable conformité, Contrôleur risques, Auditeur
- **Back Office** : Gestionnaire opérations, Comptable, Assistant administratif, Opérateur de saisie
- **IT** : Administrateur système, Support technique, Développeur, Technicien informatique
- **Direction** : Responsable d'agence, Directeur, Manager, Superviseur
- **Client** : Client, Prospect, Souscripteur

## 🔧 OUTILS MÉTIER (détecte selon le contexte)

**Systèmes principaux :**
- **CRM** : Gestion relation client, fiches clients, historique interactions
- **Core Banking** : Système bancaire central, gestion comptes, opérations bancaires, génération IBAN/numéros
- **GED (Gestion Électronique de Documents)** : Archivage, numérisation, indexation documents
- **Scanner** : Numérisation de documents papier
- **Plateforme KYC** : Vérification identité, contrôle conformité, bases de données externes
- **API système** : Webservices, appels API internes, intégrations
- **Email / Email interne** : Notifications par email, communications internes
- **Application mobile** : App mobile client, banque en ligne mobile
- **Portail web / Portail client** : Site web client, espace personnel en ligne
- **Active Directory** : Gestion des utilisateurs et droits d'accès
- **Outil de signature électronique** : DocuSign, signature numérique
- **Tableur / Excel** : Traitement de données, exports, analyses
- **Système de gestion des garanties** : Spécifique aux garanties bancaires
- **Système de tarification** : Calcul de tarifs, grilles tarifaires

## 🧠 RÈGLES DE DÉTECTION

### Département

**Commercial** si l'étape mentionne :
- Vente, client, conseiller, rendez-vous, prospection, signature, conseil, relation client, accueil

**Conformité** si l'étape mentionne :
- KYC, vérification, authenticité, documents, conformité, contrôle, risque, validation réglementaire, AML

**Back Office** si l'étape mentionne :
- Comptabilité, compte, opération, saisie, traitement, enregistrement, gestion administrative, calcul

**IT** si l'étape mentionne :
- Système, utilisateur, accès, configuration, Active Directory, support technique, administration

**Direction** si l'étape mentionne :
- Approbation, validation managériale, décision exceptionnelle, escalade, accord direction

**Client** si l'étape mentionne :
- Le client fait lui-même l'action : "confirmer", "signer électroniquement", "se connecter", "télécharger"

### Acteur

Déduis le rôle précis selon :
- Le département identifié
- Le type d'action (conseil vs opération vs contrôle vs technique)
- Le niveau de responsabilité (opérateur vs responsable vs manager)

### Outil

Détecte l'outil selon les mots-clés dans "Étape" et "Actions" :
- **"CRM", "fiche client", "relation client"** → CRM
- **"compte", "IBAN", "bancaire", "Core Banking"** → Core Banking
- **"API", "système central", "webservice", "/newid", "POST"** → API système
- **"scanner", "numériser", "GED", "archiver"** → Scanner / GED
- **"KYC", "vérifier identité", "bases externes"** → Plateforme KYC
- **"email", "notifier", "envoyer"** → Email
- **"portail", "application mobile", "se connecter"** → Application mobile / Portail web
- **"Active Directory", "créer utilisateur", "droits"** → Active Directory
- **"signer électroniquement", "signature"** → Outil de signature électronique
- **"tarif", "commission", "calcul"** → Système de tarification
- **"garantie", "caution"** → Système de gestion des garanties

### Amélioration du titre d'étape

Si le titre est trop technique ou vague, reformule-le pour qu'il soit :
- ✅ **Métier** : compréhensible par un non-informaticien
- ✅ **Court** : 5-8 mots maximum
- ✅ **Actionnable** : commence par un verbe (Préparer, Vérifier, Envoyer, Créer, Valider, etc.)
- ✅ **Précis** : décrit clairement l'objectif

**Exemples de reformulation :**

| Titre original (trop technique) | ✅ Titre amélioré |
|---|---|
| "Préparer la requête pour la table TIERS_GARANTIES" | "Préparer les données de garantie" |
| "Appeler l'API du système central (POST /newid)" | "Générer le numéro de compte" |
| "Initialiser le tableau associatif pArgsD" | "Initialiser les paramètres" |
| "Horodater la création (DateHeureSys)" | "Horodater la création" |
| "Calculer la signature MD5 (fctCalculMD5)" | "Sécuriser la requête" |

## 📤 FORMAT DE SORTIE

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas d'explication) :

```json
{
  "enrichments": [
    {
      "id": "1",
      "étape_améliorée": "Préparer les données de garantie",
      "département": "Back Office",
      "acteur": "Gestionnaire opérations",
      "outil": "Core Banking"
    },
    {
      "id": "2",
      "étape_améliorée": "Générer le numéro de compte",
      "département": "IT",
      "acteur": "API système",
      "outil": "API système"
    }
  ]
}
```

## ⚠️ RÈGLES CRITIQUES

1. **UN enrichissement par ligne du tableau** (même ID)
2. **Choisis TOUJOURS un département parmi la liste**
3. **Acteur cohérent avec le département**
4. **Outil basé sur les mots-clés détectés** (ne jamais laisser vide)
5. **Améliore le titre seulement si trop technique** (sinon garde l'original)
6. **Retourne UNIQUEMENT le JSON**, sans ```json, sans texte avant/après

## 🔍 CHECKLIST

✅ J'ai analysé chaque ligne du tableau ?
✅ Département choisi parmi la liste officielle ?
✅ Acteur cohérent avec le département ?
✅ Outil détecté via mots-clés ?
✅ Titre d'étape amélioré si trop technique ?
✅ Un seul JSON sans markdown ?
"""

class BPMNAIEnricher:
    """Enrichisseur IA pour les tableaux BPMN"""
    
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("La clé API Gemini est requise")
        
        genai.configure(api_key=api_key)
        
        self.model = genai.GenerativeModel(
            model_name='gemini-2.0-flash',
            generation_config={
                'temperature': 0.1,  # ✅ Très bas pour cohérence maximale
                'top_p': 0.8,
                'top_k': 20,
                'max_output_tokens': 8192,
            }
        )
    
    def enrich_table(self, rows: List[dict]) -> dict:
        """
        Enrichit les lignes du tableau avec département/acteur/outil
        
        Args:
            rows: Liste des lignes du tableau
        
        Returns:
            dict contenant les enrichissements
        """
        # Construire le tableau pour l'IA
        table_text = "# TABLEAU DU PROCESSUS MÉTIER\n\n"
        for row in rows:
            table_text += f"""
## Ligne {row['id']}
- **Étape** : {row['étape']}
- **Type BPMN** : {row['typeBpmn']}
- **Actions** : {row.get('actions', 'N/A')}
- **Département** : {row.get('département', '(vide - à remplir)')}
- **Acteur** : {row.get('acteur', '(vide - à remplir)')}
- **Outil** : {row.get('outil', '(vide - à remplir)')}

"""
        
        user_prompt = f"""
Analyse ce tableau de processus métier et enrichis CHAQUE ligne.

{table_text}

Pour CHAQUE ligne, détermine :
1. **Un titre d'étape amélioré** (si le titre actuel est trop technique)
2. **Le département** responsable (parmi la liste du système)
3. **L'acteur/rôle** qui exécute l'étape
4. **L'outil métier** utilisé

Base-toi sur les colonnes "Étape" et "Actions" pour identifier le contexte.

Génère maintenant le JSON avec les enrichissements.
"""
        
        try:
            response = self.model.generate_content([SYSTEM_PROMPT, user_prompt])
            result_text = response.text.strip()
            
            # Nettoyer le markdown
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()
            
            # Parser le JSON
            enrichments = json.loads(result_text)
            
            # Valider la structure
            if "enrichments" not in enrichments or not isinstance(enrichments["enrichments"], list):
                raise ValueError("Format de réponse invalide : clé 'enrichments' manquante ou invalide")
            
            return enrichments
            
        except json.JSONDecodeError as e:
            # Extraire la partie valide du JSON si possible
            try:
                # Tentative de récupération partielle
                partial_json = result_text[:result_text.rfind('}') + 1]
                if partial_json.endswith(']'):
                    partial_json += '}'
                enrichments = json.loads(partial_json)
                return enrichments
            except:
                raise Exception(f"Erreur de parsing JSON : {str(e)}\nRéponse : {result_text[:500]}")
        except Exception as e:
            raise Exception(f"Erreur lors de l'enrichissement IA : {str(e)}")


@router.post("/enrich-table")
async def enrich_table(request: EnrichTableRequest = Body(...)):
    """
    Enrichit un tableau BPMN avec département/acteur/outil
    
    Args:
        request: Objet contenant les lignes du tableau
    
    Returns:
        JSON avec les enrichissements pour chaque ligne
    
    Example:
        ```json
        {
            "rows": [
                {
                    "id": "1",
                    "étape": "Préparer la requête",
                    "typeBpmn": "Task",
                    "actions": "Initialiser les données",
                    "département": "",
                    "acteur": "",
                    "outil": ""
                }
            ]
        }
        ```
    """
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY non configurée"
        )
    
    if not request.rows or len(request.rows) == 0:
        raise HTTPException(
            status_code=422,
            detail="Le tableau ne peut pas être vide"
        )
    
    try:
        enricher = BPMNAIEnricher(GEMINI_API_KEY)
        
        # Convertir en dict pour l'IA
        rows_dict = [row.dict() for row in request.rows]
        
        enrichments = enricher.enrich_table(rows_dict)
        
        return JSONResponse(content={
            "success": True,
            "enrichments": enrichments["enrichments"],
            "message": f"✅ {len(enrichments['enrichments'])} lignes enrichies avec succès"
        })
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'enrichissement : {str(e)}"
        )


@router.get("/info")
async def bpmn_ai_info():
    """Informations sur le module d'enrichissement IA"""
    return {
        "module": "BPMN AI Enricher v3.0 - Enrichissement sur demande",
        "description": "Enrichit les tableaux BPMN existants avec département/acteur/outil",
        "ai_model": "Google Gemini 2.0 Flash",
        "capabilities": [
            "🏢 Détection automatique des départements",
            "👤 Identification des acteurs/rôles",
            "🔧 Reconnaissance des outils métier",
            "✨ Amélioration des titres d'étapes",
            "🎯 Enrichissement contextuel basé sur étape + actions"
        ],
        "departments": [
            "Commercial",
            "Conformité",
            "Back Office",
            "IT / Support technique",
            "Direction / Management",
            "Front Office / Client"
        ],
        "tools_detected": [
            "CRM",
            "Core Banking",
            "GED",
            "Scanner",
            "Plateforme KYC",
            "API système",
            "Email",
            "Application mobile",
            "Portail web",
            "Active Directory",
            "Outil de signature électronique",
            "Système de tarification",
            "Système de gestion des garanties"
        ],
        "api_key_required": bool(GEMINI_API_KEY),
        "endpoint": "/enrich-table"
    }