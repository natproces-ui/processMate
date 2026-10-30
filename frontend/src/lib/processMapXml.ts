// lib/processMapXml.ts — Diagramme de collaboration BPMN d'un thème : un bassin par procédure
// (son BPMN habituel, bpmnGeneratorSimple), reliés par leurs liens.
//
// Deux natures de liens :
// - enchaînement (« Déclenche », « Fait appel à ») : une procédure en lance une autre. Flux de
//   message de l'étape vers le début de l'autre ; « Fait appel à » fait aussi de l'étape une
//   activité d'appel (bord épais) ;
// - liaison (« Nécessite ») : dépendance sans ordre, flux de message de bassin à bassin.
// Les procédures reliées forment un groupement (groupe BPMN), nommé d'après sa procédure
// centrale (la plus liée) ou du nom choisi par l'utilisateur. Les identifiants de chaque
// procédure sont préfixés pour cohabiter dans un même diagramme.

import type { Table1Row } from '@/logic/types';
import { generateBPMNSimple } from '@/logic/bpmnGeneratorSimple';
import { elementId } from '@/logic/bpmnGraphModel';
import { LINK_LABELS, type LinkType } from '@/lib/processLinks';
import type { Box } from '@/lib/taxonomyApi';

export interface MapProcedure { sid: string; name: string; ref: string; rows: Table1Row[]; category: string }
export interface MapLink { source: string; target: string; type: LinkType; step_id: string | null }

export const LINK_COLORS: Record<LinkType, string> = { fait_appel_a: '#7c3aed', declenche: '#d97706', necessite: '#64748b' };
export const isChain = (t: LinkType) => t !== 'necessite';

export interface ProcessMap {
    xml: string;
    poolOf: Map<string, string>;                                  // session_id → id du bassin
    sidOfPool: Map<string, string>;
    stepOfElement: Map<string, { sid: string; stepId: string }>;
    elementOfStep: (sid: string, stepId: string) => string | undefined;
    groups: Map<string, string[]>;                                // id du groupe → session_ids
    groupKey: Map<string, string>;                                // id du groupe → session_id de sa procédure centrale
    titles: Map<string, string>;                                  // id du bassin ou du groupe → titre
    subtitles: Map<string, string>;                               // id du bassin → catégorie
    linkTypes: Map<string, LinkType>;                             // id du flux → type de lien
}

const BPMN = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
const REF_ATTRS = ['id', 'sourceRef', 'targetRef', 'bpmnElement', 'processRef', 'attachedToRef', 'default', 'calledElement'];
const REF_TEXT = new Set(['flowNodeRef', 'incoming', 'outgoing']);
const GAP_X = 220, GAP_Y = 200, GAP_GROUPS = 500, GROUP_PAD = 60, GROUP_LABEL = 60;

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
    p.doc.getElementsByTagNameNS('*', 'BPMNPlane')[0]?.querySelectorAll('*').forEach(el => {
        if (el.localName === 'Bounds' || el.localName === 'waypoint') {
            el.setAttribute('x', String(+(el.getAttribute('x') ?? 0) + dx));
            el.setAttribute('y', String(+(el.getAttribute('y') ?? 0) + dy));
        }
    });
    p.pool = { ...p.pool, x: to.x, y: to.y };
}

/** Ensembles de procédures reliées (liens dans les deux sens), du plus grand au plus petit. */
function components(sids: string[], links: MapLink[]): string[][] {
    const adj = new Map(sids.map(s => [s, new Set<string>()]));
    links.forEach(l => { if (adj.has(l.source) && adj.has(l.target)) { adj.get(l.source)!.add(l.target); adj.get(l.target)!.add(l.source); } });
    const seen = new Set<string>(), out: string[][] = [];
    sids.forEach(s => {
        if (seen.has(s)) return;
        const comp: string[] = [], stack = [s];
        seen.add(s);
        while (stack.length) { const u = stack.pop()!; comp.push(u); adj.get(u)!.forEach(v => { if (!seen.has(v)) { seen.add(v); stack.push(v); } }); }
        out.push(comp);
    });
    return out.sort((a, b) => b.length - a.length);
}

/** Procédure centrale : la plus liée (à égalité, la plus nécessitée). */
function hubOf(comp: string[], links: MapLink[], refOf: (s: string) => string): string {
    const score = (s: string) => {
        const deg = links.filter(l => l.source === s || l.target === s).length;
        const needed = links.filter(l => l.target === s && l.type === 'necessite').length;
        return deg * 100 + needed;
    };
    return [...comp].sort((a, b) => score(b) - score(a) || refOf(a).localeCompare(refOf(b)))[0];
}

