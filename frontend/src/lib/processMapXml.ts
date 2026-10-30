// lib/processMapXml.ts — Diagramme de collaboration BPMN d'un thème : un bassin par procédure
// (son BPMN habituel, bpmnGeneratorSimple), regroupés par catégorie, reliés par leurs liens.
//
// - « Fait appel à » : l'étape devient une activité d'appel (bord épais) + flux de message
//   vers le début de la procédure appelée ;
// - « Déclenche » : flux de message de l'étape vers le début de la procédure déclenchée ;
// - « Nécessite » : flux de message de bassin à bassin (pas d'équivalent BPMN exact).
// Les identifiants de chaque procédure sont préfixés pour cohabiter dans un même diagramme.

import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { elementId } from '@/logic/bpmnGraphModel';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import type { Box } from '@/lib/taxonomyApi';

export interface MapProcedure { sid: string; name: string; ref: string; rows: Table1Row[]; cluster: string }
export interface MapLink { source: string; target: string; type: LinkType; step_id: string | null }

export const LINK_COLORS: Record<LinkType, string> = { fait_appel_a: '#7c3aed', declenche: '#d97706', necessite: '#0284c7' };

export interface ProcessMap {
    xml: string;
    poolOf: Map<string, string>;                                  // session_id → id du bassin
    sidOfPool: Map<string, string>;
    stepOfElement: Map<string, { sid: string; stepId: string }>;
    elementOfStep: (sid: string, stepId: string) => string | undefined;
    groups: Map<string, string[]>;                                // id du groupe → session_ids
    titles: Map<string, string>;                                  // id du bassin ou du groupe → titre affiché
}

const BPMN = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const REF_ATTRS = ['id', 'sourceRef', 'targetRef', 'bpmnElement', 'processRef', 'attachedToRef', 'default', 'calledElement'];
const REF_TEXT = new Set(['flowNodeRef', 'incoming', 'outgoing']);
const GAP_X = 160, GAP_Y = 260, GROUP_PAD = 50, GROUP_LABEL = 50;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Parsed { proc: MapProcedure; prefix: string; doc: Document; pool: Box }

function parse(proc: MapProcedure, index: number): Parsed {
    const prefix = `P${index}_`;
    const doc = new DOMParser().parseFromString(generateBPMNSimple(proc.rows, proc.name), 'application/xml');
    doc.querySelectorAll('*').forEach(el => {
        REF_ATTRS.forEach(a => { const v = el.getAttribute(a); if (v) el.setAttribute(a, prefix + v); });
        if (REF_TEXT.has(el.localName) && el.textContent) el.textContent = prefix + el.textContent.trim();
    });
    const shape = [...doc.getElementsByTagNameNS('*', 'BPMNShape')].find(s => s.getAttribute('bpmnElement') === `${prefix}Participant_1`);
    const b = shape?.getElementsByTagNameNS('*', 'Bounds')[0];
    const pool = { x: +(b?.getAttribute('x') ?? 0), y: +(b?.getAttribute('y') ?? 0), width: +(b?.getAttribute('width') ?? 600), height: +(b?.getAttribute('height') ?? 400) };
    return { proc, prefix, doc, pool };
}

function translate(p: Parsed, to: { x: number; y: number }) {
    const dx = to.x - p.pool.x, dy = to.y - p.pool.y;
    const plane = p.doc.getElementsByTagNameNS('*', 'BPMNPlane')[0];
    plane?.querySelectorAll('*').forEach(el => {
        if (el.localName === 'Bounds' || el.localName === 'waypoint') {
            el.setAttribute('x', String(+(el.getAttribute('x') ?? 0) + dx));
            el.setAttribute('y', String(+(el.getAttribute('y') ?? 0) + dy));
        }
    });
    p.pool = { ...p.pool, x: to.x, y: to.y };
}

