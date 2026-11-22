/**
 * Téléchargements d'une procédure, pensés pour l'usage et non pour la technique :
 *  - Fiche procédure (Word, format de la fiche CIH) : le livrable ;
 *  - Logigramme (image PNG) : à coller dans un document ou une présentation ;
 *  - Tableau détaillé (Excel .xlsx) : étapes, descriptifs et sources ;
 *  - Fichier BPMN : pour un outil de modélisation.
 * Tout se fait à partir de la procédure elle-même (pas de l'onglet affiché) : marche depuis n'importe quel onglet,
 * toujours sur le logigramme métier (jamais la Vue IT), et pour plusieurs procédures à la fois (« Tout télécharger »).
 */
import * as XLSX from 'xlsx';
import { API_CONFIG } from '@/lib/api-config';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import type { Table1Row } from '@/logic/types';
import type { TaskEnrichment } from '@/logic/bpmnTypes';
import { DEFAULT_CIH_METADATA } from '@/components/DocumentExportPanel';

export interface ExportableProcedure {
    title: string;
    workflow: Table1Row[];
    enrichments: Map<string, TaskEnrichment> | Record<string, TaskEnrichment>;
    /** métadonnées rédigées (objet, périmètre, acteurs…), celles de la fiche */
    metadata?: Record<string, unknown> | null;
    /** logigramme métier (avec la mise en page manuelle s'il y en a une) */
    bpmnXml?: string | null;
}

export type ExportKind = 'word' | 'png' | 'xlsx' | 'bpmn';

export const EXPORT_LABELS: Record<ExportKind, string> = {
    word: 'Fiche procédure (Word)',
    png: 'Logigramme (image)',
    xlsx: 'Tableau détaillé (Excel)',
    bpmn: 'Fichier BPMN (outil de modélisation)',
};

const enrichmentsOf = (p: ExportableProcedure): Record<string, TaskEnrichment> =>
    p.enrichments instanceof Map ? Object.fromEntries(p.enrichments) : (p.enrichments || {});

export function fileName(title: string, ext: string): string {
    const base = (title || 'procedure').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'procedure';
    return `${base}.${ext}`;
}

export function saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Logigramme métier de la procédure (celui affiché, sinon recalculé depuis le tableau) */
export function businessXml(p: ExportableProcedure): string {
    return p.bpmnXml || generateBPMNSimple(p.workflow, p.title) || '';
}

/** Dessine le logigramme hors écran (aucun onglet à ouvrir) et renvoie son SVG */
export async function diagramSvg(p: ExportableProcedure): Promise<string> {
    const xml = businessXml(p);
    if (!xml) throw new Error('Aucune étape : pas de logigramme à dessiner.');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1000px;';
    document.body.appendChild(host);
    const Viewer = (await import('bpmn-js/lib/Viewer')).default;
    const viewer = new Viewer({ container: host });
    try {
        await viewer.importXML(xml);
        const { svg } = await viewer.saveSVG();
        return svg;
    } finally {
        viewer.destroy();
        host.remove();
    }
}

/** Image PNG (fond blanc, deux fois la résolution d'écran : nette une fois collée dans Word) */
export async function diagramPng(p: ExportableProcedure): Promise<Blob> {
    const svg = await diagramSvg(p);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Logigramme illisible'));
            i.src = url;
        });
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(img.width * scale); canvas.height = Math.ceil(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Image impossible'))), 'image/png'));
    } finally {
        URL.revokeObjectURL(url);
    }
}

const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(b);
});

