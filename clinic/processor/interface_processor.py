
"""
Processeur de détection des interfaces applicatives
VERSION 2 : Déduplication par application cible
"""

import json
import re
import logging
import asyncio
from typing import Dict, List, Any

from manager.model_manager import GeminiModelManager
from prompts.interface_prompt import get_interface_detection_prompt

import os

logger = logging.getLogger(__name__)


class InterfaceProcessor:

    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY non configurée")
        self.model_manager = GeminiModelManager(api_key)
        self.timeout = 90

    # ─────────────────────────────────────────────
    # MÉTHODE PRINCIPALE
    # ─────────────────────────────────────────────

    async def detect_interfaces(self, workflow: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Détecte les interfaces applicatives — une interface par système unique.

        Entrée  : workflow Table1Row[] complet
        Sortie  : interfaces dédupliquées par application_cible + résumé
        """
        if not workflow or len(workflow) == 0:
            raise ValueError("Le workflow est vide")

        logger.info(f"🔍 Détection interfaces sur {len(workflow)} étapes")

        prompt = get_interface_detection_prompt(workflow)

        async def _detect_task(model_name: str):
            logger.info(f"🤖 Appel Gemini ({model_name})")
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=[prompt]),
                timeout=self.timeout
            )
            return response

        result = await self.model_manager.execute_with_fallback(
            _detect_task,
            task_name="Détection interfaces applicatives"
        )

        if not result["success"]:
            raise ValueError(result["message"])

        response = result["result"]
        logger.info(f"✓ Réponse reçue ({len(response.text)} caractères)")

        parsed = self._parse_response(response.text)
        validated = self._validate_and_deduplicate(parsed.get("interfaces", []))
        resume = self._build_resume(validated, workflow)

        taches_analysees = sum(
            1 for r in workflow
            if r.get("typeBpmn") in ("Task", "ExclusiveGateway")
        )

        logger.info(
            f"✅ {len(validated)} interface(s) unique(s) — "
            f"Confirmées: {resume['confirmees']}, "
            f"Suggérées: {resume['suggerees']}, "
            f"Incertaines: {resume['incertaines']}"
        )

        return {
            "interfaces": validated,
            "resume": resume,
            "metadata": {
                "model_used": result["model_used"],
                "attempts": result["attempts"],
                "taches_analysees": taches_analysees,
                "total_etapes_workflow": len(workflow)
            }
        }

    # ─────────────────────────────────────────────
    # PARSING
    # ─────────────────────────────────────────────

    def _parse_response(self, text: str) -> Dict[str, Any]:
        try:
            text = text.strip()
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                text = json_match.group(0)
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            data = json.loads(text)
            if "interfaces" not in data:
                raise ValueError("Clé 'interfaces' manquante")
            return data
        except json.JSONDecodeError as e:
            logger.error(f"❌ Parsing JSON: {str(e)}\n{text[:500]}")
            raise ValueError(f"Réponse non-JSON: {str(e)}")

    # ─────────────────────────────────────────────
    # VALIDATION + DÉDUPLICATION
    # ─────────────────────────────────────────────

    VALID_TYPE_DEV = {"Développement Interne", "Développement Externe", "Progiciel", "Inconnu"}
    VALID_TYPE_FLUX = {"API REST", "Webservice", "Flux fichier", "Lecture/Écriture BDD", "Email", "Inconnu"}
    VALID_SENS = {"Sortant", "Entrant", "Bidirectionnel", "Inconnu"}
    VALID_OUI_NON = {"Oui", "Non", "Inconnu"}
    VALID_CONFIANCE = {"Confirmée", "Suggérée", "Incertaine"}

    def _validate_and_deduplicate(self, interfaces: List[Dict]) -> List[Dict]:
        """
        Valide chaque interface ET déduplique par application_cible.
        Si Gemini a quand même créé des doublons malgré le prompt,
        on les fusionne ici côté Python comme filet de sécurité.
        """
        # ── Étape 1 : Valider chaque interface ──
        validated = []
        for idx, iface in enumerate(interfaces):
            try:
                normalized = self._normalize_interface(iface, idx)
                if normalized:
                    validated.append(normalized)
            except Exception as e:
                logger.warning(f"⚠️ Interface idx={idx} invalide: {str(e)}")
                continue

        # ── Étape 2 : Déduplication Python (filet de sécurité) ──
        deduplicated = self._deduplicate(validated)

        logger.info(
            f"✅ {len(validated)} validées → "
            f"{len(deduplicated)} après déduplication"
        )
        return deduplicated

    def _normalize_interface(self, iface: Dict, idx: int) -> Dict:
        """Normalise une interface et vérifie les champs obligatoires"""

        application_cible = str(iface.get("application_cible", "À identifier")).strip()
        if not application_cible:
            application_cible = "À identifier"

        # taches_liees : liste de {id_tache, nom_etape}
        taches_liees = iface.get("taches_liees", [])
        if not isinstance(taches_liees, list):
            taches_liees = []

        taches_normalisees = []
        for t in taches_liees:
            if isinstance(t, dict) and t.get("id_tache"):
                taches_normalisees.append({
                    "id_tache": str(t.get("id_tache", "")),
                    "nom_etape": str(t.get("nom_etape", "")).strip()
                })

        # On ignore les interfaces sans aucune tâche liée
        if not taches_normalisees:
            logger.warning(f"⚠️ Interface '{application_cible}' sans tâches liées — ignorée")
            return None

        return {
            "id_interface": str(iface.get("id_interface", f"INT-{idx+1:03d}")),
            "application_cible": application_cible,
            "taches_liees": taches_normalisees,
            "description_fonctionnelle": str(iface.get("description_fonctionnelle", "")).strip(),
            "type_developpement": self._validate_enum(
                iface.get("type_developpement"), self.VALID_TYPE_DEV, "Inconnu"
            ),
            "type_flux": self._validate_enum(
                iface.get("type_flux"), self.VALID_TYPE_FLUX, "Inconnu"
            ),
            "sens_flux": self._validate_enum(
                iface.get("sens_flux"), self.VALID_SENS, "Inconnu"
            ),
            "flux_intra_module": self._validate_enum(
                iface.get("flux_intra_module"), self.VALID_OUI_NON, "Inconnu"
            ),
            "flux_vers_CBS": self._validate_enum(
                iface.get("flux_vers_CBS"), self.VALID_OUI_NON, "Inconnu"
            ),
            "interface_jetable": self._validate_enum(
                iface.get("interface_jetable"), self.VALID_OUI_NON, "Inconnu"
            ),
            "niveau_confiance": self._validate_enum(
                iface.get("niveau_confiance"), self.VALID_CONFIANCE, "Incertaine"
            ),
            "champs_a_completer": iface.get("champs_a_completer", [])
            if isinstance(iface.get("champs_a_completer"), list) else []
        }

    def _deduplicate(self, interfaces: List[Dict]) -> List[Dict]:
        """
        Fusionne les interfaces qui ont la même application_cible.
        Filet de sécurité côté Python si Gemini duplique quand même.
        """
        seen: Dict[str, Dict] = {}

        for iface in interfaces:
            key = iface["application_cible"].strip().lower()

            if key not in seen:
                seen[key] = iface
            else:
                # Fusion : on ajoute les tâches manquantes
                existing = seen[key]
                existing_ids = {t["id_tache"] for t in existing["taches_liees"]}

                for tache in iface["taches_liees"]:
                    if tache["id_tache"] not in existing_ids:
                        existing["taches_liees"].append(tache)
                        existing_ids.add(tache["id_tache"])

                # On garde le niveau de confiance le plus élevé
                confiance_rank = {"Confirmée": 3, "Suggérée": 2, "Incertaine": 1}
                if confiance_rank.get(iface["niveau_confiance"], 0) > \
                   confiance_rank.get(existing["niveau_confiance"], 0):
                    existing["niveau_confiance"] = iface["niveau_confiance"]

                # On fusionne les champs à compléter sans doublon
                champs = set(existing["champs_a_completer"]) | set(iface["champs_a_completer"])
                existing["champs_a_completer"] = list(champs)

                logger.info(
                    f"🔄 Fusion: '{iface['application_cible']}' "
                    f"→ {len(existing['taches_liees'])} tâches liées"
                )

        # Réindexation propre des IDs après déduplication
        result = list(seen.values())
        for i, iface in enumerate(result):
            iface["id_interface"] = f"INT-{i+1:03d}"

        return result

    def _validate_enum(self, value: Any, valid_set: set, fallback: str) -> str:
        if value and str(value) in valid_set:
            return str(value)
        return fallback

    # ─────────────────────────────────────────────
    # RÉSUMÉ
    # ─────────────────────────────────────────────

    def _build_resume(self, interfaces: List[Dict], workflow: List[Dict]) -> Dict[str, Any]:

        # Toutes les tâches référencées dans des interfaces
        taches_avec_interface = set()
        for iface in interfaces:
            for t in iface["taches_liees"]:
                taches_avec_interface.add(t["id_tache"])

        taches_analysables = [
            r.get("id") for r in workflow
            if r.get("typeBpmn") in ("Task", "ExclusiveGateway")
        ]

        taches_sans_interface = [
            tid for tid in taches_analysables
            if tid not in taches_avec_interface
        ]

        systemes = [i["application_cible"] for i in interfaces]

        return {
            "total_interfaces": len(interfaces),
            "confirmees": sum(1 for i in interfaces if i["niveau_confiance"] == "Confirmée"),
            "suggerees": sum(1 for i in interfaces if i["niveau_confiance"] == "Suggérée"),
            "incertaines": sum(1 for i in interfaces if i["niveau_confiance"] == "Incertaine"),
            "systemes_identifies": systemes,
            "taches_avec_interface": list(taches_avec_interface),
            "taches_sans_interface": taches_sans_interface
        }