/** Disposition par défaut : une rangée par catégorie, ses procédures côte à côte. */
function autoLayout(parsed: Parsed[], below = 0): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const clusters = new Map<string, Parsed[]>();
    parsed.forEach(p => clusters.set(p.proc.cluster, [...(clusters.get(p.proc.cluster) || []), p]));
    let y = below;
    [...clusters.keys()].sort((a, b) => a.localeCompare(b)).forEach(key => {
        const members = clusters.get(key)!.sort((a, b) => (a.proc.ref || a.proc.name).localeCompare(b.proc.ref || b.proc.name));
        let x = 0;
        y += GROUP_PAD + GROUP_LABEL;
        members.forEach(p => { out.set(p.proc.sid, { x, y }); x += p.pool.width + GAP_X; });
        y += Math.max(...members.map(p => p.pool.height)) + GROUP_PAD + GAP_Y;
    });
    return out;
}

function bboxOf(boxes: Box[]): Box {
    const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
    return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}

export function groupBounds(pools: Box[]): Box {
    const b = bboxOf(pools);
    return { x: b.x - GROUP_PAD, y: b.y - GROUP_PAD - GROUP_LABEL, width: b.width + 2 * GROUP_PAD, height: b.height + 2 * GROUP_PAD + GROUP_LABEL };
}

/**
 * @param saved positions enregistrées (session_id → bassin) ; les procédures sans position
 *              enregistrée sont rangées par catégorie sous les autres.
 */
