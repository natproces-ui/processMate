"""
bpmn_from_document.py
Endpoint FastAPI : reçoit un PDF ou une image, génère directement un BPMN XML
valide via Gemini, style HOPEX swimlanes verticales colorées.
"""

import re
import base64
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# EXEMPLE DE RÉFÉRENCE BPMN — injecté dans le prompt pour guider Gemini
# ─────────────────────────────────────────────────────────────────────────────

BPMN_REFERENCE_EXAMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="Definitions_Example"
             targetNamespace="http://bpmn.io/schema/bpmn">

  <collaboration id="Collab_1">
    <participant id="Participant_1" name="Nom du Processus" processRef="Process_1"/>
  </collaboration>

  <process id="Process_1" isExecutable="false">
    <laneSet id="LaneSet_1">
      <lane id="Lane_Acteur1" name="Acteur 1">
        <flowNodeRef>Start_1</flowNodeRef>
        <flowNodeRef>Task_1</flowNodeRef>
        <flowNodeRef>Gateway_1</flowNodeRef>
        <flowNodeRef>Task_2</flowNodeRef>
        <flowNodeRef>End_1</flowNodeRef>
      </lane>
      <lane id="Lane_Acteur2" name="Acteur 2">
        <flowNodeRef>Task_3</flowNodeRef>
        <flowNodeRef>End_2</flowNodeRef>
      </lane>
    </laneSet>

    <!-- Annotations applicatifs sous les tâches -->
    <textAnnotation id="Ann_1"><text>Applicatif A</text></textAnnotation>
    <association id="Assoc_1" sourceRef="Task_1" targetRef="Ann_1" associationDirection="None"/>

    <startEvent id="Start_1" name="Début"><outgoing>F01</outgoing></startEvent>
    <userTask id="Task_1" name="Tâche de l'acteur 1"><incoming>F01</incoming><outgoing>F02</outgoing></userTask>
    <exclusiveGateway id="Gateway_1" name="Condition ?"><incoming>F02</incoming><outgoing>F03</outgoing><outgoing>F04</outgoing></exclusiveGateway>
    <userTask id="Task_2" name="Traitement si Non"><incoming>F03</incoming><outgoing>F05</outgoing></userTask>
    <userTask id="Task_3" name="Tâche de l'acteur 2"><incoming>F04</incoming><outgoing>F06</outgoing></userTask>
    <endEvent id="End_1" name="Fin"><incoming>F05</incoming></endEvent>
    <endEvent id="End_2" name="Fin"><incoming>F06</incoming></endEvent>

    <sequenceFlow id="F01" sourceRef="Start_1" targetRef="Task_1"/>
    <sequenceFlow id="F02" sourceRef="Task_1" targetRef="Gateway_1"/>
    <sequenceFlow id="F03" name="Non" sourceRef="Gateway_1" targetRef="Task_2"/>
    <sequenceFlow id="F04" name="Oui" sourceRef="Gateway_1" targetRef="Task_3"/>
    <sequenceFlow id="F05" sourceRef="Task_2" targetRef="End_1"/>
    <sequenceFlow id="F06" sourceRef="Task_3" targetRef="End_2"/>
  </process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">

      <!-- Pool vertical — isHorizontal="false" -->
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="false">
        <dc:Bounds x="80" y="40" width="600" height="900"/>
      </bpmndi:BPMNShape>

      <!-- Lanes verticales côte à côte — même y, même height, x progressif -->
      <bpmndi:BPMNShape id="Lane_Acteur1_di" bpmnElement="Lane_Acteur1" isHorizontal="false">
        <dc:Bounds x="80" y="40" width="200" height="900"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Acteur2_di" bpmnElement="Lane_Acteur2" isHorizontal="false">
        <dc:Bounds x="280" y="40" width="200" height="900"/>
      </bpmndi:BPMNShape>

      <!-- Éléments positionnés dans leur lane -->
      <!-- Lane_Acteur1 : x entre 80 et 280, centré à x=130 -->
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="152" y="100" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="138" y="143" width="64" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="220" width="160" height="60"/>
      </bpmndi:BPMNShape>
      <!-- Annotation sous Task_1 : y = Task_1.y + 60 + 8 -->
      <bpmndi:BPMNShape id="Ann_1_di" bpmnElement="Ann_1">
        <dc:Bounds x="102" y="288" width="90" height="20"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="152" y="380" width="50" height="50"/>
        <bpmndi:BPMNLabel><dc:Bounds x="130" y="437" width="94" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Bounds x="100" y="520" width="160" height="60"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1">
        <dc:Bounds x="152" y="660" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="163" y="703" width="14" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>

      <!-- Lane_Acteur2 : x entre 280 et 480, centré à x=330 -->
      <bpmndi:BPMNShape id="Task_3_di" bpmnElement="Task_3">
        <dc:Bounds x="300" y="380" width="160" height="60"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_2_di" bpmnElement="End_2">
        <dc:Bounds x="362" y="520" width="36" height="36"/>
        <bpmndi:BPMNLabel><dc:Bounds x="373" y="563" width="14" height="14"/></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>

      <!-- Flows -->
      <bpmndi:BPMNEdge id="F01_di" bpmnElement="F01">
        <di:waypoint x="170" y="136"/>
        <di:waypoint x="170" y="220"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F02_di" bpmnElement="F02">
        <di:waypoint x="170" y="280"/>
        <di:waypoint x="170" y="380"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F03_di" bpmnElement="F03">
        <di:waypoint x="152" y="405"/>
        <di:waypoint x="100" y="405"/>
        <di:waypoint x="100" y="520"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F04_di" bpmnElement="F04">
        <di:waypoint x="202" y="405"/>
        <di:waypoint x="380" y="405"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F05_di" bpmnElement="F05">
        <di:waypoint x="170" y="580"/>
        <di:waypoint x="170" y="660"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F06_di" bpmnElement="F06">
        <di:waypoint x="380" y="440"/>
        <di:waypoint x="380" y="520"/>
      </bpmndi:BPMNEdge>

      <!-- Association annotation -->
      <bpmndi:BPMNEdge id="Assoc_1_di" bpmnElement="Assoc_1">
        <di:waypoint x="147" y="280"/>
        <di:waypoint x="147" y="288"/>
      </bpmndi:BPMNEdge>

    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>"""

# ─────────────────────────────────────────────────────────────────────────────
# PROMPT PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

BPMN_GENERATION_PROMPT = """Tu es un expert en modélisation BPMN 2.0 spécialisé dans les procédures bancaires de style HOPEX/ARIS.

