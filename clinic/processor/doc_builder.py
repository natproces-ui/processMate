"""
Document Builder - Construction de rapports Word professionnels
Style MEGA HOPEX avec diagramme BPMN et enrichissements documentaires
"""

from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import base64
import io
import os
import tempfile
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class DocumentBuilder:
    """
    Constructeur de documents Word professionnels
    Génère des rapports de processus BPMN avec style MEGA HOPEX
    """
    
    def __init__(self):
        """Initialise le builder avec un document vierge"""
        self.doc = Document()
        self.step_counter = 0
        self.step_id_to_name: Dict[str, str] = {}
        
        # Configuration des marges
        self._set_margins()
        
        # Application des styles professionnels
        self._apply_mega_styles()
    
    def _set_margins(self):
        """Configure les marges du document (2.5cm)"""
        sections = self.doc.sections
        for section in sections:
            section.top_margin = Cm(2.5)
            section.bottom_margin = Cm(2.5)
            section.left_margin = Cm(2.5)
            section.right_margin = Cm(2.5)
    
    def _apply_mega_styles(self):
        """Applique les styles professionnels type MEGA HOPEX"""
        styles = self.doc.styles
        
        # Style Titre 1 (sections principales)
        try:
            heading1 = styles['Heading 1']
        except KeyError:
            heading1 = styles.add_style('Heading 1', WD_STYLE_TYPE.PARAGRAPH)
        
        heading1.font.name = 'Calibri'
        heading1.font.size = Pt(16)
        heading1.font.bold = True
        heading1.font.color.rgb = RGBColor(30, 64, 175)  # Bleu #1E40AF
        heading1.paragraph_format.space_before = Pt(24)
        heading1.paragraph_format.space_after = Pt(12)
        heading1.paragraph_format.keep_with_next = True
        
        # Style Titre 2 (sous-sections)
        try:
            heading2 = styles['Heading 2']
        except KeyError:
            heading2 = styles.add_style('Heading 2', WD_STYLE_TYPE.PARAGRAPH)
        
        heading2.font.name = 'Calibri'
        heading2.font.size = Pt(14)
        heading2.font.bold = True
        heading2.font.color.rgb = RGBColor(55, 65, 81)  # Gris foncé #374151
        heading2.paragraph_format.space_before = Pt(18)
        heading2.paragraph_format.space_after = Pt(6)
        heading2.paragraph_format.keep_with_next = True
        
        # Style Titre 3 (détails)
        try:
            heading3 = styles['Heading 3']
        except KeyError:
            heading3 = styles.add_style('Heading 3', WD_STYLE_TYPE.PARAGRAPH)
        
        heading3.font.name = 'Calibri'
        heading3.font.size = Pt(12)
        heading3.font.bold = True
        heading3.font.color.rgb = RGBColor(107, 114, 128)  # Gris #6B7280
        heading3.paragraph_format.space_before = Pt(12)
        heading3.paragraph_format.space_after = Pt(6)
        heading3.paragraph_format.keep_with_next = True
        
        # Style Corps de texte
        try:
            normal = styles['Normal']
        except KeyError:
            normal = styles.add_style('Normal', WD_STYLE_TYPE.PARAGRAPH)
        
        normal.font.name = 'Calibri'
        normal.font.size = Pt(11)
        normal.font.color.rgb = RGBColor(31, 41, 55)  # Gris très foncé #1F2937
        normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        normal.paragraph_format.line_spacing = 1.15
        normal.paragraph_format.space_after = Pt(6)
        
        logger.info("✅ Styles MEGA appliqués")
    
    def generate_process_report(
        self,
        metadata: Dict[str, Any],
        workflow: List[Dict[str, str]],
        enrichments: Dict[str, Dict[str, str]],
        diagram_image: Optional[str] = None,
        options: Dict[str, Any] = None
    ) -> str:
        """
        Génère le rapport complet et retourne le chemin du fichier
        
        Args:
            metadata: Métadonnées du processus (Table 0)
            workflow: Liste des étapes (Table 1)
            enrichments: Enrichissements par ID de tâche (Table 2)
            diagram_image: Image base64 du diagramme BPMN
            options: Options de génération
        
        Returns:
            str: Chemin du fichier généré (.docx)
        """
        if options is None:
            options = {
                'include_diagram': True,
                'include_enrichments': True,
                'include_annexes': True,
                'detail_level': 'standard'
            }
        
        logger.info(f"🔨 Construction du rapport '{metadata.get('nom', 'Processus')}'")
        
        # Construire le mapping ID → Nom pour les flux
        self.step_id_to_name = {step['id']: step['étape'] for step in workflow}
        
        # 1. Page de garde
        self._add_cover_page(metadata)
        
        # 2. Table des matières
        self._add_table_of_contents()
        
        # 3. Vue d'ensemble
        self._add_overview_section(metadata, workflow, enrichments)
        
        # 4. Diagramme BPMN
        if options.get('include_diagram') and diagram_image:
            self._insert_bpmn_diagram(diagram_image)
        
        # 5. Description détaillée des étapes
        self._add_workflow_details_section(workflow, enrichments, options)
        
        # 6. Cartographie des acteurs
        self._add_actors_mapping(workflow)
        
        # 7. Annexes
        if options.get('include_annexes'):
            self._add_annexes(workflow, enrichments)
        
        # Sauvegarder dans un fichier temporaire
        temp_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix='.docx',
            prefix='processmate_'
        )
        
        self.doc.save(temp_file.name)
        logger.info(f"💾 Document sauvegardé: {temp_file.name}")
        
        return temp_file.name
    
    def _add_cover_page(self, metadata: Dict[str, Any]):
        """Génère la page de garde"""
        logger.info("📄 Génération de la page de garde")
        
        # Espacements avant le titre
        for _ in range(8):
            self.doc.add_paragraph()
        
        # Titre principal
        title = self.doc.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        title_run = title.add_run(metadata.get('nom', 'Processus métier'))
        title_run.font.size = Pt(24)
        title_run.font.bold = True
        title_run.font.color.rgb = RGBColor(30, 64, 175)
        
        # Sous-titre
        subtitle = self.doc.add_paragraph()
        subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
        subtitle_run = subtitle.add_run("Documentation de processus métier")
        subtitle_run.font.size = Pt(14)
        subtitle_run.font.color.rgb = RGBColor(107, 114, 128)
        
        # Espacements
        for _ in range(4):
            self.doc.add_paragraph()
        
        # Tableau des métadonnées (centré)
        table = self.doc.add_table(rows=4, cols=2)
        table.alignment = WD_ALIGN_PARAGRAPH.CENTER
        table.style = 'Light Grid Accent 1'
        
        # Remplir le tableau
        table.cell(0, 0).text = "Version"
        table.cell(0, 1).text = metadata.get('version', '1.0')
        
        table.cell(1, 0).text = "Propriétaire"
        table.cell(1, 1).text = metadata.get('proprietaire', 'Non spécifié')
        
        table.cell(2, 0).text = "Date de création"
        table.cell(2, 1).text = metadata.get('dateCreation', datetime.now().strftime('%Y-%m-%d'))
        
        table.cell(3, 0).text = "Dernière modification"
        table.cell(3, 1).text = metadata.get('dateModification', datetime.now().strftime('%Y-%m-%d'))
        
        # Formater les cellules
        for row in table.rows:
            for cell in row.cells:
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                cell.paragraphs[0].runs[0].font.name = 'Calibri'
                cell.paragraphs[0].runs[0].font.size = Pt(11)
        
        # Cellules de gauche en gras
        for i in range(4):
            table.cell(i, 0).paragraphs[0].runs[0].font.bold = True
        
        # Saut de page
        self.doc.add_page_break()
    
    def _add_table_of_contents(self):
        """Ajoute une table des matières"""
        logger.info("📑 Ajout de la table des matières")
        
        heading = self.doc.add_paragraph("Table des matières", style='Heading 1')
        
        # Instructions pour Word
        instructions = self.doc.add_paragraph()
        instructions_run = instructions.add_run(
            "Note : Faites un clic droit sur cette zone et sélectionnez "
            "'Mettre à jour les champs' dans Microsoft Word pour générer "
            "la table des matières automatique."
        )
        instructions_run.font.italic = True
        instructions_run.font.size = Pt(9)
        instructions_run.font.color.rgb = RGBColor(107, 114, 128)
        
        # Insertion du champ TOC (Table of Contents)
        paragraph = self.doc.add_paragraph()
        run = paragraph.add_run()
        fldChar = OxmlElement('w:fldChar')
        fldChar.set(qn('w:fldCharType'), 'begin')
        run._r.append(fldChar)
        
        instrText = OxmlElement('w:instrText')
        instrText.set(qn('xml:space'), 'preserve')
        instrText.text = 'TOC \\o "1-3" \\h \\z \\u'
        run._r.append(instrText)
        
        fldChar = OxmlElement('w:fldChar')
        fldChar.set(qn('w:fldCharType'), 'end')
        run._r.append(fldChar)
        
        self.doc.add_page_break()
    
    def _add_overview_section(
        self, 
        metadata: Dict[str, Any], 
        workflow: List[Dict[str, str]], 
        enrichments: Dict[str, Dict[str, str]]
    ):
        """Ajoute la section vue d'ensemble"""
        logger.info("📊 Génération de la vue d'ensemble")
        
        self.doc.add_paragraph("Vue d'ensemble", style='Heading 1')
        
        # Présentation générale
        self.doc.add_paragraph("Présentation générale", style='Heading 2')
        
        intro = self.doc.add_paragraph()
        intro.add_run(
            f"Ce document présente le processus '{metadata.get('nom', 'Processus métier')}' "
            f"version {metadata.get('version', '1.0')}. "
            f"Il a été généré automatiquement par ProcessMate et contient "
            f"une description détaillée de {len(workflow)} étape(s) du workflow, "
            f"incluant les acteurs, départements, outils métier et enrichissements documentaires."
        )
        
        # Statistiques clés
        self.doc.add_paragraph("Statistiques clés", style='Heading 2')
        
        stats = self._calculate_statistics(workflow, enrichments)
        
        table = self.doc.add_table(rows=8, cols=2)
        table.style = 'Light Grid Accent 1'
        
        table.cell(0, 0).text = "Métrique"
        table.cell(0, 1).text = "Valeur"
        
        table.cell(1, 0).text = "Nombre total d'étapes"
        table.cell(1, 1).text = str(stats['total_steps'])
        
        table.cell(2, 0).text = "Tâches (Tasks)"
        table.cell(2, 1).text = str(stats['tasks'])
        
        table.cell(3, 0).text = "Points de décision (Gateways)"
        table.cell(3, 1).text = str(stats['gateways'])
        
        table.cell(4, 0).text = "Événements (Start/End)"
        table.cell(4, 1).text = str(stats['events'])
        
        table.cell(5, 0).text = "Départements distincts"
        table.cell(5, 1).text = str(stats['departments_count'])
        
        table.cell(6, 0).text = "Acteurs distincts"
        table.cell(6, 1).text = str(stats['actors_count'])
        
        table.cell(7, 0).text = "Outils métier distincts"
        table.cell(7, 1).text = str(stats['tools_count'])
        
        # Formater le tableau
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.runs[0].font.name = 'Calibri'
                    paragraph.runs[0].font.size = Pt(10)
        
        # En-tête en gras
        for cell in table.rows[0].cells:
            cell.paragraphs[0].runs[0].font.bold = True
            cell.paragraphs[0].runs[0].font.size = Pt(11)
        
        # Liste des acteurs
        if stats['actors']:
            self.doc.add_paragraph("Liste des acteurs", style='Heading 2')
            for actor in sorted(stats['actors']):
                p = self.doc.add_paragraph(actor, style='List Bullet')
        
        # Liste des départements
        if stats['departments']:
            self.doc.add_paragraph("Liste des départements", style='Heading 2')
            for dept in sorted(stats['departments']):
                p = self.doc.add_paragraph(dept, style='List Bullet')
        
        # Liste des outils
        if stats['tools']:
            self.doc.add_paragraph("Outils métier utilisés", style='Heading 2')
            for tool in sorted(stats['tools']):
                p = self.doc.add_paragraph(tool, style='List Bullet')
        
        self.doc.add_page_break()
    
    def _calculate_statistics(
        self, 
        workflow: List[Dict[str, str]], 
        enrichments: Dict[str, Dict[str, str]]
    ) -> Dict[str, Any]:
        """Calcule les statistiques du workflow"""
        stats = {
            'total_steps': len(workflow),
            'tasks': sum(1 for s in workflow if s['typeBpmn'] == 'Task'),
            'gateways': sum(1 for s in workflow if s['typeBpmn'] == 'ExclusiveGateway'),
            'events': sum(1 for s in workflow if s['typeBpmn'] in ['StartEvent', 'EndEvent']),
            'actors': list(set(s['acteur'] for s in workflow if s['acteur'])),
            'actors_count': len(set(s['acteur'] for s in workflow if s['acteur'])),
            'departments': list(set(s['département'] for s in workflow if s['département'])),
            'departments_count': len(set(s['département'] for s in workflow if s['département'])),
            'tools': list(set(s['outil'] for s in workflow if s['outil'])),
            'tools_count': len(set(s['outil'] for s in workflow if s['outil'])),
            'enrichments_count': len(enrichments)
        }
        return stats
    
    def _insert_bpmn_diagram(self, diagram_base64: str):
        """Insère le diagramme BPMN depuis une chaîne base64"""
        logger.info("🖼️  Insertion du diagramme BPMN")
        
        self.doc.add_paragraph("Diagramme du processus", style='Heading 1')
        
        try:
            # Extraire les données base64
            if diagram_base64.startswith('data:image/png;base64,'):
                base64_data = diagram_base64.split(',')[1]
            else:
                base64_data = diagram_base64
            
            # Décoder
            image_data = base64.b64decode(base64_data)
            
            # Créer un BytesIO
            image_stream = io.BytesIO(image_data)
            
            # Insérer l'image (largeur maximale: 6.5 inches pour A4)
            paragraph = self.doc.add_paragraph()
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
            run = paragraph.add_run()
            run.add_picture(image_stream, width=Inches(6.5))
            
            # Légende
            caption = self.doc.add_paragraph()
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption_run = caption.add_run("Figure 1 - Diagramme BPMN du processus")
            caption_run.font.size = Pt(9)
            caption_run.font.italic = True
            caption_run.font.color.rgb = RGBColor(107, 114, 128)
            
            logger.info(f"✅ Diagramme inséré ({len(image_data)} bytes)")
            
        except Exception as e:
            logger.error(f"❌ Erreur insertion diagramme: {str(e)}")
            error_p = self.doc.add_paragraph()
            error_run = error_p.add_run(
                f"[Erreur lors de l'insertion du diagramme: {str(e)}]"
            )
            error_run.font.color.rgb = RGBColor(239, 68, 68)
            error_run.font.italic = True
        
        self.doc.add_page_break()
    
    def _add_workflow_details_section(
        self, 
        workflow: List[Dict[str, str]], 
        enrichments: Dict[str, Dict[str, str]],
        options: Dict[str, Any]
    ):
        """Ajoute la section de description détaillée des étapes"""
        logger.info("📝 Génération des détails du workflow")
        
        self.doc.add_paragraph("Description détaillée des étapes", style='Heading 1')
        
        include_enrichments = options.get('include_enrichments', True)
        detail_level = options.get('detail_level', 'standard')
        
        for idx, step in enumerate(workflow, start=1):
            self._add_step_detail(step, enrichments.get(step['id']), idx, include_enrichments, detail_level)
        
        logger.info(f"✅ {len(workflow)} étapes détaillées")
    
    def _add_step_detail(
        self, 
        step: Dict[str, str], 
        enrichment: Optional[Dict[str, str]],
        index: int,
        include_enrichments: bool,
        detail_level: str
    ):
        """Ajoute le détail d'une étape"""
        # Titre de l'étape
        step_title = f"{index}. {step['étape']}"
        self.doc.add_paragraph(step_title, style='Heading 2')
        
        # Ligne de séparation visuelle
        separator = self.doc.add_paragraph()
        separator_run = separator.add_run("━" * 60)
        separator_run.font.color.rgb = RGBColor(209, 213, 219)
        
        # Tableau des caractéristiques
        table = self.doc.add_table(rows=4, cols=2)
        table.style = 'Light List Accent 1'
        
        table.cell(0, 0).text = "Type"
        table.cell(0, 1).text = self._get_type_label(step['typeBpmn'])
        
        table.cell(1, 0).text = "Département"
        table.cell(1, 1).text = step.get('département', 'Non spécifié')
        
        table.cell(2, 0).text = "Acteur"
        table.cell(2, 1).text = step.get('acteur', 'Non spécifié')
        
        table.cell(3, 0).text = "Outil(s)"
        table.cell(3, 1).text = step.get('outil', 'Aucun')
        
        # Formater le tableau
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.runs[0].font.name = 'Calibri'
                    paragraph.runs[0].font.size = Pt(10)
        
        # Colonne de gauche en gras
        for i in range(4):
            table.cell(i, 0).paragraphs[0].runs[0].font.bold = True
        
        # DESCRIPTION (enrichissement)
        if include_enrichments and enrichment and enrichment.get('descriptif'):
            self.doc.add_paragraph("DESCRIPTION", style='Heading 3')
            desc_p = self.doc.add_paragraph(enrichment['descriptif'])
        elif step['typeBpmn'] not in ['StartEvent', 'EndEvent']:
            self.doc.add_paragraph("DESCRIPTION", style='Heading 3')
            self.doc.add_paragraph("Aucune description disponible.")
        
        # PARAMÈTRES OPÉRATIONNELS (enrichissement)
        if include_enrichments and enrichment:
            has_params = any([
                enrichment.get('duree_estimee'),
                enrichment.get('frequence'),
                enrichment.get('kpi')
            ])
            
            if has_params:
                self.doc.add_paragraph("PARAMÈTRES OPÉRATIONNELS", style='Heading 3')
                
                if enrichment.get('duree_estimee'):
                    p = self.doc.add_paragraph(style='List Bullet')
                    p.add_run(f"Durée estimée : {enrichment['duree_estimee']}")
                
                if enrichment.get('frequence'):
                    p = self.doc.add_paragraph(style='List Bullet')
                    p.add_run(f"Fréquence : {enrichment['frequence']}")
                
                if enrichment.get('kpi'):
                    p = self.doc.add_paragraph(style='List Bullet')
                    p.add_run(f"KPI : {enrichment['kpi']}")
        
        # FLUX DE PROCESSUS
        self.doc.add_paragraph("FLUX DE PROCESSUS", style='Heading 3')
        
        if step.get('outputOui'):
            next_step_name = self.step_id_to_name.get(step['outputOui'], f"ID {step['outputOui']}")
            p = self.doc.add_paragraph()
            p.add_run("→ Suivant : ").font.bold = True
            p.add_run(next_step_name)
        
        # Si Gateway avec condition
        if step['typeBpmn'] == 'ExclusiveGateway':
            if step.get('condition'):
                self.doc.add_paragraph("CONDITIONS DE DÉCISION", style='Heading 3')
                
                if step.get('outputOui'):
                    yes_name = self.step_id_to_name.get(step['outputOui'], f"ID {step['outputOui']}")
                    p = self.doc.add_paragraph()
                    p.add_run("→ Si Oui : ").font.bold = True
                    p.add_run(f"{step.get('condition', 'Condition')} → {yes_name}")
                
                if step.get('outputNon'):
                    no_name = self.step_id_to_name.get(step['outputNon'], f"ID {step['outputNon']}")
                    p = self.doc.add_paragraph()
                    p.add_run("→ Si Non : ").font.bold = True
                    p.add_run(f"{step.get('condition', 'Condition')} → {no_name}")
        
        # Ligne de séparation
        separator = self.doc.add_paragraph()
        separator_run = separator.add_run("─" * 80)
        separator_run.font.color.rgb = RGBColor(229, 231, 235)
        separator.paragraph_format.space_after = Pt(12)
    
    def _get_type_label(self, type_bpmn: str) -> str:
        """Retourne le label français du type BPMN"""
        labels = {
            'StartEvent': '🟢 Événement de début',
            'EndEvent': '🔴 Événement de fin',
            'Task': '🔷 Tâche',
            'ExclusiveGateway': '🔶 Point de décision'
        }
        return labels.get(type_bpmn, type_bpmn)
    
    def _add_actors_mapping(self, workflow: List[Dict[str, str]]):
        """Ajoute la cartographie des acteurs"""
        logger.info("👥 Génération de la cartographie des acteurs")
        
        self.doc.add_paragraph("Cartographie des acteurs", style='Heading 1')
        
        # Grouper par acteur
        actors_map: Dict[str, List[Dict[str, str]]] = {}
        for step in workflow:
            actor = step.get('acteur', 'Non spécifié')
            if actor not in actors_map:
                actors_map[actor] = []
            actors_map[actor].append(step)
        
        # Créer le tableau
        table = self.doc.add_table(rows=len(actors_map) + 1, cols=4)
        table.style = 'Light Grid Accent 1'
        
        # En-têtes
        headers = table.rows[0].cells
        headers[0].text = "Acteur"
        headers[1].text = "Département"
        headers[2].text = "Nb étapes"
        headers[3].text = "Outils principaux"
        
        # Données
        for idx, (actor, steps) in enumerate(sorted(actors_map.items()), start=1):
            row = table.rows[idx].cells
            
            row[0].text = actor
            
            # Départements (unique)
            depts = list(set(s.get('département', '') for s in steps if s.get('département')))
            row[1].text = ', '.join(depts) if depts else 'Non spécifié'
            
            row[2].text = str(len(steps))
            
            # Outils (unique)
            tools = list(set(s.get('outil', '') for s in steps if s.get('outil')))
            row[3].text = ', '.join(tools[:3]) if tools else 'Aucun'
        
        # Formater le tableau
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.runs[0].font.name = 'Calibri'
                    paragraph.runs[0].font.size = Pt(10)
        
        # En-têtes en gras
        for cell in table.rows[0].cells:
            cell.paragraphs[0].runs[0].font.bold = True
        
        self.doc.add_page_break()
    
    def _add_annexes(
        self, 
        workflow: List[Dict[str, str]], 
        enrichments: Dict[str, Dict[str, str]]
    ):
        """Ajoute les annexes"""
        logger.info("📎 Génération des annexes")
        
        self.doc.add_paragraph("Annexes", style='Heading 1')
        
        # A. Métriques globales
        self.doc.add_paragraph("A. Métriques globales", style='Heading 2')
        
        # Calculer temps total estimé
        total_time_minutes = 0
        time_count = 0
        for enr in enrichments.values():
            if enr.get('duree_estimee'):
                # Parse simple (format "X min", "X h")
                try:
                    time_str = enr['duree_estimee'].lower()
                    if 'h' in time_str:
                        hours = float(time_str.split('h')[0].strip())
                        total_time_minutes += hours * 60
                        time_count += 1
                    elif 'min' in time_str:
                        minutes = float(time_str.split('min')[0].strip())
                        total_time_minutes += minutes
                        time_count += 1
                except:
                    pass
        
        table = self.doc.add_table(rows=5, cols=2)
        table.style = 'Light List Accent 1'
        
        table.cell(0, 0).text = "Métrique"
        table.cell(0, 1).text = "Valeur"
        
        table.cell(1, 0).text = "Temps total estimé"
        if time_count > 0:
            hours = int(total_time_minutes // 60)
            minutes = int(total_time_minutes % 60)
            table.cell(1, 1).text = f"{hours}h {minutes}min"
        else:
            table.cell(1, 1).text = "Non disponible"
        
        table.cell(2, 0).text = "Temps moyen par tâche"
        tasks = sum(1 for s in workflow if s['typeBpmn'] == 'Task')
        if time_count > 0 and tasks > 0:
            avg = total_time_minutes / tasks
            table.cell(2, 1).text = f"{int(avg)} min"
        else:
            table.cell(2, 1).text = "Non disponible"
        
        table.cell(3, 0).text = "Nombre de points de décision"
        gateways = sum(1 for s in workflow if s['typeBpmn'] == 'ExclusiveGateway')
        table.cell(3, 1).text = str(gateways)
        
        table.cell(4, 0).text = "Tâches enrichies"
        table.cell(4, 1).text = f"{len(enrichments)} / {tasks}"
        
        # Formater
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.runs[0].font.name = 'Calibri'
                    paragraph.runs[0].font.size = Pt(10)
        
        for cell in table.rows[0].cells:
            cell.paragraphs[0].runs[0].font.bold = True
        
        # B. Légende des types BPMN
        self.doc.add_paragraph("B. Légende des types BPMN", style='Heading 2')
        
        legend = [
            ("🟢 StartEvent", "Point de départ du processus"),
            ("🔴 EndEvent", "Fin du processus"),
            ("🔷 Task", "Activité à réaliser"),
            ("🔶 ExclusiveGateway", "Point de décision avec branches alternatives")
        ]
        
        for symbol, description in legend:
            p = self.doc.add_paragraph(style='List Bullet')
            p.add_run(f"{symbol} : ").font.bold = True
            p.add_run(description)
        
        # C. Liste complète des outils
        self.doc.add_paragraph("C. Outils métier utilisés", style='Heading 2')
        
        tools_count: Dict[str, int] = {}
        for step in workflow:
            tool = step.get('outil', '').strip()
            if tool:
                tools_count[tool] = tools_count.get(tool, 0) + 1
        
        if tools_count:
            for tool, count in sorted(tools_count.items(), key=lambda x: x[1], reverse=True):
                p = self.doc.add_paragraph(style='List Bullet')
                p.add_run(f"{tool} : ").font.bold = True
                p.add_run(f"{count} utilisation(s)")
        else:
            self.doc.add_paragraph("Aucun outil spécifié.")
        
        logger.info("✅ Annexes générées")