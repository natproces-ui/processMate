import os
import json
import base64
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from PIL import Image
import io
import pandas as pd
from datetime import datetime

# Configuration de Gemini
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

class MegaTableImageProcessor:
    """
    Processeur d'images pour extraire des données de processus BPMN
    et les convertir en format MegaTable
    """
    
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-2.5-flash', generation_config={
            'temperature': 0.3,
            'top_p': 0.9,
            'top_k': 40,
            'max_output_tokens': 8192,
        })
        self.columns = [
            "Process", "Process Name", "What", "Type", "Event Nature",
            "Who", "Comment", "Previous Item", "Previous Item Type",
            "Sequence Label", "Sequence Type"
        ]
    
    def _create_prompt(self) -> str:
        """Crée le prompt pour Gemini"""
        return f"""
Analyze this process diagram/image and extract ALL process elements in extreme detail.

This could be:
- A hand-drawn BPMN diagram
- A photo of a paper process
- A digital BPMN diagram
- A procedure flowchart
- Any process visualization

Even if the image is blurry or unclear, extract EVERYTHING you can see.

Return a JSON array with this EXACT structure for each element:
[
  {{
    "process": "process_id",
    "processName": "process name",
    "what": "element name/description",
    "type": "Event|Operation|Gateway|Task",
    "eventNature": "Start|End|Catching|Throwing|" (empty if not an event),
    "who": "actor/department/role",
    "comment": "any additional info",
    "previousItem": "name of previous element",
    "previousItemType": "Event|Operation|Gateway|Task",
    "sequenceLabel": "label on the arrow/flow",
    "sequenceType": "Default|Conditioned|" (empty for normal flow)
  }}
]

CRITICAL RULES:
1. Extract EVERY element you see, even if partially visible
2. If a field is unclear or empty, use empty string ""
3. Maintain the flow order from start to end
4. For gateways (decision points), include all outgoing paths
5. Capture ALL text visible in the image
6. If you see multiple processes, extract them all with different process IDs
7. Return ONLY valid JSON, no markdown, no explanation

Start the first element with type "Event" and eventNature "Start".
End with type "Event" and eventNature "End".
"""
    
    async def process_image(self, image_data: bytes, filename: str = "uploaded_image") -> Dict[str, Any]:
        """
        Traite une image et extrait les données de processus
        
        Args:
            image_data: Données binaires de l'image
            filename: Nom du fichier (optionnel)
            
        Returns:
            Dict contenant les données extraites et les métadonnées
        """
        try:
            # Ouvrir l'image avec PIL
            image = Image.open(io.BytesIO(image_data))
            
            # Appeler Gemini
            prompt = self._create_prompt()
            response = self.model.generate_content([prompt, image])
            
            # Extraire le JSON de la réponse
            response_text = response.text.strip()
            
            # Nettoyer la réponse (enlever markdown si présent)
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            
            response_text = response_text.strip()
            
            # Parser le JSON
            data = json.loads(response_text)
            
            # Valider et nettoyer les données
            cleaned_data = self._clean_data(data)
            
            # Calculer les statistiques
            stats = self._calculate_stats(cleaned_data)
            
            return {
                "success": True,
                "data": cleaned_data,
                "stats": stats,
                "filename": filename,
                "timestamp": datetime.now().isoformat()
            }
            
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"Invalid JSON from Gemini: {str(e)}",
                "raw_response": response_text if 'response_text' in locals() else None
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _clean_data(self, data: List[Dict]) -> List[Dict]:
        """Nettoie et valide les données extraites"""
        cleaned = []
        
        for item in data:
            cleaned_item = {
                "process": item.get("process", ""),
                "processName": item.get("processName", ""),
                "what": item.get("what", ""),
                "type": item.get("type", ""),
                "eventNature": item.get("eventNature", ""),
                "who": item.get("who", ""),
                "comment": item.get("comment", ""),
                "previousItem": item.get("previousItem", ""),
                "previousItemType": item.get("previousItemType", ""),
                "sequenceLabel": item.get("sequenceLabel", ""),
                "sequenceType": item.get("sequenceType", "")
            }
            cleaned.append(cleaned_item)
        
        return cleaned
    
    def _calculate_stats(self, data: List[Dict]) -> Dict[str, Any]:
        """Calcule les statistiques sur les données extraites"""
        stats = {
            "total_elements": len(data),
            "by_type": {},
            "by_event_nature": {},
            "by_who": {},
            "elements_with_comments": 0,
            "elements_with_sequence_label": 0
        }
        
        for item in data:
            # Stats par type
            type_val = item.get("type", "Unknown")
            stats["by_type"][type_val] = stats["by_type"].get(type_val, 0) + 1
            
            # Stats par nature d'événement
            event_nature = item.get("eventNature", "")
            if event_nature:
                stats["by_event_nature"][event_nature] = stats["by_event_nature"].get(event_nature, 0) + 1
            
            # Stats par acteur
            who = item.get("who", "")
            if who:
                stats["by_who"][who] = stats["by_who"].get(who, 0) + 1
            
            # Éléments avec commentaires
            if item.get("comment", ""):
                stats["elements_with_comments"] += 1
            
            # Éléments avec label de séquence
            if item.get("sequenceLabel", ""):
                stats["elements_with_sequence_label"] += 1
        
        return stats
    
    def to_excel(self, data: List[Dict], filename: str = "mega_table.xlsx") -> bytes:
        """Convertit les données en fichier Excel"""
        df = pd.DataFrame(data)
        
        # Réorganiser les colonnes dans l'ordre correct
        df = df[[
            "process", "processName", "what", "type", "eventNature",
            "who", "comment", "previousItem", "previousItemType",
            "sequenceLabel", "sequenceType"
        ]]
        
        # Renommer les colonnes pour l'affichage
        df.columns = self.columns
        
        # Créer le fichier Excel en mémoire
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Process Data')
            
            # Auto-ajuster la largeur des colonnes
            worksheet = writer.sheets['Process Data']
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).map(len).max(),
                    len(col)
                ) + 2
                worksheet.column_dimensions[chr(65 + idx)].width = min(max_length, 50)
        
        output.seek(0)
        return output.getvalue()

# Instance globale du processeur
processor = MegaTableImageProcessor()