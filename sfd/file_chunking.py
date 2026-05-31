"""
Gestion des fichiers volumineux avec chunking et résumé progressif
"""
import tiktoken
from typing import List, Dict, Any

# Limites de tokens pour Gemini 2.5 Flash Lite
MAX_TOKENS_PER_REQUEST = 900000  # On garde une marge de sécurité (1M max)
MAX_TEXT_LENGTH = 700000  # Environ 700K mots max


def count_tokens(text: str, model: str = "cl100k_base") -> int:
    """
    Compte le nombre de tokens dans un texte
    
    Args:
        text: Texte à analyser
        model: Modèle d'encoding (cl100k_base pour GPT-4/Gemini)
        
    Returns:
        Nombre de tokens
    """
    try:
        encoding = tiktoken.get_encoding(model)
        return len(encoding.encode(text))
    except Exception:
        # Estimation approximative : 1 token ≈ 4 caractères
        return len(text) // 4


def chunk_text(text: str, chunk_size: int = 100000) -> List[str]:
    """
    Découpe un texte en chunks de taille raisonnable
    
    Args:
        text: Texte à découper
        chunk_size: Nombre de caractères par chunk
        
    Returns:
        Liste de chunks
    """
    # Découper par paragraphes d'abord
    paragraphs = text.split('\n\n')
    
    chunks = []
    current_chunk = []
    current_length = 0
    
    for para in paragraphs:
        para_length = len(para)
        
        # Si un seul paragraphe dépasse chunk_size, le découper par phrases
        if para_length > chunk_size:
            sentences = para.split('. ')
            for sentence in sentences:
                sentence_length = len(sentence)
                if current_length + sentence_length > chunk_size:
                    if current_chunk:
                        chunks.append('\n\n'.join(current_chunk))
                    current_chunk = [sentence]
                    current_length = sentence_length
                else:
                    current_chunk.append(sentence)
                    current_length += sentence_length
        else:
            if current_length + para_length > chunk_size:
                if current_chunk:
                    chunks.append('\n\n'.join(current_chunk))
                current_chunk = [para]
                current_length = para_length
            else:
                current_chunk.append(para)
                current_length += para_length
    
    # Ajouter le dernier chunk
    if current_chunk:
        chunks.append('\n\n'.join(current_chunk))
    
    return chunks


def should_chunk_file(text: str) -> bool:
    """
    Détermine si un fichier doit être chunké
    
    Args:
        text: Contenu du fichier
        
    Returns:
        True si le fichier est trop gros
    """
    # Vérifier la longueur du texte
    if len(text) > MAX_TEXT_LENGTH:
        return True
    
    # Vérifier le nombre de tokens
    token_count = count_tokens(text)
    if token_count > MAX_TOKENS_PER_REQUEST:
        return True
    
    return False


def create_chunk_prompts(chunks: List[str], original_prompt: str) -> List[Dict[str, str]]:
    """
    Crée des prompts pour chaque chunk avec contexte
    
    Args:
        chunks: Liste de chunks de texte
        original_prompt: Prompt original pour extraction SFD
        
    Returns:
        Liste de prompts pour chaque chunk
    """
    prompts = []
    
    for i, chunk in enumerate(chunks):
        chunk_prompt = f"""
{original_prompt}

IMPORTANT: Ceci est la partie {i+1}/{len(chunks)} d'un document plus long.
Extrait les informations de CETTE PARTIE UNIQUEMENT.
Si des sections sont incomplètes, indique "Voir parties suivantes".

CONTENU DE LA PARTIE {i+1}:
{chunk}
"""
        prompts.append({
            "chunk_index": i,
            "total_chunks": len(chunks),
            "prompt": chunk_prompt,
            "text": chunk
        })
    
    return prompts


def merge_sfd_chunks(chunk_results: List[Dict[str, Any]], format_type: str) -> Dict[str, Any]:
    """
    Fusionne les résultats de plusieurs chunks en un seul SFD
    
    Args:
        chunk_results: Liste des SFD extraits de chaque chunk
        format_type: "format1" ou "format2"
        
    Returns:
        SFD fusionné
    """
    if not chunk_results:
        raise ValueError("Aucun résultat à fusionner")
    
    # Utiliser le premier chunk comme base
    merged = chunk_results[0].copy()
    
    if format_type == "format1":
        # Fusionner les modules
        all_modules = merged.get("modules", [])
        for result in chunk_results[1:]:
            all_modules.extend(result.get("modules", []))
        merged["modules"] = all_modules
        
        # Fusionner les objectifs métier
        if "contexte" in merged:
            all_objectives = merged["contexte"].get("objectifs_metier", [])
            for result in chunk_results[1:]:
                if "contexte" in result:
                    all_objectives.extend(result["contexte"].get("objectifs_metier", []))
            merged["contexte"]["objectifs_metier"] = list(set(all_objectives))
        
        # Fusionner les acteurs
        if "contexte" in merged:
            all_acteurs = merged["contexte"].get("acteurs", [])
            for result in chunk_results[1:]:
                if "contexte" in result:
                    all_acteurs.extend(result["contexte"].get("acteurs", []))
            # Dédupliquer les acteurs par rôle
            seen_roles = set()
            unique_acteurs = []
            for acteur in all_acteurs:
                role = acteur.get("role", "")
                if role not in seen_roles:
                    seen_roles.add(role)
                    unique_acteurs.append(acteur)
            merged["contexte"]["acteurs"] = unique_acteurs
        
    elif format_type == "format2":
        # Fusionner les epics
        all_epics = merged.get("epics", [])
        for result in chunk_results[1:]:
            all_epics.extend(result.get("epics", []))
        merged["epics"] = all_epics
        
        # Fusionner les règles métier
        all_regles = merged.get("regles_metier", [])
        for result in chunk_results[1:]:
            all_regles.extend(result.get("regles_metier", []))
        # Dédupliquer par ID
        seen_ids = set()
        unique_regles = []
        for regle in all_regles:
            regle_id = regle.get("id", "")
            if regle_id not in seen_ids:
                seen_ids.add(regle_id)
                unique_regles.append(regle)
        merged["regles_metier"] = unique_regles
        
        # Fusionner les workflows
        all_workflows = merged.get("workflows", [])
        for result in chunk_results[1:]:
            all_workflows.extend(result.get("workflows", []))
        merged["workflows"] = all_workflows
    
    return merged


def get_file_size_info(file_content: bytes, text_content: str = None) -> Dict[str, Any]:
    """
    Obtient des informations sur la taille d'un fichier
    
    Args:
        file_content: Contenu brut du fichier
        text_content: Texte extrait (optionnel)
        
    Returns:
        Informations sur la taille
    """
    file_size_mb = len(file_content) / (1024 * 1024)
    
    info = {
        "file_size_mb": round(file_size_mb, 2),
        "file_size_bytes": len(file_content),
        "requires_chunking": False,
        "estimated_tokens": 0,
        "text_length": 0
    }
    
    if text_content:
        info["text_length"] = len(text_content)
        info["estimated_tokens"] = count_tokens(text_content)
        info["requires_chunking"] = should_chunk_file(text_content)
    
    return info