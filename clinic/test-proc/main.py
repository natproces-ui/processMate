import os
import json
import re
from typing import List, Dict, Any
from pathlib import Path
import tempfile
import subprocess
import time

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
import google.generativeai as genai

# Charger le .env
env_path = Path(__file__).parent.parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable must be set")

genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="COBOL to Business Flowchart", version="2.0")

# Configuration optimale (RÉDUIT POUR ÉCONOMISER QUOTA)
CHUNK_SIZE = 600  # Plus gros chunks = moins d'appels API
OVERLAP_SIZE = 75
OUTPUT_DIR = Path("/tmp/cobol_analysis")
OUTPUT_DIR.mkdir(exist_ok=True)


class CobolOrchestrator:
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        
    def chunk_with_overlap(self, lines: List[str]) -> List[Dict[str, Any]]:
        """Découpe le code COBOL avec overlap"""
        chunks = []
        position = 0
        total_lines = len(lines)
        
        while position < total_lines:
            end = min(position + CHUNK_SIZE, total_lines)
            chunk_lines = lines[position:end]
            
            chunk = {
                'number': len(chunks) + 1,
                'lines': chunk_lines,
                'start_line': position + 1,
                'end_line': end,
                'total_lines': len(chunk_lines),
                'is_last': end >= total_lines
            }
            chunks.append(chunk)
            
            if end >= total_lines:
                break
            position += (CHUNK_SIZE - OVERLAP_SIZE)
        
        return chunks
    
    def analyze_chunk(self, chunk: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Analyse un chunk et retourne JSON STRUCTURÉ pour flowchart"""
        
        chunk_code = ''.join(chunk['lines'])
        
        # PROMPT pour extraire la STRUCTURE GRAPHVIZ directement
        prompt = f"""Tu es expert COBOL. Extrait la logique métier de ce chunk en format JSON STRUCTURÉ pour créer un flowchart Graphviz.

Contexte des chunks précédents: {json.dumps(context, ensure_ascii=False)[:400] if context else "Premier chunk"}

Chunk {chunk['number']} (lignes {chunk['start_line']}-{chunk['end_line']}):
```cobol
{chunk_code}
```

Retourne un JSON avec cette structure EXACTE:
{{
  "chunk_info": {{
    "number": {chunk['number']},
    "lines": "{chunk['start_line']}-{chunk['end_line']}",
    "section_name": "Nom de section/paragraphe si présent (ex: 1000-VALIDATE-BILL-ELEMENTS)"
  }},
  
  "flow_nodes": [
    {{
      "id": "unique_node_id",
      "type": "start|process|decision|error|end",
      "label": "Label complet du nœud",
      "details": "Détails à afficher (formules, variables, valeurs)",
      "color": "lightblue|yellow|red|lightgreen|orange",
      "shape": "box|diamond|oval"
    }}
  ],
  
  "flow_edges": [
    {{
      "from": "node_id_source",
      "to": "node_id_destination",
      "label": "Oui|Non|Condition|valeur",
      "condition": "Description de la condition si applicable"
    }}
  ],
  
  "validations": [
    {{
      "variable": "NOM-VARIABLE",
      "condition": "Condition COBOL exacte",
      "error_code": "RTC XX",
      "node_id": "ID du nœud de validation"
    }}
  ],
  
  "calculations": [
    {{
      "name": "Nom du calcul",
      "formula_cobol": "Formule COBOL exacte (COMPUTE...)",
      "formula_readable": "Formule lisible",
      "variables": {{"INPUT1": "Description", "INPUT2": "Description"}},
      "result": "Variable résultat",
      "node_id": "ID du nœud de calcul"
    }}
  ],
  
  "decisions": [
    {{
      "condition": "Condition IF exacte",
      "variable_tested": "Variable testée",
      "branch_true": {{"action": "Action si vrai", "next_node": "node_id"}},
      "branch_false": {{"action": "Action si faux", "next_node": "node_id"}},
      "node_id": "ID du nœud de décision"
    }}
  ],
  
  "constants": [
    {{
      "name": "CONST-NAME",
      "value": "Valeur",
      "meaning": "Signification métier",
      "used_in": "Où utilisée"
    }}
  ]
}}

RÈGLES CRITIQUES:
1. Chaque nœud doit avoir un ID UNIQUE (ex: "valid_provider_type", "calc_bsa_factor")
2. Les edges doivent référencer les IDs exacts des nœuds
3. Pour les décisions (IF), créer un nœud diamond avec 2 edges (Oui/Non)
4. Pour les calculs (COMPUTE), créer un nœud process avec la formule complète
5. Pour les validations, créer un nœud decision + un nœud error si échec
6. Capturer TOUTES les formules COBOL exactement comme écrites
7. Si overlap avec chunk précédent, ne pas dupliquer les nœuds déjà créés

JSON uniquement, pas de texte."""

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(temperature=0.2)
                )
                response_text = response.text.strip()
                response_text = re.sub(r'^```json\s*', '', response_text)
                response_text = re.sub(r'\s*```$', '', response_text)
                
                analysis = json.loads(response_text)
                print(f"      ✓ {len(analysis.get('flow_nodes', []))} nœuds, {len(analysis.get('flow_edges', []))} edges")
                return analysis
                
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    print(f"      ⏱️ Retry {attempt + 2}/{max_retries}...")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"      ❌ Échec: {e}")
                    return {
                        "chunk_info": {"number": chunk['number'], "error": str(e)},
                        "flow_nodes": [],
                        "flow_edges": []
                    }
    
    def update_context(self, context: Dict[str, Any], new_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Met à jour le contexte avec les derniers nœuds créés"""
        
        if not context:
            context = {
                'last_nodes': [],
                'sections_seen': [],
                'all_node_ids': []
            }
        
        # Garder trace des derniers nœuds pour éviter duplication
        for node in new_analysis.get('flow_nodes', []):
            if node.get('id'):
                context['all_node_ids'].append(node['id'])
                context['last_nodes'].append({
                    'id': node['id'],
                    'label': node.get('label', '')[:50]
                })
        
        # Limiter à 10 derniers nœuds
        if len(context['last_nodes']) > 10:
            context['last_nodes'] = context['last_nodes'][-10:]
        
        # Tracker les sections
        section = new_analysis.get('chunk_info', {}).get('section_name')
        if section and section not in context['sections_seen']:
            context['sections_seen'].append(section)
        
        return context
    
    def synthesize_flowchart(self, all_analyses: List[Dict[str, Any]], total_chunks: int) -> str:
        """Assemble tous les JSON en un seul flowchart Graphviz"""
        
        # Agréger tous les nœuds et edges
        all_nodes = []
        all_edges = []
        all_validations = []
        all_calculations = []
        all_decisions = []
        
        node_ids_seen = set()
        
        for analysis in all_analyses:
            # Collecter les nœuds (éviter duplications)
            for node in analysis.get('flow_nodes', []):
                node_id = node.get('id')
                if node_id and node_id not in node_ids_seen:
                    all_nodes.append(node)
                    node_ids_seen.add(node_id)
            
            # Collecter les edges
            all_edges.extend(analysis.get('flow_edges', []))
            
            # Collecter les autres infos
            all_validations.extend(analysis.get('validations', []))
            all_calculations.extend(analysis.get('calculations', []))
            all_decisions.extend(analysis.get('decisions', []))
        
        print(f"   📊 Total: {len(all_nodes)} nœuds, {len(all_edges)} edges")
        
        # Construire le code Graphviz
        dot_code = "digraph ESRD_Pricing {\n"
        dot_code += "    rankdir=TB;\n"
        dot_code += "    node [fontname=\"Arial\", fontsize=9];\n"
        dot_code += "    edge [fontsize=8];\n\n"
        
        # Ajouter tous les nœuds
        for node in all_nodes:
            node_id = node.get('id', 'unknown')
            label = node.get('label', 'Inconnu')
            details = node.get('details', '')
            if details:
                label = f"{label}\\n{details}"
            
            shape = node.get('shape', 'box')
            color = node.get('color', 'white')
            
            # Échapper les caractères spéciaux
            label = label.replace('"', '\\"')
            
            dot_code += f'    {node_id} [label="{label}", shape={shape}, style=filled, fillcolor={color}];\n'
        
        dot_code += "\n"
        
        # Ajouter tous les edges
        for edge in all_edges:
            from_node = edge.get('from', '')
            to_node = edge.get('to', '')
            label = edge.get('label', '')
            
            if from_node and to_node:
                if label:
                    label = label.replace('"', '\\"')
                    dot_code += f'    {from_node} -> {to_node} [label="{label}"];\n'
                else:
                    dot_code += f'    {from_node} -> {to_node};\n'
        
        dot_code += "}\n"
        
        return dot_code
    
    def generate_image(self, graphviz_code: str, output_path: Path) -> Path:
        """Génère l'image PNG à partir du code Graphviz"""
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.dot', delete=False) as f:
            f.write(graphviz_code)
            dot_file = f.name
        
        try:
            result = subprocess.run(
                ['dot', '-Tpng', dot_file, '-o', str(output_path)],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode != 0:
                raise Exception(f"Graphviz error: {result.stderr}")
            
            return output_path
            
        finally:
            os.unlink(dot_file)
    
    async def process_cobol_file(self, file_content: str, session_id: str) -> Path:
        """Traite un fichier COBOL avec orchestrateur par chunks"""
        
        print(f"\n{'='*70}")
        print(f"TRAITEMENT - Session {session_id}")
        print(f"{'='*70}")
        
        lines = file_content.splitlines(keepends=True)
        total_lines = len(lines)
        print(f"📄 Fichier : {total_lines} lignes")
        
        chunks = self.chunk_with_overlap(lines)
        print(f"✂️  {len(chunks)} chunks de ~{CHUNK_SIZE} lignes\n")
        
        all_analyses = []
        context = {}
        
        # Analyser chunk par chunk
        for chunk in chunks:
            print(f"🔍 Chunk {chunk['number']}/{len(chunks)} (lignes {chunk['start_line']}-{chunk['end_line']})...")
            
            # Attendre pour éviter rate limiting (Gemini Free Tier : 2 RPM)
            if chunk['number'] > 1:
                print(f"   ⏳ Pause 30s pour respecter rate limit...")
                time.sleep(30)
            
            analysis = self.analyze_chunk(chunk, context)
            all_analyses.append(analysis)
            
            context = self.update_context(context, analysis)
        
        print(f"\n✅ {len(chunks)} chunks analysés")
        
        # Sauvegarder les analyses JSON
        json_path = OUTPUT_DIR / f"{session_id}_analyses.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(all_analyses, f, indent=2, ensure_ascii=False)
        print(f"📄 Analyses JSON: {json_path}")
        
        # Assembler le flowchart
        print(f"\n🎯 Assemblage du flowchart Graphviz...")
        graphviz_code = self.synthesize_flowchart(all_analyses, len(chunks))
        
        # Sauvegarder le code DOT
        dot_path = OUTPUT_DIR / f"{session_id}_flowchart.dot"
        dot_path.write_text(graphviz_code)
        print(f"   📝 Code DOT: {dot_path}")
        
        # Générer l'image
        print(f"\n🖼️  Génération PNG...")
        image_path = OUTPUT_DIR / f"{session_id}_flowchart.png"
        self.generate_image(graphviz_code, image_path)
        
        print(f"   ✅ Image: {image_path}")
        print(f"\n{'='*70}")
        print(f"TERMINÉ - Session {session_id}")
        print(f"{'='*70}\n")
        
        return image_path


orchestrator = CobolOrchestrator()


@app.post("/analyze-cobol")
async def analyze_cobol(file: UploadFile = File(...)):
    """Upload un fichier COBOL et retourne le flowchart complet"""
    
    if not file.filename.endswith('.cbl'):
        raise HTTPException(status_code=400, detail="Le fichier doit avoir l'extension .cbl")
    
    import uuid
    session_id = str(uuid.uuid4())[:8]
    
    try:
        content = await file.read()
        file_content = content.decode('utf-8')
        
        image_path = await orchestrator.process_cobol_file(file_content, session_id)
        
        return FileResponse(
            path=image_path,
            media_type="image/png",
            filename=f"flowchart_{session_id}.png"
        )
        
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Le fichier n'est pas encodé en UTF-8")
    except Exception as e:
        print(f"Erreur : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {
        "message": "COBOL to Business Flowchart API",
        "version": "2.0 - JSON Structuré",
        "approach": "Chunk → JSON structuré → Assemblage Graphviz"
    }


if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*70)
    print("🚀 COBOL TO FLOWCHART API v2.0 - JSON STRUCTURÉ")
    print("="*70)
    print(f"📡 Serveur : http://localhost:8003")
    print(f"📚 Documentation : http://localhost:8003/docs")
    print(f"🔑 Gemini API : {'✅ OK' if GEMINI_API_KEY else '❌ MANQUANTE'}")
    print(f"📊 Approche : Chunk → JSON structuré → Assemblage")
    print("="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8003)