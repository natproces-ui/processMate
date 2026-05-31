"""
Router STT (Speech-To-Text) pour ProcessMate
- Transcription audio → texte via Gemini
- Parsing du texte → Table1Row[] enrichi
- Support du workflow BPMN complet
"""

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from google import genai
from google.api_core.exceptions import ResourceExhausted
import logging
from typing import List, Dict, Any, Optional
import os
from config import GOOGLE_API_KEY

logger = logging.getLogger(__name__)

# Configurer Gemini
client = genai.Client(api_key=GOOGLE_API_KEY)

router = APIRouter(prefix="/api/stt", tags=["Speech-To-Text"])


async def transcribe_audio(audio_bytes: bytes, mime_type: str) -> str:
    """
    Transcrit un fichier audio en texte via Gemini.
    
    Args:
        audio_bytes: Contenu binaire du fichier audio
        mime_type: Type MIME (audio/webm, audio/mp3, etc.)
    
    Returns:
        Texte transcrit
    
    Raises:
        ValueError: Si transcription invalide ou quota dépassé
    """
    try:
        result = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[
                {"inline_data": {"mime_type": mime_type, "data": audio_bytes}},
                "Transcris ce fichier audio en texte clair, en corrigeant les fautes d'orthographe."
            ]
        )
        
        if not result or not result.text:
            raise ValueError("Gemini n'a pas retourné de transcription")
        
        transcription = result.text.strip()
        
        # ✅ Bloquer les réponses vides/génériques de Gemini
        invalid_responses = [
            "il n'y a pas d'audio à transcrire",
            "il n'y a pas d'audio à transcrire.",
            "[musique]",
            "[silence]",
            "silence",
            ""
        ]
        
        if transcription.lower() in invalid_responses:
            raise ValueError(
                "❌ Aucun contenu vocal détecté dans l'enregistrement. "
                "Vérifiez que votre micro fonctionne et parlez clairement."
            )
        
        # ✅ Vérifier longueur minimale (un processus réel = 50+ caractères minimum)
        if len(transcription.strip()) < 50:
            raise ValueError(
                f"❌ Transcription trop courte ({len(transcription)} caractères). "
                "Décrivez un processus complet avec plusieurs étapes et acteurs."
            )
        
        return transcription
    
    except ResourceExhausted as e:
        logger.error(f"❌ Quota Gemini dépassé: {str(e)}")
        retry_delay = getattr(e, 'retry_delay', None)
        if retry_delay:
            wait_seconds = retry_delay.seconds
            raise ValueError(
                f"⏱️ Quota Gemini dépassé. Réessayez dans {wait_seconds} secondes. "
                f"Ou modifiez stt.py ligne 18 pour utiliser un autre modèle."
            )
        raise ValueError(
            "⏱️ Quota Gemini dépassé (20 requêtes/jour avec gemini-2.5-flash-lite). "
            "Attendez ou passez à un modèle payant."
        )
    
    except ValueError:
        raise
    
    except Exception as e:
        logger.error(f"❌ Erreur transcription audio: {str(e)}")
        raise