/**
 * Disposition d'un groupement, lue de gauche à droite : procédure centrale au milieu, ce qui
 * passe avant elle à gauche, ce qui passe après à droite. « A déclenche / fait appel à B » : A
 * avant B ; « A nécessite B » : B avant A. Chaque procédure est à hauteur de celle par laquelle
 * on l'atteint, sous les procédures déjà placées dans sa colonne.
 */
function layoutComponent(comp: string[], hub: string, links: MapLink[], sizeOf: (s: string) => Box, refOf: (s: string) => string) {
    const col = new Map<string, number>([[hub, 0]]);
    const parent = new Map<string, string>();
    const order: string[] = [hub];
    const neighbours = (u: string) => links
        .filter(l => (l.source === u || l.target === u) && comp.includes(l.source) && comp.includes(l.target))
        .map(l => {
            const v = l.source === u ? l.target : l.source;
            return { v, before: isChain(l.type) ? l.source === v : l.target === v };
        })
        .sort((a, b) => refOf(a.v).localeCompare(refOf(b.v)));
    for (let i = 0; i < order.length; i++) {
        const u = order[i], cu = col.get(u)!;
        neighbours(u).forEach(({ v, before }) => {
            if (col.has(v)) return;
            col.set(v, before ? cu - 1 : cu + 1);
            parent.set(v, u);
            order.push(v);
        });
    }
    // Hauteurs : la centrale à 0, ses voisines centrées sur elle, les autres à hauteur de leur parente
    const y = new Map<string, number>([[hub, 0]]);
    const hubBox = sizeOf(hub);
    const cursor = new Map<number, number>([[0, hubBox.height + GAP_Y]]);
    [-1, 1].forEach(c => {
        const ring = order.filter(s => col.get(s) === c && parent.get(s) === hub);
        const total = ring.reduce((t, s) => t + sizeOf(s).height, 0) + GAP_Y * Math.max(ring.length - 1, 0);
        cursor.set(c, hubBox.height / 2 - total / 2);
    });
    order.slice(1).forEach(s => {
        const c = col.get(s)!;
        const wanted = parent.get(s) === hub && Math.abs(c) === 1 ? -Infinity : y.get(parent.get(s)!) ?? 0;
        const at = Math.max(wanted, cursor.get(c) ?? -Infinity);
        y.set(s, at === -Infinity ? 0 : at);
        cursor.set(c, (at === -Infinity ? 0 : at) + sizeOf(s).height + GAP_Y);
    });
    // Abscisses : largeur de chaque colonne = sa procédure la plus large
    const cols = [...new Set(col.values())].sort((a, b) => a - b);
    const widths = new Map(cols.map(c => [c, Math.max(...order.filter(s => col.get(s) === c).map(s => sizeOf(s).width))]));
    const xOf = new Map<number, number>();
    let x = 0;
    cols.forEach(c => { xOf.set(c, x); x += widths.get(c)! + GAP_X; });
    const pos = new Map(order.map(s => [s, { x: xOf.get(col.get(s)!)! + (widths.get(col.get(s)!)! - sizeOf(s).width) / 2, y: y.get(s)! }]));
    const minY = Math.min(...[...pos.values()].map(p => p.y));
    pos.forEach(p => { p.y -= minY; });
    return { pos, width: x - GAP_X, height: Math.max(...order.map(s => pos.get(s)!.y + sizeOf(s).height)) };
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
 * @param saved      positions enregistrées (session_id → bassin) ; les autres procédures sont
 *                   disposées automatiquement sous celles-ci.
 * @param groupNames noms donnés aux groupements (session_id de la procédure centrale → nom).
 */
export function buildProcessMap(procs: MapProcedure[], links: MapLink[], saved?: Record<string, Box>, groupNames?: Record<string, string>): ProcessMap {
    const parsed = procs.filter(p => p.rows.length > 0).map(parse);
    const bySid = new Map(parsed.map(p => [p.proc.sid, p]));
    const refOf = (s: string) => bySid.get(s)?.proc.ref || bySid.get(s)?.proc.name || s;
    const sizeOf = (s: string) => bySid.get(s)!.pool;
    links = links.filter(l => bySid.has(l.source) && bySid.has(l.target) && l.source !== l.target);
    const comps = components(parsed.map(p => p.proc.sid), links);
    const hubs = new Map(comps.map(c => [c, hubOf(c, links, refOf)]));

    // Positions : enregistrées, sinon disposition automatique (groupements côte à côte, puis
    // les procédures seules), sous les procédures déjà placées
    const placed = parsed.filter(p => saved?.[p.proc.sid]);
    placed.forEach(p => translate(p, saved![p.proc.sid]));
    const todo = new Set(parsed.filter(p => !saved?.[p.proc.sid]).map(p => p.proc.sid));
    let ox = 0;
    const oy = placed.length ? Math.max(...placed.map(p => p.pool.y + p.pool.height)) + GAP_GROUPS : 0;
    comps.forEach(comp => {
        const rest = comp.filter(s => todo.has(s));
        if (rest.length === 0) return;
        const hub = rest.includes(hubs.get(comp)!) ? hubs.get(comp)! : hubOf(rest, links, refOf);
        const { pos, width } = layoutComponent(rest, hub, links, sizeOf, refOf);
        pos.forEach((p, s) => translate(bySid.get(s)!, { x: ox + p.x, y: oy + GROUP_PAD + GROUP_LABEL + p.y }));
        ox += width + GAP_GROUPS;
    });

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
    const linkTypes = new Map<string, LinkType>();
    const flows: string[] = [], flowShapes: string[] = [];
    links.forEach((l, i) => {
        const from = bySid.get(l.source)!, to = bySid.get(l.target)!;
        let sourceId = `${from.prefix}Participant_1`;
        if (isChain(l.type) && l.step_id) {
            const el = elementOfStep(l.source, l.step_id);
            const node = el && [...from.doc.getElementsByTagNameNS(BPMN, '*')].find(n => n.getAttribute('id') === el);
            if (node) {
                sourceId = el!;
                if (l.type === 'fait_appel_a' && node.localName !== 'callActivity') {
                    const call = from.doc.createElementNS(BPMN, 'callActivity');
                    [...node.attributes].forEach(a => call.setAttribute(a.name, a.value));
                    call.setAttribute('calledElement', `${to.prefix}Process_1`);
                    while (node.firstChild) call.appendChild(node.firstChild);
                    node.parentNode!.replaceChild(call, node);
                }
            }
        }
        const targetId = isChain(l.type) ? startOf(to) : `${to.prefix}Participant_1`;
        const a = boundsOf(from, sourceId), b = boundsOf(to, targetId);
        const id = `Link_${i}`;
        linkTypes.set(id, l.type);
        flows.push(`<messageFlow id="${id}" name="${esc(LINK_LABELS[l.type].label)}" sourceRef="${sourceId}" targetRef="${targetId}"/>`);
        flowShapes.push(`<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}" bioc:stroke="${LINK_COLORS[l.type]}" color:border-color="${LINK_COLORS[l.type]}">`
            + `<di:waypoint x="${a.x + a.width / 2}" y="${a.y + a.height / 2}"/><di:waypoint x="${b.x + b.width / 2}" y="${b.y + b.height / 2}"/></bpmndi:BPMNEdge>`);
    });

    // Groupements : un groupe BPMN autour de chaque ensemble d'au moins deux procédures reliées
    const groups = new Map<string, string[]>(), groupKey = new Map<string, string>();
    const titles = new Map<string, string>(), subtitles = new Map<string, string>();
    const categoryValues: string[] = [], groupEls: string[] = [], groupShapes: string[] = [];
    comps.filter(c => c.length > 1).forEach((comp, k) => {
        const id = `Cluster_${k}`, hub = hubs.get(comp)!;
        groups.set(id, comp);
        groupKey.set(id, hub);
        titles.set(id, groupNames?.[hub] || bySid.get(hub)!.proc.name);
        categoryValues.push(`<categoryValue id="ClusterValue_${k}" value=""/>`);
        groupEls.push(`<group id="${id}" categoryValueRef="ClusterValue_${k}"/>`);
        const g = groupBounds(comp.map(s => bySid.get(s)!.pool));
        groupShapes.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"><dc:Bounds x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}"/></bpmndi:BPMNShape>`);
    });

    const ser = new XMLSerializer();
    const participants = parsed.map(p => {
        // Titre affiché au-dessus du bassin (ProcessChainMap) : dans le bassin, il chevaucherait
        // le nom du premier couloir
        const el = p.doc.getElementsByTagNameNS(BPMN, 'participant')[0];
        el.removeAttribute('name');
        titles.set(`${p.prefix}Participant_1`, `${p.proc.ref ? p.proc.ref + ' · ' : ''}${p.proc.name}`);
        subtitles.set(`${p.prefix}Participant_1`, p.proc.category);
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

    return {
        xml, poolOf, sidOfPool: new Map([...poolOf].map(([s, p]) => [p, s])), stepOfElement, elementOfStep,
        groups, groupKey, titles, subtitles, linkTypes,
    };
}
