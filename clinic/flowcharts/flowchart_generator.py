# ============================================================================
# FILE 1: flowchart_generator.py
# ============================================================================

"""
Générateur de flowcharts métier enrichis à partir d'AST JSON
Utilise Google Gemini pour l'interprétation métier intelligente
"""

import google.generativeai as genai
import json
from graphviz import Source
from pathlib import Path
import tempfile
from typing import Dict, Tuple, Optional
import os

class FlowchartGenerator:
    """Générateur de flowcharts métier avec Gemini"""
    
    SYSTEM_PROMPT = """
Tu es un expert en analyse de code métier et en création de flowcharts PROFESSIONNELS avec des ACTIONS MÉTIER DÉTAILLÉES.

## TA MISSION PRINCIPALE
Créer un flowchart où CHAQUE NŒUD décrit une ACTION MÉTIER CONCRÈTE et COMPRÉHENSIBLE.
**INTERDICTION ABSOLUE** de créer des nœuds qui listent simplement des champs !

## RÈGLE D'OR : ACTIONS MÉTIER, PAS DE LISTES DE CHAMPS

❌ **MAUVAIS EXEMPLE** (ce que tu dois ÉVITER) :
```dot
prep [label="Informations de la Requête\\n\\n• Date User\\n• Last User\\n• idfieldname\\n• Signature MD5\\n• Code Établissement\\n• Table cible"];
```

✅ **BON EXEMPLE** (ce que tu dois FAIRE) :
```dot
prep [label="Préparer et sécuriser la requête API\\n\\n• Horodater la création (Date et heure)\\n• Identifier le créateur (utilisateur actuel)\\n• Calculer la signature unique MD5\\n• Associer à l'établissement d'origine\\n• Cibler la table TIERS_PRODUITCOMPTE", fillcolor="#87CEEB"];
```

## RÈGLES CRITIQUES D'INTERPRÉTATION MÉTIER

### 1. DÉCRIS LES ACTIONS, PAS LES DONNÉES

Pour chaque groupe d'assignations, demande-toi : **"Quel est le BUT MÉTIER ?"**

❌ **NE DIS PAS** : "Informations de la Requête : Date User, Last User, idfieldname, MD5, etc."

✅ **DIS** : "Préparer et sécuriser la requête de création de compte : horodater avec date/heure système, identifier le créateur (email), calculer la signature MD5 pour sécuriser, cibler l'établissement et la table TIERS_PRODUITCOMPTE"

### 2. INTERPRÉTATION DES FONCTIONS - TOUJOURS EXPLIQUER LE "POURQUOI"

**Fonctions de sécurité** :
- `fctCalculMD5(data)` → "Calculer la signature MD5 pour sécuriser la requête contre les modifications"
- Ne dis JAMAIS juste "MD5" → dis "Signer cryptographiquement les données (MD5)"

**Fonctions de date/temps** :
- `DateSys()` → "Récupérer la date du jour"
- `DateHeureSys()` → "Horodater avec date et heure actuelles"
- `DateVersChaîne(x)` → "Formatter la date pour l'enregistrement"

**Fonctions bancaires** :
- `fctIBAN(pays, banque, agence, numero)` → "Calculer l'IBAN international selon la norme SEPA (Pays + Banque + Agence + Numéro + Clé)"
- Ne dis JAMAIS juste "fctIBAN" → dis "Générer l'IBAN normalisé SEPA"

**Fonctions API** :
- `_apiRequest(url, "/newid", data)` → "Envoyer une requête API POST au système central pour générer un numéro de compte unique"
- Ne dis JAMAIS juste "Appel API" → dis "Interroger l'API du système central via POST /newid pour obtenir un numéro séquentiel unique"

**Fonctions métier** :
- `_SaveCompte(numero, iban)` → "Enregistrer le compte en base de données avec son numéro et son IBAN"
- `_SouscriptionCompteTitulaire(...)` → "Créer le lien Tiers-Compte dans la table de liaison (TIERS_PRODUITCOMPTE_LIEN)"
- `_eve_Tiers(...)` → "Tracer l'événement 'Ouverture de compte' dans l'historique client (table TIERS_EVE)"
- `_IntituleCompte(code, chapitre, produit)` → "Construire l'intitulé formaté du compte selon le code et le produit"

**Dialogues** :
- `Dialogue(msg, btns, dlgIcôneErreur)` → "Afficher une boîte de dialogue d'erreur à l'utilisateur avec le message d'échec"

### 3. GROUPER LES ASSIGNATIONS PAR OBJECTIF MÉTIER

Quand tu vois plusieurs assignations consécutives (5+), identifie le BUT COMMUN et crée UN SEUL nœud descriptif.

### 4. APPELS API - SOIS ULTRA-PRÉCIS

Quand tu vois `_apiRequest(url, endpoint, data)` :

❌ **NE DIS JAMAIS** : "Envoyer la demande au système central"

✅ **DIS TOUJOURS** : "Appeler l'API du système central (POST /newid) pour générer un numéro de compte séquentiel unique en transmettant les données sécurisées par signature MD5"

### 5. PALETTE DE COULEURS

```dot
#2E8B57  -> Début/Fin (vert foncé)
#87CEEB  -> Étapes normales (bleu ciel)
#FFD700  -> Décisions (jaune)
#FFB6C1  -> Erreurs (rose)
#90EE90  -> Succès (vert clair)
#DDA0DD  -> Boucles/API (violet)
```

### 6. STRUCTURE TYPE DE FLOWCHART

```dot
digraph NomProcedure {
    rankdir=TB;
    splines=ortho;
    nodesep=0.8;
    ranksep=1.0;
    node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=10];
    edge [fontname="Helvetica", fontsize=9];
    
    start [label="DÉBUT\\nNom de la procédure", shape=circle, fillcolor="#2E8B57", fontcolor="white"];
    
    // Vos nœuds ici avec actions métier détaillées
    
    end_ok [label="FIN\\nSuccès", shape=circle, fillcolor="#2E8B57", fontcolor="white"];
}
```

## CHECKLIST AVANT DE GÉNÉRER

✅ Chaque nœud décrit une ACTION, pas une liste de champs ?
✅ Les fonctions sont interprétées (MD5 = signature, API = appel système, etc.) ?
✅ Les appels API mentionnent l'endpoint et le but métier ?
✅ Les décisions expliquent CE QUI est vérifié ?
✅ Les erreurs décrivent CE QUI se passe en cas d'échec ?
✅ Les boucles expliquent POURQUOI on itère ?
✅ Pas de termes techniques bruts (cluster_, subgraph visible, etc.) ?

## FORMAT DE SORTIE

Réponds UNIQUEMENT avec le code Graphviz complet.
- Commence par `digraph`
- Termine par `}`
- Aucune explication
- Aucun markdown
- Labels riches en actions métier
"""

    def __init__(self, api_key: str):
        """
        Initialise le générateur avec la clé API Gemini
        
        Args:
            api_key: Clé API Google Gemini
        """
        if not api_key:
            raise ValueError("La clé API Gemini est requise")
        
        genai.configure(api_key=api_key)
        
        self.model = genai.GenerativeModel(
            model_name='gemini-2.0-flash',
            generation_config={
                'temperature': 0.3,
                'top_p': 0.9,
                'top_k': 40,
                'max_output_tokens': 8192,
            }
        )
    
    def generate_flowchart(
        self, 
        json_data: Dict,
        output_format: str = "png"
    ) -> Tuple[str, Optional[bytes], str]:
        """
        Génère un flowchart à partir d'un AST JSON
        
        Args:
            json_data: Dictionnaire contenant l'AST
            output_format: Format de sortie ("png", "svg", "pdf")
        
        Returns:
            Tuple (graphviz_code, image_bytes, format)
        
        Raises:
            ValueError: Si le JSON est invalide
            Exception: Si la génération échoue
        """
        # Validation du JSON
        if not json_data or "ast" not in json_data:
            raise ValueError("JSON invalide : 'ast' manquant")
        
        # Création du prompt utilisateur
        user_prompt = f"""
Analyse ce JSON et génère un flowchart Graphviz ENRICHI selon les règles.

RAPPELS CRITIQUES :
- CHAQUE nœud = ACTION MÉTIER détaillée
- INTERDICTION de lister des champs sans contexte
- Interpréter toutes les fonctions (MD5, API, IBAN, etc.)
- Expliquer le BUT de chaque groupe d'assignations
- Mentionner les tables, endpoints API, normes (SEPA, etc.)

JSON à analyser :

```json
{json.dumps(json_data, ensure_ascii=False, indent=2)}
```

Génère maintenant le flowchart Graphviz complet avec actions métier détaillées.
"""
        
        # Génération avec Gemini
        try:
            response = self.model.generate_content([self.SYSTEM_PROMPT, user_prompt])
            graphviz_code = self._clean_graphviz_code(response.text)
        except Exception as e:
            raise Exception(f"Erreur lors de la génération avec Gemini : {str(e)}")
        
        # Compilation du flowchart
        try:
            graph = Source(graphviz_code)
            
            # Rendu en format demandé
            if output_format.lower() in ["png", "svg", "pdf"]:
                with tempfile.NamedTemporaryFile(delete=False, suffix=f".{output_format}") as tmp_file:
                    tmp_path = tmp_file.name
                
                graph.render(tmp_path.replace(f".{output_format}", ""), 
                           format=output_format, cleanup=True)
                
                with open(tmp_path, "rb") as f:
                    image_bytes = f.read()
                
                # Nettoyage
                os.unlink(tmp_path)
                
                return graphviz_code, image_bytes, output_format
            else:
                raise ValueError(f"Format non supporté : {output_format}")
                
        except Exception as e:
            raise Exception(f"Erreur lors de la compilation Graphviz : {str(e)}")
    
    def _clean_graphviz_code(self, raw_code: str) -> str:
        """
        Nettoie le code Graphviz généré par Gemini
        
        Args:
            raw_code: Code brut retourné par Gemini
        
        Returns:
            Code Graphviz nettoyé
        """
        code = raw_code.strip()
        
        # Retirer les balises markdown si présentes
        if "```" in code:
            lines = code.split("\n")
            start_idx = 0
            for i, line in enumerate(lines):
                if line.strip().startswith("digraph"):
                    start_idx = i
                    break
            
            end_idx = len(lines) - 1
            for i in range(len(lines) - 1, -1, -1):
                if lines[i].strip() == "}":
                    end_idx = i
                    break
            
            code = "\n".join(lines[start_idx:end_idx+1])
        
        return code