async def parse_workflow_from_text(transcription: str) -> List[Dict[str, Any]]:
    """
    Parse un texte transcrit pour en extraire les étapes du processus.
    Utilise Gemini pour une analyse intelligente et structurée.
    
    Args:
        transcription: Texte transcrit du fichier audio
    
    Returns:
        Liste d'étapes formatées en Table1Row compatible
    
    Raises:
        ValueError: Si parsing échoue ou quota dépassé
    """
    try:
        prompt = f"""
Tu es un expert en modélisation de processus BPMN. 
Analyse ce texte qui décrit un processus et extrais les étapes structurées.

TEXTE À ANALYSER:
{transcription}

INSTRUCTIONS:
1. Identifie TOUTES les étapes/tâches du processus décrit
2. Pour chaque étape, détermine:
   - typeBpmn: StartEvent, Task, ExclusiveGateway, ou EndEvent
   - étape: Description courte et claire de l'action
   - acteur: Rôle/personne responsable
   - département: Département ou service
   - condition: La question posée si c'est une gateway (sinon vide)
   - outil: Outil/système utilisé (sinon vide)
3. Génère des IDs numériques croissants (1, 2, 3...)
4. Pour les gateways, propose outputOui et outputNon basés sur le flux logique

RETOURNE UN JSON VALIDE (et SEULEMENT le JSON, sans autres textes):
{{
  "success": true,
  "rows": [
    {{
      "id": "1",
      "étape": "Description de l'étape",
      "typeBpmn": "StartEvent|Task|ExclusiveGateway|EndEvent",
      "département": "Nom du département",
      "acteur": "Nom du rôle/acteur",
      "condition": "Question si gateway, sinon vide",
      "outputOui": "ID de la prochaine étape si oui",
      "outputNon": "ID de la prochaine étape si non (pour gateways)",
      "outil": "Outil utilisé ou vide"
    }}
  ],
  "metadata": {{
    "totalSteps": 0,
    "hasBranches": false,
    "warnings": []
  }}
}}

RÈGLES IMPORTANTES:
- Commence TOUJOURS par un StartEvent (typeBpmn: "StartEvent")
- Termine TOUJOURS par un EndEvent (typeBpmn: "EndEvent")
- Les gateways doivent avoir une condition clairement formulée
- Les outputOui/outputNon doivent être des IDs valides qui existent dans le tableau
- Ne pas inventer d'étapes, seulement ce qui est décrit dans le texte
- Les acteurs doivent être spécifiques (pas "personnel", mais "Chef d'équipe")
"""
        
        result = client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)
        
        if not result or not result.text:
            raise ValueError("Gemini n'a pas retourné de parsing")
        
        # Parse la réponse JSON
        import json
        
        # Nettoyer la réponse (enlever markdown code blocks si présent)
        response_text = result.text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        parsed = json.loads(response_text)
        
        if not parsed.get("success"):
            raise ValueError(
                "Le texte ne décrit pas un processus exploitable. "
                "Décrivez clairement les étapes d'un processus avec acteurs et actions."
            )
        
        return parsed.get("rows", [])
    
    except ResourceExhausted as e:
        logger.error(f"❌ Quota Gemini dépassé lors du parsing")
        raise ValueError(
            "⏱️ Quota Gemini dépassé. "
            "Modifiez stt.py ligne 18 pour utiliser un autre modèle avec plus de quota."
        )
    
    except json.JSONDecodeError as e:
        logger.error(f"❌ Erreur JSON parsing: {str(e)}\nRéponse: {result.text[:500]}")
        raise ValueError(
            "Erreur lors de l'analyse du processus. "
            "Le texte ne semble pas décrire un processus clair."
        )
    
    except ValueError:
        raise
    
    except Exception as e:
        logger.error(f"❌ Erreur parse_workflow_from_text: {str(e)}")
        raise ValueError(f"Erreur lors du parsing: {str(e)}")


def validate_rows(rows: List[Dict[str, Any]]) -> tuple[bool, List[str]]:
    """
    Valide la cohérence des étapes extraites.
    
    Returns:
        (is_valid, list_of_warnings)
    """
    warnings = []
    
    if not rows:
        warnings.append("Aucune étape extraite")
        return False, warnings
    
    # Vérifier qu'il y a un StartEvent et un EndEvent
    types = [r.get("typeBpmn") for r in rows]
    if "StartEvent" not in types:
        warnings.append("⚠️ Pas de StartEvent détecté")
    if "EndEvent" not in types:
        warnings.append("⚠️ Pas de EndEvent détecté")
    
    # Vérifier les IDs
    ids = set([r.get("id") for r in rows])
    for row in rows:
        if row.get("outputOui") and row.get("outputOui") not in ids and row.get("typeBpmn") != "EndEvent":
            warnings.append(f"⚠️ Étape '{row.get('id')}': outputOui '{row.get('outputOui')}' n'existe pas")
        if row.get("outputNon") and row.get("outputNon") not in ids:
            warnings.append(f"⚠️ Étape '{row.get('id')}': outputNon '{row.get('outputNon')}' n'existe pas")
    
    return len(warnings) == 0, warnings


