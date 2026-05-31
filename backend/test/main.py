from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import xml.etree.ElementTree as ET
from xml.dom import minidom

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Modèle Pydantic pour valider le tableau
class TableRow(BaseModel):
    ID: int
    Service: str
    Etape: str
    Tache: str
    Type: str
    Condition: str | None
    Si_Oui: str | None
    Si_Non: str | None
    Acteurs: str
    Outils_Systemes: str

class TableData(BaseModel):
    rows: list[TableRow]

def generate_bpmn_xml(data: list[dict]):
    ns = {
        'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL',
        'bpmndi': 'http://www.omg.org/spec/BPMN/20100524/DI',
        'dc': 'http://www.omg.org/spec/DD/20100524/DC',
        'di': 'http://www.omg.org/spec/DD/20100524/DI'
    }
    root = ET.Element('bpmn:definitions', xmlns='http://www.omg.org/spec/BPMN/20100524/MODEL')
    process = ET.SubElement(root, 'bpmn:process', id='Process_1', isExecutable='false')

    # Pools pour acteurs
    actors = set(row['Acteurs'] for row in data)
    lane_set = ET.SubElement(process, 'bpmn:laneSet')
    for i, actor in enumerate(actors):
        ET.SubElement(lane_set, 'bpmn:lane', id=f'Lane_{i}', name=actor)

    # Start event
    start = ET.SubElement(process, 'bpmn:startEvent', id='StartEvent_1', name='Début')
    prev_id = 'StartEvent_1'

    # Génère tâches/gateways
    for row in data:
        task_id = f'Task_{row["ID"]}'
        if row['Type'] == 'Conditionnelle':
            gateway_id = f'Gateway_{row["ID"]}'
            gateway = ET.SubElement(process, 'bpmn:exclusiveGateway', id=gateway_id, name=row['Condition'] or 'Condition')
            ET.SubElement(process, 'bpmn:sequenceFlow', id=f'Flow_{row["ID"]}_in', sourceRef=prev_id, targetRef=gateway_id)
            # Branche Oui
            yes_task = ET.SubElement(process, 'bpmn:task', id=task_id + '_yes', name=row['Tache'] + ' (Oui)')
            ET.SubElement(process, 'bpmn:sequenceFlow', id=f'Flow_{row["ID"]}_yes', sourceRef=gateway_id, targetRef=task_id + '_yes')
            # Branche Non
            no_target = f'Task_{row["Si_Non"].split(".")[0]}' if row['Si_Non'] and row['Si_Non'] != '—' else 'EndEvent_1'
            ET.SubElement(process, 'bpmn:sequenceFlow', id=f'Flow_{row["ID"]}_no', sourceRef=gateway_id, targetRef=no_target)
            prev_id = task_id + '_yes'
        else:
            task = ET.SubElement(process, 'bpmn:task', id=task_id, name=row['Tache'])
            ET.SubElement(process, 'bpmn:sequenceFlow', id=f'Flow_{row["ID"]}', sourceRef=prev_id, targetRef=task_id)
            prev_id = task_id

        # Extensions pour icônes/styles
        ext = ET.SubElement(task if 'task' in locals() else yes_task, 'bpmn:extensionElements')
        ET.SubElement(ext, 'custom:tool', value=row['Outils_Systemes'])
        icon_map = {'Website': 'website', 'Payment Gateway': 'payment', 'Email': 'email'}
        ET.SubElement(ext, 'custom:icon', value=icon_map.get(row['Outils_Systemes'], 'default'))

    # End event
    end = ET.SubElement(process, 'bpmn:endEvent', id='EndEvent_1', name='Fin')
    ET.SubElement(process, 'bpmn:sequenceFlow', id='Flow_end', sourceRef=prev_id, targetRef='EndEvent_1')

    # Diagramme pour positions (simplifié, auto-layout en frontend)
    diagram = ET.SubElement(root, 'bpmndi:BPMNDiagram', id='BPMNDiagram_1')
    plane = ET.SubElement(diagram, 'bpmndi:BPMNPlane', id='BPMNPlane_1', bpmnElement='Process_1')
    ET.SubElement(plane, 'bpmndi:BPMNShape', id='Shape_Start', bpmnElement='StartEvent_1').append(
        ET.SubElement(None, 'dc:Bounds', x='100', y='100', width='36', height='36')
    )

    return minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")

@app.post("/generate-bpmn")
async def generate_bpmn(data: TableData):
    try:
        bpmn_xml = generate_bpmn_xml([row.dict() for row in data.rows])
        return JSONResponse(content={"bpmn_xml": bpmn_xml})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))