export function buildProcessMap(procs: MapProcedure[], links: MapLink[], saved?: Record<string, Box>): ProcessMap {
    const parsed = procs.filter(p => p.rows.length > 0).map(parse);
    const placed = parsed.filter(p => saved?.[p.proc.sid]);
    placed.forEach(p => translate(p, saved![p.proc.sid]));
    const rest = parsed.filter(p => !saved?.[p.proc.sid]);
    const bottom = placed.length ? Math.max(...placed.map(p => p.pool.y + p.pool.height)) + GAP_Y : 0;
    const auto = autoLayout(rest, bottom);
    rest.forEach(p => translate(p, auto.get(p.proc.sid)!));

    const bySid = new Map(parsed.map(p => [p.proc.sid, p]));
    const poolOf = new Map(parsed.map(p => [p.proc.sid, `${p.prefix}Participant_1`]));
    const stepOfElement = new Map<string, { sid: string; stepId: string }>();
    parsed.forEach(p => p.proc.rows.forEach(r => stepOfElement.set(p.prefix + elementId(r.id, r.typeBpmn as any), { sid: p.proc.sid, stepId: r.id })));
    const elementOfStep = (sid: string, stepId: string) => {
        const p = bySid.get(sid);
        const r = p?.proc.rows.find(x => x.id === stepId);
        return p && r ? p.prefix + elementId(r.id, r.typeBpmn as any) : undefined;
    };
    const startOf = (p: Parsed) => {
        const r = p.proc.rows.find(x => x.typeBpmn === 'StartEvent');
        return r ? p.prefix + elementId(r.id, 'StartEvent') : `${p.prefix}Participant_1`;
    };
    const boundsOf = (p: Parsed, id: string): Box => {
        const shape = [...p.doc.getElementsByTagNameNS('*', 'BPMNShape')].find(s => s.getAttribute('bpmnElement') === id);
        const b = shape?.getElementsByTagNameNS('*', 'Bounds')[0];
        return b ? { x: +b.getAttribute('x')!, y: +b.getAttribute('y')!, width: +b.getAttribute('width')!, height: +b.getAttribute('height')! } : p.pool;
    };

    // Liens
    const flows: string[] = [], flowShapes: string[] = [];
    links.forEach((l, i) => {
        const from = bySid.get(l.source), to = bySid.get(l.target);
        if (!from || !to || from === to) return;
        let sourceId = `${from.prefix}Participant_1`;
        if (l.type !== 'necessite' && l.step_id) {
            const el = elementOfStep(l.source, l.step_id);
            const node = el && [...from.doc.getElementsByTagNameNS(BPMN, '*')].find(n => n.getAttribute('id') === el);
            if (node) {
                sourceId = el!;
                // « Fait appel à » : l'étape devient une activité d'appel de l'autre procédure
                if (l.type === 'fait_appel_a' && node.localName !== 'callActivity') {
                    const call = from.doc.createElementNS(BPMN, 'callActivity');
                    [...node.attributes].forEach(a => call.setAttribute(a.name, a.value));
                    call.setAttribute('calledElement', `${to.prefix}Process_1`);
                    while (node.firstChild) call.appendChild(node.firstChild);
                    node.parentNode!.replaceChild(call, node);
                }
            }
        }
        const targetId = l.type === 'necessite' ? `${to.prefix}Participant_1` : startOf(to);
        const a = boundsOf(from, sourceId), b = boundsOf(to, targetId);
        const id = `Link_${i}`;
        flows.push(`<messageFlow id="${id}" name="${esc(LINK_LABELS[l.type].label)}" sourceRef="${sourceId}" targetRef="${targetId}"/>`);
        flowShapes.push(`<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}" bioc:stroke="${LINK_COLORS[l.type]}" color:border-color="${LINK_COLORS[l.type]}">`
            + `<di:waypoint x="${a.x + a.width / 2}" y="${a.y + a.height / 2}"/><di:waypoint x="${b.x + b.width / 2}" y="${b.y + b.height / 2}"/></bpmndi:BPMNEdge>`);
    });

    // Grappes : un groupe BPMN par catégorie, autour de ses procédures
    const groups = new Map<string, string[]>();
    const titles = new Map<string, string>();
    const categoryValues: string[] = [], groupEls: string[] = [], groupShapes: string[] = [];
    const clusters = new Map<string, Parsed[]>();
    parsed.forEach(p => clusters.set(p.proc.cluster, [...(clusters.get(p.proc.cluster) || []), p]));
    [...clusters.entries()].forEach(([label, members], k) => {
        const id = `Cluster_${k}`;
        groups.set(id, members.map(m => m.proc.sid));
        titles.set(id, label);
        categoryValues.push(`<categoryValue id="ClusterValue_${k}" value=""/>`);
        groupEls.push(`<group id="${id}" categoryValueRef="ClusterValue_${k}"/>`);
        const g = groupBounds(members.map(m => m.pool));
        groupShapes.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}"/></bpmndi:BPMNShape>`);
    });

    const ser = new XMLSerializer();
    const participants = parsed.map(p => {
        // Titre affiché au-dessus du bassin (ProcessChainMap) : dans le bassin, il chevaucherait
        // le nom du premier couloir
        const el = p.doc.getElementsByTagNameNS(BPMN, 'participant')[0];
        el.removeAttribute('name');
        titles.set(`${p.prefix}Participant_1`, `${p.proc.ref ? p.proc.ref + ' · ' : ''}${p.proc.name}`);
        return ser.serializeToString(el);
    });
    const processes = parsed.map(p => ser.serializeToString(p.doc.getElementsByTagNameNS(BPMN, 'process')[0]));
    const di = parsed.map(p => [...(p.doc.getElementsByTagNameNS('*', 'BPMNPlane')[0]?.children ?? [])].map(c => ser.serializeToString(c)).join(''));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="${BPMN}" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
  xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" id="ProcessMap" targetNamespace="http://bpmn.io/schema/bpmn">
<category id="Clusters">${categoryValues.join('')}</category>
<collaboration id="Collab">${participants.join('')}${flows.join('')}${groupEls.join('')}</collaboration>
${processes.join('\n')}
<bpmndi:BPMNDiagram id="ProcessMapDiagram"><bpmndi:BPMNPlane id="ProcessMapPlane" bpmnElement="Collab">
${groupShapes.join('')}${di.join('\n')}${flowShapes.join('')}
</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`;

    return { xml, poolOf, sidOfPool: new Map([...poolOf].map(([s, p]) => [p, s])), stepOfElement, elementOfStep, groups, titles };
}