@router.post("/transcribe")
async def transcribe_and_parse(file: UploadFile = File(...)):
    """
    Endpoint principal STT:
    1. Reçoit un fichier audio
    2. Transcrit via Gemini
    3. Parse le texte en étapes du processus
    4. Retourne Table1Row[] enrichi
    
    Formats acceptés: WebM, MP3, MP4, WAV, OGG, FLAC, Opus
    Taille max: ~25MB
    """
    
    if not file.content_type or "audio" not in file.content_type:
        raise HTTPException(
            status_code=400,
            detail=f"Format non accepté: {file.content_type}. Envoyez un fichier audio."
        )
    
    try:
        logger.info(f"📝 Transcription audio: {file.filename} ({file.content_type})")
        
        # Lire le fichier audio
        audio_bytes = await file.read()
        
        if not audio_bytes or len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Fichier audio vide")
        
        logger.info(f"📦 Taille fichier audio: {len(audio_bytes)} bytes")
        
        # Transcription
        logger.info("🎙️ Transcription en cours...")
        transcription = await transcribe_audio(audio_bytes, file.content_type)
        
        logger.info(f"✅ Transcription OK ({len(transcription)} caractères)")
        logger.info(f"📄 Contenu: {transcription[:200]}...")
        
        # Parsing du texte en étapes
        logger.info("🔍 Parsing du processus...")
        rows = await parse_workflow_from_text(transcription)
        
        # Validation
        is_valid, warnings = validate_rows(rows)
        
        logger.info(f"✅ Parsing OK ({len(rows)} étapes)")
        if warnings:
            logger.warning(f"⚠️ Avertissements: {warnings}")
        
        # ✅ AJOUTÉ : Afficher les étapes extraites dans les logs
        logger.info("📋 Étapes extraites:")
        for i, row in enumerate(rows, 1):
            logger.info(f"  {i}. [{row.get('typeBpmn', 'N/A')}] {row.get('étape', 'N/A')} - {row.get('acteur', 'N/A')}")
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "transcription": transcription,
                "parsedData": rows,
                "metadata": {
                    "totalSteps": len(rows),
                    "warnings": warnings,
                    "isValid": is_valid
                }
            }
        )
    
    except ValueError as e:
        logger.error(f"❌ Erreur de validation: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"❌ Erreur endpoint transcribe: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la transcription: {str(e)}"
        )
    finally:
        await file.close()


@router.get("/info")
async def get_stt_info():
    """Informations sur le module STT"""
    return {
        "status": "✅ Actif",
        "description": "Speech-To-Text: Transcription audio → Table1Row[]",
        "features": [
            "✅ Transcription audio en temps réel via Gemini",
            "✅ Parsing intelligent du texte en étapes BPMN",
            "✅ Détection automatique des types BPMN",
            "✅ Identification des acteurs et départements",
            "✅ Support des gateways et branchements",
            "✅ Validation de la cohérence des flux",
            "✅ Gestion des erreurs de quota",
            "✅ Validation robuste des transcriptions",
            "✅ Logs détaillés des étapes extraites"
        ],
        "formats_supported": [
            "WebM",
            "MP3",
            "MP4",
            "WAV",
            "OGG",
            "FLAC",
            "Opus"
        ],
        "endpoints": {
            "transcribe": {
                "method": "POST",
                "path": "/api/stt/transcribe",
                "description": "Upload audio → Retourne Table1Row[] enrichi",
                "input": "Audio file (multipart/form-data)",
                "output": {
                    "success": "boolean",
                    "transcription": "string (texte transcrit)",
                    "parsedData": "Table1Row[]",
                    "metadata": {
                        "totalSteps": "int",
                        "warnings": "string[]",
                        "isValid": "boolean"
                    }
                }
            },
            "info": {
                "method": "GET",
                "path": "/api/stt/info",
                "description": "Informations sur le module STT"
            }
        },
        "ai_model": "Gemini 2.5 Flash Lite",
        "quota": "1000 requêtes/jour (gratuit)",
        "version": "1.0.2"
    }