/** Tableau détaillé : un vrai classeur Excel (étapes avec descriptifs et sources, puis la fiche) */
export function tableXlsx(p: ExportableProcedure): Blob {
    const enr = enrichmentsOf(p);
    const rows = p.workflow.map(r => {
        const e = enr[r.id] || ({} as TaskEnrichment);
        return {
            'N°': r.id, 'Étape': r.étape, 'Type': r.typeBpmn, 'Département': r.département || '', 'Acteur': r.acteur || '',
            'Interne / externe': r.typeActeur || '', 'Outil': r.outil || '', 'Condition': r.condition || '',
            'Suite': (r.outputs || []).map(o => (o.label ? `${o.targetId} (${o.label})` : o.targetId)).join(', '),
            'Descriptif': e.descriptif || '',
            'Source': e.source?.fichier ? [e.source.fichier, e.source.endroit].filter(Boolean).join(' · ') : '',
            'Extrait de la source': e.source?.extrait || '',
        };
    });
    const wb = XLSX.utils.book_new();
    const steps = XLSX.utils.json_to_sheet(rows);
    steps['!cols'] = [6, 42, 14, 22, 26, 12, 18, 22, 18, 60, 30, 50].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, steps, 'Étapes');
    const m = (p.metadata || {}) as Record<string, unknown>;
    const text = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(' ; ') : v ? String(v) : '');
    const fiche = [
        ['Procédure', p.title], ['Objet', text(m.objet)], ['Périmètre', text(m.perimeter || m.perimetre)],
        ['Acteurs internes', text(m.responsabilites_internes)], ['Acteurs externes', text(m.responsabilites_externes)],
        ['Références', text(m.references)], ['Règles de gestion', text(m.regles_gestion)],
    ].filter(([, v]) => v);
    const sheet = XLSX.utils.aoa_to_sheet([['Rubrique', 'Contenu'], ...fiche]);
    sheet['!cols'] = [{ wch: 22 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Fiche');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Fiche procédure Word (format CIH), produite par le serveur — sans intelligence artificielle */
export async function ficheWord(p: ExportableProcedure, png?: Blob | null): Promise<Blob> {
    const raw = (p.metadata || {}) as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
    const metadata = {
        ...DEFAULT_CIH_METADATA,
        ...Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in DEFAULT_CIH_METADATA && v !== null && v !== undefined && v !== '')),
        nom: String(raw.nom || p.title || 'Procédure'),
        perimeter: String(raw.perimeter || raw.perimetre || ''),
        regles_gestion: Array.isArray(raw.regles_gestion) ? raw.regles_gestion.join('\n') : String(raw.regles_gestion || ''),
        responsabilites_internes: list(raw.responsabilites_internes),
        responsabilites_externes: list(raw.responsabilites_externes),
        definitions: Array.isArray(raw.definitions) ? raw.definitions : [],
        abbreviations: Array.isArray(raw.abbreviations) ? raw.abbreviations : [],
        annexe: Array.isArray(raw.annexe) ? raw.annexe : [],
    };
    const image = png ?? await diagramPng(p).catch(() => null);
    const res = await fetch(API_CONFIG.getFullUrl(API_CONFIG.endpoints.docGenerate), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            metadata, workflow: p.workflow, enrichments: enrichmentsOf(p),
            diagram_image: image ? await blobToDataUrl(image) : null,
            options: { include_diagram: !!image, include_enrichments: true, include_annexes: true, detail_level: 'standard' },
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'La fiche Word n’a pas pu être produite.');
    }
    const doc = await res.json();
    const file = await fetch(API_CONFIG.getFullUrl(doc.download_url));
    if (!file.ok) throw new Error('La fiche Word n’a pas pu être téléchargée.');
    return await file.blob();
}

/** Un téléchargement d'une procédure */
export async function exportOne(p: ExportableProcedure, kind: ExportKind): Promise<void> {
    if (p.workflow.length === 0) throw new Error('La procédure n’a pas encore d’étapes.');
    if (kind === 'png') return saveBlob(await diagramPng(p), fileName(p.title, 'png'));
    if (kind === 'xlsx') return saveBlob(tableXlsx(p), fileName(p.title, 'xlsx'));
    if (kind === 'bpmn') return saveBlob(new Blob([businessXml(p)], { type: 'application/xml' }), fileName(p.title, 'bpmn'));
    return saveBlob(await ficheWord(p), fileName(p.title, 'docx'));
}

/** « Tout télécharger » : une archive avec, pour chaque procédure, sa fiche Word, son logigramme et son tableau */
export async function exportAll(procs: ExportableProcedure[], archiveTitle: string,
    onProgress?: (done: number, total: number, title: string) => void): Promise<{ ok: number; failed: string[] }> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const failed: string[] = [];
    const used = new Set<string>();
    let ok = 0;
    for (const [i, p] of procs.entries()) {
        onProgress?.(i, procs.length, p.title);
        let folder = fileName(p.title, '').replace(/\.$/, '');
        while (used.has(folder)) folder += ' (2)';
        used.add(folder);
        try {
            const png = await diagramPng(p);
            zip.file(`${folder}/${fileName(p.title, 'png')}`, png);
            zip.file(`${folder}/${fileName(p.title, 'xlsx')}`, tableXlsx(p));
            zip.file(`${folder}/${fileName(p.title, 'docx')}`, await ficheWord(p, png));
            ok++;
        } catch {
            failed.push(p.title);
        }
    }
    onProgress?.(procs.length, procs.length, '');
    if (ok > 0) saveBlob(await zip.generateAsync({ type: 'blob' }), fileName(archiveTitle || 'Procédures', 'zip'));
    return { ok, failed };
}
