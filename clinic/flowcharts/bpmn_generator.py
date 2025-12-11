# ============================================
# FICHIER 1: flowcharts/bpmn_generator.py
# ============================================
"""
Générateur de processus BPMN à partir de documents (PDF/Word)
Utilise Gemini AI pour analyser et formaliser les processus métier
"""

import os
import json
from typing import List, Dict, Any
import google.generativeai as genai
from pathlib import Path
import xml.etree.ElementTree as ET
from xml.dom import minidom


class BPMNGenerator:
    """Génère des processus BPMN à partir de documents métier"""
    
    def __init__(self, api_key: str):
        """
        Initialise le générateur BPMN
        
        Args:
            api_key: Clé API Google Gemini
        """
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
    
    def analyze_documents(self, files_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyse les documents et extrait les processus métier
        
        Args:
            files_data: Liste de dictionnaires contenant:
                - filename: nom du fichier
                - content: contenu en bytes
                - mime_type: type MIME du fichier
                - temp_path: chemin du fichier temporaire
        
        Returns:
            Dict contenant les processus BPMN identifiés
        """
        # Construire le prompt
        prompt = self._build_analysis_prompt(files_data)
        
        # Préparer les parties du contenu pour Gemini
        content_parts = [prompt]
        
        # Ajouter chaque fichier
        for file_info in files_data:
            try:
                # Lire le fichier depuis le chemin temporaire
                with open(file_info['temp_path'], 'rb') as f:
                    file_data = f.read()
                
                # Créer un objet Part pour Gemini
                file_part = {
                    'mime_type': file_info['mime_type'],
                    'data': file_data
                }
                content_parts.append(file_part)
                content_parts.append(f"\n\n--- Fin du document: {file_info['filename']} ---\n")
                
            except Exception as e:
                raise ValueError(f"Erreur lors de la lecture du fichier {file_info['filename']}: {str(e)}")
        
        # Appeler Gemini avec tous les fichiers
        try:
            response = self.model.generate_content(content_parts)
            response_text = response.text
            
            # Parser la réponse JSON
            # Nettoyer les balises markdown si présentes
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            bpmn_data = json.loads(response_text.strip())
            return bpmn_data
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Réponse invalide de Gemini (JSON non valide): {str(e)}")
        except Exception as e:
            raise ValueError(f"Erreur lors de l'analyse avec Gemini: {str(e)}")
    
    def _build_analysis_prompt(self, files_data: List[Dict]) -> str:
        """Construit le prompt pour l'analyse des documents"""
        file_list = ", ".join([f['filename'] for f in files_data])
        
        return f"""Tu es un expert en analyse de processus métier et en modélisation BPMN.

Je t'ai fourni {len(files_data)} document(s) : {file_list}

**Ta mission :**
1. Analyse attentivement TOUS les documents fournis
2. Identifie tous les processus métier décrits ou mentionnés
3. Pour chaque processus, identifie :
   - Les étapes/activités
   - Les acteurs/rôles impliqués
   - Les conditions de branchement (SI/ALORS)
   - Les événements déclencheurs et de fin
   - Les flux de données
   - Les systèmes/outils utilisés

4. Formalise chaque processus en structure BPMN

**IMPORTANT : Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après.**

Format de réponse attendu (JSON strict) :
```json
{{
  "documents_analyzed": [
    {{
      "filename": "nom_du_fichier",
      "document_type": "procedure|specification|manuel|autre",
      "summary": "résumé du contenu"
    }}
  ],
  "processes": [
    {{
      "id": "process_1",
      "name": "Nom du processus",
      "description": "Description détaillée",
      "category": "operational|support|management",
      "actors": [
        {{
          "id": "actor_1",
          "name": "Nom du rôle",
          "type": "user|system|role"
        }}
      ],
      "events": [
        {{
          "id": "start_1",
          "name": "Événement de démarrage",
          "type": "start|end|intermediate",
          "trigger": "description du déclencheur"
        }}
      ],
      "activities": [
        {{
          "id": "task_1",
          "name": "Nom de l'activité",
          "type": "task|userTask|serviceTask|scriptTask",
          "actor": "actor_1",
          "description": "Description détaillée",
          "inputs": ["données en entrée"],
          "outputs": ["données en sortie"],
          "systems": ["système ou outil utilisé"]
        }}
      ],
      "gateways": [
        {{
          "id": "gateway_1",
          "name": "Point de décision",
          "type": "exclusive|parallel|inclusive",
          "question": "Question de branchement"
        }}
      ],
      "flows": [
        {{
          "id": "flow_1",
          "source": "start_1",
          "target": "task_1",
          "condition": "condition si applicable"
        }}
      ],
      "data_objects": [
        {{
          "id": "data_1",
          "name": "Nom de la donnée",
          "type": "input|output|store"
        }}
      ]
    }}
  ],
  "insights": {{
    "total_processes": 0,
    "complexity": "low|medium|high",
    "recommendations": ["recommandations d'amélioration"],
    "dependencies": ["dépendances entre processus"]
  }}
}}
```

**Règles strictes :**
- Retourne UNIQUEMENT du JSON valide
- Pas de texte explicatif avant ou après
- Pas de balises markdown
- Tous les IDs doivent être uniques
- Les flows doivent connecter des éléments existants
- Sois exhaustif dans l'analyse

Analyse maintenant les documents suivants:
"""
    
    def generate_bpmn_json(self, analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convertit l'analyse en format BPMN JSON structuré
        
        Args:
            analysis_data: Données d'analyse des processus
        
        Returns:
            BPMN au format JSON
        """
        return {
            "bpmn_version": "2.5",
            "generated_at": None,  # Sera rempli par le router
            "format": "json",
            **analysis_data
        }
    
    def generate_bpmn_xml(self, analysis_data: Dict[str, Any]) -> str:
        """
        Génère un fichier BPMN 2.0 XML valide
        
        Args:
            analysis_data: Données d'analyse des processus
        
        Returns:
            XML BPMN 2.0 formaté
        """
        # Créer la structure XML BPMN 2.0
        definitions = ET.Element('bpmn:definitions', {
            'xmlns:bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL',
            'xmlns:bpmndi': 'http://www.omg.org/spec/BPMN/20100524/DI',
            'xmlns:dc': 'http://www.omg.org/spec/DD/20100524/DC',
            'xmlns:di': 'http://www.omg.org/spec/DD/20100524/DI',
            'id': 'Definitions_1',
            'targetNamespace': 'http://bpmn.io/schema/bpmn'
        })
        
        # Pour chaque processus
        for process_data in analysis_data.get('processes', []):
            process = ET.SubElement(definitions, 'bpmn:process', {
                'id': process_data['id'],
                'name': process_data['name'],
                'isExecutable': 'false'
            })
            
            # Documentation
            if process_data.get('description'):
                doc = ET.SubElement(process, 'bpmn:documentation')
                doc.text = process_data['description']
            
            # Ajouter les événements
            for event in process_data.get('events', []):
                event_type_map = {
                    'start': 'bpmn:startEvent',
                    'end': 'bpmn:endEvent',
                    'intermediate': 'bpmn:intermediateThrowEvent'
                }
                event_elem = ET.SubElement(
                    process,
                    event_type_map.get(event['type'], 'bpmn:startEvent'),
                    {'id': event['id'], 'name': event['name']}
                )
            
            # Ajouter les activités
            for activity in process_data.get('activities', []):
                activity_type_map = {
                    'task': 'bpmn:task',
                    'userTask': 'bpmn:userTask',
                    'serviceTask': 'bpmn:serviceTask',
                    'scriptTask': 'bpmn:scriptTask'
                }
                activity_elem = ET.SubElement(
                    process,
                    activity_type_map.get(activity['type'], 'bpmn:task'),
                    {'id': activity['id'], 'name': activity['name']}
                )
                
                # Documentation de l'activité
                if activity.get('description'):
                    doc = ET.SubElement(activity_elem, 'bpmn:documentation')
                    doc.text = activity['description']
            
            # Ajouter les gateways
            for gateway in process_data.get('gateways', []):
                gateway_type_map = {
                    'exclusive': 'bpmn:exclusiveGateway',
                    'parallel': 'bpmn:parallelGateway',
                    'inclusive': 'bpmn:inclusiveGateway'
                }
                gateway_elem = ET.SubElement(
                    process,
                    gateway_type_map.get(gateway['type'], 'bpmn:exclusiveGateway'),
                    {'id': gateway['id'], 'name': gateway.get('name', '')}
                )
            
            # Ajouter les flux
            for flow in process_data.get('flows', []):
                flow_attrs = {
                    'id': flow['id'],
                    'sourceRef': flow['source'],
                    'targetRef': flow['target']
                }
                if flow.get('condition'):
                    flow_attrs['name'] = flow['condition']
                
                ET.SubElement(process, 'bpmn:sequenceFlow', flow_attrs)
        
        # Convertir en string avec formatage
        xml_str = ET.tostring(definitions, encoding='unicode')
        
        # Formatter avec minidom
        dom = minidom.parseString(xml_str)
        pretty_xml = dom.toprettyxml(indent='  ')
        
        # Nettoyer les lignes vides
        lines = [line for line in pretty_xml.split('\n') if line.strip()]
        return '\n'.join(lines)


