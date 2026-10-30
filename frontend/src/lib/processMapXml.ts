// lib/processMapXml.ts — Carte « Enchaînement des process » d'un thème, en diagramme de
// collaboration BPMN : une rangée par enchaînement (grande fonctionnalité), ses procédures de
// gauche à droite, du début à la fin (bassins BPMN habituels, bpmnGeneratorSimple).
//
// - Une procédure peut figurer dans plusieurs rangées : chaque apparition est un bassin distinct.
// - Entre deux procédures consécutives : flux de message de l'étape qui porte le lien
//   (« Déclenche », « Fait appel à ») vers le début de la suivante ; « Fait appel à » fait aussi
//   de l'étape une activité d'appel. Sans lien enregistré entre elles : flèche « puis ».
// - « Nécessite » n'est pas dans la suite : la procédure nécessaire est un bassin réduit posé
//   sous celle qui en a besoin, relié en pointillé.
// Les rangées sont proposées automatiquement (autoRows) puis modifiables par l'utilisateur.

import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { elementId } from '@/logic/bpmnGraphModel';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import type { Box } from '@/lib/taxonomyApi';

export interface MapProcedure { sid: string; name: string; ref: string; rows: Table1Row[]; category: string; subcategory: string }
export interface MapLink { source: string; target: string; type: LinkType; step_id: string | null }
export interface MapRow { id: string; name: string; sids: string[] }

export const LINK_COLORS: Record<LinkType, string> = { fait_appel_a: '#7c3aed', declenche: '#d97706', necessite: '#64748b' };
export const THEN_COLOR = '#94a3b8';
export const isChain = (t: LinkType) => t !== 'necessite';

/** Une apparition d'une procédure dans une rangée. */
export interface Instance { rowId: string; index: number; sid: string }

export interface ProcessMap {
    xml: string;
    instanceOfPool: Map<string, Instance>;
    poolOf: (rowId: string, index: number) => string;
    rowOfGroup: Map<string, string>;
    groupOfRow: Map<string, string>;
    stepOfElement: Map<string, Instance & { stepId: string }>;
    elementOfStep: (rowId: string, index: number, stepId: string) => string | undefined;
    titles: Map<string, string>;                // bassin → « réf · nom »
    subtitles: Map<string, string>;             // bassin → catégorie
    dependencyOf: Map<string, string>;          // bassin réduit (nécessite) → session_id
    linkTypes: Map<string, LinkType | 'puis'>;
}

const BPMN = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const REF_ATTRS = ['id', 'sourceRef', 'targetRef', 'bpmnElement', 'processRef', 'attachedToRef', 'default', 'calledElement'];
const REF_TEXT = new Set(['flowNodeRef', 'incoming', 'outgoing']);
const GAP_X = 240, GAP_ROWS = 260, ROW_PAD = 60, ROW_LABEL = 170, DEP_GAP = 110, DEP_W = 300, DEP_H = 70;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Rangées proposées ────────────────────────────────────────

/**
 * Une rangée par suite d'enchaînements (« Déclenche », « Fait appel à ») : de chaque procédure
 * qui n'est lancée par aucune autre, on suit les liens jusqu'au bout (une rangée par
 * embranchement). Les procédures sans enchaînement ont leur propre rangée. Nom par défaut : la
 * sous-catégorie de la première procédure, complété si plusieurs rangées la partagent.
 */