Analyse le document fourni (PDF ou image) et génère un fichier BPMN 2.0 XML complet et valide représentant le logigramme de la procédure.

## RÈGLES ABSOLUES

### Structure des acteurs (lanes)
- Identifie tous les acteurs humains mentionnés dans la procédure
- Chaque acteur = une lane verticale (isHorizontal="false")
- Le Client (si présent) est toujours la première lane à gauche
- Les actions automatiques du système NE sont PAS des tâches — elles ne figurent PAS dans le logigramme

### Types d'éléments BPMN
- Tâches humaines : `<userTask>` uniquement
- Tâches système automatiques visibles : `<serviceTask>`  
- Décisions : `<exclusiveGateway>` avec labels Oui/Non sur les sorties
- Début : `<startEvent>`
- Fin : `<endEvent>` (plusieurs fins possibles selon les chemins)
- Actions client sans rectangle : `<intermediateCatchEvent>` avec `<messageEventDefinition>`
- Applicatifs/outils sous les tâches : `<textAnnotation>` + `<association>`

### Règles logigramme (style HOPEX)
- Seules les tâches avec une action humaine concrète apparaissent
- Si un gateway a deux sorties vers la MÊME tâche suivante → supprimer le gateway
- Un gateway sépare uniquement quand les traitements humains divergent réellement
- Les actions client (signer, approvisionner) = intermediateCatchEvent dans la lane Client, pas des userTask
- La flèche qui va vers l'intermediateCatchEvent porte le nom de l'action attendue du client
- "Conserver une copie", "archiver" seul sans autre action → mentionner dans description, pas dans logigramme
- Les fins ne reviennent pas toutes au client — elles se terminent dans la lane de l'acteur qui conclut