export function autoRows(procs: MapProcedure[], links: MapLink[]): MapRow[] {
    const by = new Map(procs.map(p => [p.sid, p]));
    const ref = (s: string) => by.get(s)?.ref || by.get(s)?.name || s;
    const chain = links.filter(l => isChain(l.type) && by.has(l.source) && by.has(l.target) && l.source !== l.target);
    const next = (s: string) => [...new Set(chain.filter(l => l.source === s).map(l => l.target))].sort((a, b) => ref(a).localeCompare(ref(b)));
    const hasIn = new Set(chain.map(l => l.target));
    const paths: string[][] = [];
    const walk = (path: string[]) => {
        const after = next(path[path.length - 1]).filter(n => !path.includes(n));
        if (after.length === 0) paths.push(path);
        else after.forEach(n => walk([...path, n]));
    };
    const sids = procs.map(p => p.sid).sort((a, b) => ref(a).localeCompare(ref(b)));
    sids.filter(s => !hasIn.has(s) && next(s).length > 0).forEach(s => walk([s]));
    const covered = () => new Set(paths.flat());
    sids.filter(s => !covered().has(s) && next(s).length > 0).forEach(s => { if (!covered().has(s)) walk([s]); });
    sids.filter(s => !covered().has(s)).forEach(s => paths.push([s]));
    paths.sort((a, b) => ref(a[0]).localeCompare(ref(b[0])));

    const label = (path: string[]) => {
        const sub = by.get(path[0])!.subcategory.replace(/^[A-Z]\d*\.\s*/, '');
        return path.length === 1 || !sub ? by.get(path[0])!.name : sub;
    };
    const counts = new Map<string, number>();
    paths.forEach(p => counts.set(label(p), (counts.get(label(p)) || 0) + 1));
    return paths.map((path, i) => ({
        id: `row-${i}-${path[0].slice(0, 8)}`,
        name: counts.get(label(path))! > 1 ? `${label(path)} – ${by.get(path[0])!.name}` : label(path),
        sids: path,
    }));
}

/** Rangées enregistrées, sans les procédures disparues, et une rangée pour chaque procédure qui n'en a aucune. */
export function reconcileRows(saved: MapRow[] | undefined, procs: MapProcedure[], links: MapLink[]): MapRow[] {
    if (!saved?.length) return autoRows(procs, links);
    const known = new Set(procs.map(p => p.sid));
    const rows = saved.map(r => ({ ...r, sids: r.sids.filter(s => known.has(s)) })).filter(r => r.sids.length > 0);
    const placed = new Set(rows.flatMap(r => r.sids));
    const missing = procs.filter(p => !placed.has(p.sid));
    if (missing.length) {
        autoRows(missing, links).forEach(r => rows.push({ ...r, id: `${r.id}-${Date.now().toString(36)}` }));
    }
    return rows;
}

// ─── Diagramme ────────────────────────────────────────────────

interface Parsed { inst: Instance; proc: MapProcedure; prefix: string; doc: Document; pool: Box }

function parse(proc: MapProcedure, inst: Instance, prefix: string): Parsed {
    const doc = new DOMParser().parseFromString(generateBPMNSimple(proc.rows, proc.name), 'application/xml');
    doc.querySelectorAll('*').forEach(el => {
        REF_ATTRS.forEach(a => { const v = el.getAttribute(a); if (v) el.setAttribute(a, prefix + v); });
        if (REF_TEXT.has(el.localName) && el.textContent) el.textContent = prefix + el.textContent.trim();
    });
    const shape = [...doc.getElementsByTagNameNS('*', 'BPMNShape')].find(s => s.getAttribute('bpmnElement') === `${prefix}Participant_1`);
    const b = shape?.getElementsByTagNameNS('*', 'Bounds')[0];
    const pool = { x: +(b?.getAttribute('x') ?? 0), y: +(b?.getAttribute('y') ?? 0), width: +(b?.getAttribute('width') ?? 600), height: +(b?.getAttribute('height') ?? 400) };
    return { inst, proc, prefix, doc, pool };
}

function translate(p: Parsed, to: { x: number; y: number }) {
    const dx = to.x - p.pool.x, dy = to.y - p.pool.y;
    p.doc.getElementsByTagNameNS('*', 'BPMNPlane')[0]?.querySelectorAll('*').forEach(el => {
        if (el.localName === 'Bounds' || el.localName === 'waypoint') {
            el.setAttribute('x', String(+(el.getAttribute('x') ?? 0) + dx));
            el.setAttribute('y', String(+(el.getAttribute('y') ?? 0) + dy));
        }
    });
    p.pool = { ...p.pool, x: to.x, y: to.y };
}

export function buildProcessMap(procs: MapProcedure[], links: MapLink[], rows: MapRow[]): ProcessMap {
    const by = new Map(procs.map(p => [p.sid, p]));
    const parsed: Parsed[] = [];
    const instanceOfPool = new Map<string, Instance>();
    const stepOfElement = new Map<string, Instance & { stepId: string }>();
    const titles = new Map<string, string>(), subtitles = new Map<string, string>();
    const dependencyOf = new Map<string, string>();
    const linkTypes = new Map<string, LinkType | 'puis'>();
    const rowOfGroup = new Map<string, string>(), groupOfRow = new Map<string, string>();
    const prefixOf = (r: number, i: number) => `R${r}I${i}_`;
    const rowIndex = new Map(rows.map((r, i) => [r.id, i]));

    const flows: string[] = [], flowShapes: string[] = [], depParticipants: string[] = [], depShapes: string[] = [];
    const categoryValues: string[] = [], groupEls: string[] = [], groupShapes: string[] = [];
    const titleOf = (p: MapProcedure) => `${p.ref ? p.ref + ' · ' : ''}${p.name}`;
    let y = 0, flowN = 0;

    rows.forEach((row, r) => {
        const members = row.sids.map((sid, i) => ({ sid, i })).filter(m => by.get(m.sid)?.rows.length);
        const rowParsed = members.map(({ sid, i }) => parse(by.get(sid)!, { rowId: row.id, index: i, sid }, prefixOf(r, i)));
        const top = y + ROW_LABEL;
        let x = 0;
        rowParsed.forEach(p => { translate(p, { x, y: top }); x += p.pool.width + GAP_X; });
        const poolsBottom = rowParsed.length ? Math.max(...rowParsed.map(p => p.pool.y + p.pool.height)) : top + 200;

        // Procédures nécessaires, réduites sous celle qui en a besoin
        let bottom = poolsBottom;
        rowParsed.forEach(p => {
            const needs = [...new Set(links.filter(l => l.type === 'necessite' && l.source === p.inst.sid && by.has(l.target)).map(l => l.target))];
            needs.forEach((target, k) => {
                const id = `${p.prefix}Need${k}`;
                const box = { x: p.pool.x + k * (DEP_W + 30), y: poolsBottom + DEP_GAP, width: DEP_W, height: DEP_H };
                dependencyOf.set(id, target);
                depParticipants.push(`<participant id="${id}" name="${esc(titleOf(by.get(target)!))}"/>`);
                depShapes.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="true"><dc:Bounds x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/></bpmndi:BPMNShape>`);
                const fid = `Flow_${flowN++}`;
                linkTypes.set(fid, 'necessite');
                flows.push(`<messageFlow id="${fid}" name="${esc(LINK_LABELS.necessite.label)}" sourceRef="${p.prefix}Participant_1" targetRef="${id}"/>`);
                flowShapes.push(`<bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}" bioc:stroke="${LINK_COLORS.necessite}" color:border-color="${LINK_COLORS.necessite}">`
                    + `<di:waypoint x="${box.x + box.width / 2}" y="${p.pool.y + p.pool.height}"/><di:waypoint x="${box.x + box.width / 2}" y="${box.y}"/></bpmndi:BPMNEdge>`);
                bottom = Math.max(bottom, box.y + box.height);
            });
        });

        // Enchaînement : chaque procédure vers la suivante de la rangée
        rowParsed.forEach((a, k) => {
            const b = rowParsed[k + 1];
            if (!b) return;
            const link = links.find(l => isChain(l.type) && l.source === a.inst.sid && l.target === b.inst.sid);
            let sourceId = `${a.prefix}Participant_1`;
            const stepRow = link?.step_id ? a.proc.rows.find(x => x.id === link.step_id) : undefined;
            const stepEl = stepRow && a.prefix + elementId(stepRow.id, stepRow.typeBpmn as any);
            const node = stepEl && [...a.doc.getElementsByTagNameNS(BPMN, '*')].find(n => n.getAttribute('id') === stepEl);
            if (node) {
                sourceId = stepEl!;
                if (link!.type === 'fait_appel_a' && node.localName !== 'callActivity') {
                    const call = a.doc.createElementNS(BPMN, 'callActivity');
                    [...node.attributes].forEach(at => call.setAttribute(at.name, at.value));
                    call.setAttribute('calledElement', `${b.prefix}Process_1`);
                    while (node.firstChild) call.appendChild(node.firstChild);
                    node.parentNode!.replaceChild(call, node);
                }
            }
            const start = b.proc.rows.find(x => x.typeBpmn === 'StartEvent');
            const targetId = start ? b.prefix + elementId(start.id, 'StartEvent') : `${b.prefix}Participant_1`;
            const fid = `Flow_${flowN++}`;
            const type = link?.type ?? 'puis';
            const color = link ? LINK_COLORS[link.type] : THEN_COLOR;
            linkTypes.set(fid, type);
            const midY = a.pool.y + 40;
            flows.push(`<messageFlow id="${fid}" name="${esc(link ? LINK_LABELS[link.type].label : 'puis')}" sourceRef="${sourceId}" targetRef="${targetId}"/>`);
            flowShapes.push(`<bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}" bioc:stroke="${color}" color:border-color="${color}">`
                + `<di:waypoint x="${a.pool.x + a.pool.width}" y="${midY}"/><di:waypoint x="${b.pool.x}" y="${midY}"/></bpmndi:BPMNEdge>`);
        });

        // Cadre et nom de la rangée
        const gid = `Row_${r}`;
        rowOfGroup.set(gid, row.id);
        groupOfRow.set(row.id, gid);
        categoryValues.push(`<categoryValue id="RowValue_${r}" value=""/>`);
        groupEls.push(`<group id="${gid}" categoryValueRef="RowValue_${r}"/>`);
        const width = Math.max(x - GAP_X, 600);
        groupShapes.push(`<bpmndi:BPMNShape id="${gid}_di" bpmnElement="${gid}"><dc:Bounds x="${-ROW_PAD}" y="${y}" width="${width + 2 * ROW_PAD}" height="${bottom - y + ROW_PAD}"/></bpmndi:BPMNShape>`);

        rowParsed.forEach(p => {
            const pool = `${p.prefix}Participant_1`;
            instanceOfPool.set(pool, p.inst);
            titles.set(pool, titleOf(p.proc));
            subtitles.set(pool, p.proc.category);
            p.proc.rows.forEach(s => stepOfElement.set(p.prefix + elementId(s.id, s.typeBpmn as any), { ...p.inst, stepId: s.id }));
        });
        parsed.push(...rowParsed);
        y = bottom + ROW_PAD + GAP_ROWS;
    });

    const ser = new XMLSerializer();
    const participants = parsed.map(p => {
        // Titre affiché au-dessus du bassin (ProcessChainMap), pas dans le bassin
        const el = p.doc.getElementsByTagNameNS(BPMN, 'participant')[0];
        el.removeAttribute('name');
        return ser.serializeToString(el);
    });
    const processes = parsed.map(p => ser.serializeToString(p.doc.getElementsByTagNameNS(BPMN, 'process')[0]));
    const di = parsed.map(p => [...(p.doc.getElementsByTagNameNS('*', 'BPMNPlane')[0]?.children ?? [])].map(c => ser.serializeToString(c)).join(''));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${BPMN}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
  xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" id="ProcessMap" targetNamespace="http://bpmn.io/schema/bpmn">
<category id="Rows">${categoryValues.join('')}</category>
<collaboration id="Collab">${participants.join('')}${depParticipants.join('')}${flows.join('')}${groupEls.join('')}</collaboration>
${processes.join('\n')}
<bpmndi:BPMNDiagram id="ProcessMapDiagram"><bpmndi:BPMNPlane id="ProcessMapPlane" bpmnElement="Collab">
${groupShapes.join('')}${di.join('\n')}${depShapes.join('')}${flowShapes.join('')}
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`;

    return {
        xml, instanceOfPool, stepOfElement, titles, subtitles, dependencyOf, linkTypes, rowOfGroup, groupOfRow,
        poolOf: (rowId, index) => `${prefixOf(rowIndex.get(rowId) ?? -1, index)}Participant_1`,
        elementOfStep: (rowId, index, stepId) => {
            const sid = rows[rowIndex.get(rowId) ?? -1]?.sids[index];
            const s = sid ? by.get(sid)?.rows.find(x => x.id === stepId) : undefined;
            return s ? prefixOf(rowIndex.get(rowId)!, index) + elementId(s.id, s.typeBpmn as any) : undefined;
        },
    };
}