### Positionnement DI (coordonnées x/y)
- Pool : x=80, y=40, width=TOTAL_LANES_WIDTH, height=PROCESS_HEIGHT
- Lanes verticales : même y=40, même height=PROCESS_HEIGHT, x progressif
  - Largeur par lane : 200px si peu de tâches, 280px si beaucoup
  - Lane Client : toujours 180px (actions légères)
- Espacement vertical entre éléments : 100px minimum
- StartEvent : y=100, centré horizontalement dans sa lane
- Tâches (userTask) : height=60, width=160, centrées dans leur lane
- Gateways : 50x50px, centré horizontalement
- EndEvent : 36x36px
- Annotations (textAnnotation) : y = tâche.y + 60 + 8, x = tâche.x + 2, height=20
- Association : courte ligne verticale tâche→annotation (8px)
- Pour un pool de N lanes de 200px : pool_width = N * 200
- Pour un processus de M étapes : pool_height = M * 120 + 200

### Format IDs
- Lanes : Lane_NomActeur (sans espaces ni accents)
- Tâches : Task_VerbeNom
- Gateways : Gateway_NomCondition  
- Flows : F01, F02... ou F_NomSignificatif
- Annotations : Ann_NomApplicatif
- Associations : Assoc_NomApplicatif

## EXEMPLE DE RÉFÉRENCE
Voici un BPMN valide de référence à utiliser comme modèle structurel :

{reference_bpmn}

## SORTIE ATTENDUE
Retourne UNIQUEMENT le XML BPMN complet, sans aucun texte avant ou après.
Commence directement par `<?xml version="1.0" encoding="UTF-8"?>`.
N'inclus pas de balises markdown (pas de ```xml).
Le XML doit être valide et importable directement dans bpmn-js.
"""


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/generate-bpmn")
async def generate_bpmn(file: UploadFile = File(...)):
    """
    Reçoit un PDF ou une image, retourne un BPMN XML généré par Gemini.
    """
    content = await file.read()
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()

    # Déterminer le media type
    if ext in (".pdf",):
        media_type = "application/pdf"
    elif ext in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif ext in (".png",):
        media_type = "image/png"
    elif ext in (".webp",):
        media_type = "image/webp"
    else:
        raise HTTPException(status_code=400, detail=f"Format non supporté : {ext}")

    try:
        client = genai.Client()

        # Construire le prompt complet
        prompt = BPMN_GENERATION_PROMPT.format(
            reference_bpmn=BPMN_REFERENCE_EXAMPLE
        )

        # Construire la requête multimodale
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=content, mime_type=media_type),
                types.Part.from_text(text=prompt),
            ],
            config=types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=32000,  # Augmenté pour les grands BPMN
            ),
        )

        raw = response.text.strip()

        # Nettoyer les éventuelles balises markdown
        raw = re.sub(r"^```(?:xml)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```\s*$", "", raw, flags=re.MULTILINE)
        raw = raw.strip()

        # Valider que c'est du XML BPMN
        if not raw.startswith("<?xml") and not raw.startswith("<definitions"):
            logger.error("Gemini n'a pas retourné du XML BPMN valide")
            raise HTTPException(
                status_code=500,
                detail="La génération n'a pas produit un BPMN valide"
            )

        # Vérifier que le XML est bien fermé (tag </definitions> présent)
        if "</definitions>" not in raw:
            logger.warning("XML tronqué détecté — tentative de fermeture automatique")
            # Fermer les tags ouverts manquants
            if "</bpmndi:BPMNDiagram>" not in raw:
                if "</bpmndi:BPMNPlane>" not in raw:
                    raw += "\n    </bpmndi:BPMNPlane>"
                raw += "\n  </bpmndi:BPMNDiagram>"
            raw += "\n</definitions>"
            logger.info("XML fermé automatiquement")

        return JSONResponse(content={"xml": raw, "filename": Path(filename).stem + ".bpmn"})

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur génération BPMN")
        raise HTTPException(status_code=500, detail=str(e))