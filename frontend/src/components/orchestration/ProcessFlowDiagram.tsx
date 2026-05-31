'use client';

import React from 'react';

interface Props {
    onCollecte?: () => void;
    onFormalize?: () => void;
    onWorkflow?: () => void;
    onValidation?: () => void;
    onIrritants?: () => void;
    onAnalysis?: () => void;
    onComplexity?: () => void;
    onRaci?: () => void;
    onSfd?: () => void;
}

const C: Record<string, { fill: string; stroke: string; text: string }> = {
    blue: { fill: '#eff6ff', stroke: '#3b82f6', text: '#1e40af' },
    purple: { fill: '#f5f3ff', stroke: '#7c3aed', text: '#4c1d95' },
    gray: { fill: '#f8fafc', stroke: '#94a3b8', text: '#374151' },
    teal: { fill: '#f0fdfa', stroke: '#14b8a6', text: '#134e4a' },
    green: { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46' },
    orange: { fill: '#fff7ed', stroke: '#f97316', text: '#9a3412' },
    red: { fill: '#fef2f2', stroke: '#ef4444', text: '#991b1b' },
    violet: { fill: '#f5f3ff', stroke: '#7c3aed', text: '#4c1d95' },
};

function Markers() {
    return (
        <defs>
            {[
                ['blue', '#3b82f6'],
                ['gray', '#94a3b8'],
                ['green', '#10b981'],
                ['teal', '#14b8a6'],
                ['red', '#ef4444'],
                ['orange', '#f97316'],
                ['violet', '#7c3aed'],
            ].map(([id, color]) => (
                <marker key={id} id={`m-${id}`}
                    viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M1 1L9 5L1 9" fill="none" stroke={color}
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
            ))}
        </defs>
    );
}

const R = 24;
const GW = 26;

function Station({ cx, cy, color, icon, label, sublabel, onClick }: {
    cx: number; cy: number; color: string;
    icon: string; label: string; sublabel?: string;
    onClick?: () => void;
}) {
    const c = C[color];
    const clickable = !!onClick;
    return (
        <g onClick={onClick} style={{ cursor: clickable ? 'pointer' : 'default' }}>
            {clickable && (
                <circle cx={cx} cy={cy} r={R + 7} fill={c.stroke} fillOpacity={0.07}
                    style={{ opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as SVGCircleElement).style.opacity = '1'}
                    onMouseLeave={e => (e.currentTarget as SVGCircleElement).style.opacity = '0'} />
            )}
            <circle cx={cx} cy={cy} r={R} fill={c.fill} stroke={c.stroke} strokeWidth={2.5} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                fontSize={13} fontWeight={700} fill={c.text}>{icon}</text>
            <text x={cx} y={cy + R + 14} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fontWeight={700} fill={c.text}>{label}</text>
            {sublabel && (
                <text x={cx} y={cy + R + 26} textAnchor="middle" dominantBaseline="central"
                    fontSize={9} fill={c.stroke} opacity={0.8}>{sublabel}</text>
            )}
        </g>
    );
}

function Gateway({ cx, cy, label }: { cx: number; cy: number; label: string }) {
    const pts = `${cx},${cy - GW} ${cx + GW * 1.7},${cy} ${cx},${cy + GW} ${cx - GW * 1.7},${cy}`;
    return (
        <g>
            <polygon points={pts} fill="#f8fafc" stroke="#94a3b8" strokeWidth={2} />
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                fontSize={10} fontWeight={600} fill="#475569">{label}</text>
        </g>
    );
}

function Seg({ x1, y1, x2, y2, color = 'gray', dashed = false, sw = 3, arrow = false }: {
    x1: number; y1: number; x2: number; y2: number;
    color?: string; dashed?: boolean; sw?: number; arrow?: boolean;
}) {
    const stroke = C[color]?.stroke ?? '#94a3b8';
    return (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={stroke} strokeWidth={sw}
            strokeDasharray={dashed ? '7,5' : undefined}
            markerEnd={arrow ? `url(#m-${color})` : undefined} />
    );
}

function Lbl({ x, y, text, color = 'gray', anchor = 'middle' }: {
    x: number; y: number; text: string; color?: string; anchor?: 'middle' | 'start' | 'end';
}) {
    const fill = C[color]?.stroke ?? '#94a3b8';
    return (
        <text x={x} y={y} textAnchor={anchor} dominantBaseline="central"
            fontSize={10} fontWeight={600} fill={fill}>{text}</text>
    );
}

export default function ProcessFlowDiagram({
    onCollecte, onFormalize, onWorkflow, onValidation,
    onIrritants, onRaci, onSfd,
}: Props) {

    const LY = 260;
    const DEBUT = 60;
    const COLL = 180;
    const ANAL = 320;
    const FORM = 460;
    const VERIF = 580;
    const GW1X = 670;
    const VALID = 760;
    const GW2X = 860;

    const RY_NON = 130;
    const RY_RET = 100;

    const REF_Y = 400;
    const BRY = 560;

    // Capsule Amélioration continue
    // Centre cx=FORM=460, cy=AMY
    const AMY = 730;
    const AM_W = 280;  // largeur capsule
    const AM_H = 52;   // hauteur capsule
    const AM_X = FORM - AM_W / 2;   // x gauche = 460 - 140 = 320
    const AM_Y = AMY - AM_H / 2;    // y haut
    const AM_CY = AMY;               // centre vertical

    const FIN_Y = 840;
    const DIAG = 280;
    const GEST = FORM;   // 460
    const LIVR = 640;

    // Boucle violette — sort gauche capsule
    const VIO_X = 30;
    const VIO_MID_Y = LY + 80;

    // Flèches branches → Amélioration : tournent avant d'arriver à la capsule
    const TURN_Y = AMY - 80;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-sm font-black text-gray-800">Flux conditionnel du processus</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Chemins conditionnels, boucles de retour et amélioration continue</p>
                </div>
                <div className="flex items-center gap-5 text-[11px] text-gray-400 flex-wrap">
                    {[
                        { label: 'Flux nominal', color: '#94a3b8', dashed: false },
                        { label: 'Retour correction', color: '#ef4444', dashed: true },
                        { label: 'Amélioration', color: '#7c3aed', dashed: true },
                    ].map(({ label, color, dashed }) => (
                        <span key={label} className="flex items-center gap-1.5">
                            <svg width="20" height="8">
                                <line x1="0" y1="4" x2="20" y2="4" stroke={color}
                                    strokeWidth={dashed ? 2 : 3}
                                    strokeDasharray={dashed ? '5,4' : undefined} />
                            </svg>
                            {label}
                        </span>
                    ))}
                </div>
            </div>

            <div className="px-2 py-8 overflow-x-auto">
                <svg width="100%" viewBox="0 0 980 900"
                    style={{ minWidth: 760, display: 'block', margin: '0 auto' }}>
                    <Markers />

                    {/* ══ LIGNE PRINCIPALE ══ */}
                    <rect x={DEBUT - 32} y={LY - 14} width={64} height={28} rx={14} fill="#1e40af" />
                    <text x={DEBUT} y={LY} textAnchor="middle" dominantBaseline="central"
                        fontSize={11} fontWeight={700} fill="white">Début</text>

                    <Seg x1={DEBUT + 32} y1={LY} x2={COLL - R} y2={LY} color="blue" arrow />
                    <Station cx={COLL} cy={LY} color="blue" icon="⬇"
                        label="Collecte" sublabel="PDF, Code, Audio…" onClick={onCollecte} />

                    <Seg x1={COLL + R} y1={LY} x2={ANAL - R} y2={LY} color="blue" arrow />
                    <Station cx={ANAL} cy={LY} color="blue" icon="✦"
                        label="Analyse & Extraction" sublabel="Étapes, acteurs, outils" />

                    <Seg x1={ANAL + R} y1={LY} x2={FORM - R} y2={LY} color="purple" arrow />
                    <Station cx={FORM} cy={LY} color="purple" icon="✎"
                        label="Formalisation" sublabel="BPMN Studio" onClick={onFormalize} />

                    <Seg x1={FORM + R} y1={LY} x2={VERIF - R} y2={LY} color="gray" arrow />
                    <Station cx={VERIF} cy={LY} color="gray" icon="✓"
                        label="Vérification" sublabel="Cohérence" onClick={onWorkflow} />

                    <Seg x1={VERIF + R} y1={LY} x2={GW1X - GW * 1.7} y2={LY} color="gray" arrow />
                    <Gateway cx={GW1X} cy={LY} label="Conforme ?" />

                    <Seg x1={GW1X + GW * 1.7} y1={LY} x2={VALID - R} y2={LY} color="teal" arrow />
                    <Lbl x={GW1X + GW * 1.7 + 14} y={LY - 12} text="Oui" color="teal" />
                    <Station cx={VALID} cy={LY} color="teal" icon="☑"
                        label="Validation" sublabel="Responsables" onClick={onValidation} />

                    <Seg x1={VALID + R} y1={LY} x2={GW2X - GW * 1.7} y2={LY} color="teal" arrow />
                    <Gateway cx={GW2X} cy={LY} label="Validée ?" />

                    {/* ══ RETOURS AU-DESSUS ══ */}
                    <Seg x1={GW1X} y1={LY - GW} x2={GW1X} y2={RY_NON} color="red" dashed sw={2} />
                    <Seg x1={GW1X} y1={RY_NON} x2={FORM} y2={RY_NON} color="red" dashed sw={2} />
                    <Seg x1={FORM} y1={RY_NON} x2={FORM} y2={LY - R} color="red" dashed sw={2} arrow />
                    <Lbl x={(GW1X + FORM) / 2} y={RY_NON - 12} text="Non — retour formalisation" color="red" />

                    <Seg x1={GW2X} y1={LY - GW} x2={GW2X} y2={RY_RET} color="orange" dashed sw={2} />
                    <Seg x1={GW2X} y1={RY_RET} x2={FORM + 12} y2={RY_RET} color="orange" dashed sw={2} />
                    <Seg x1={FORM + 12} y1={RY_RET} x2={FORM + 12} y2={LY - R} color="orange" dashed sw={2} arrow />
                    <Lbl x={(GW2X + FORM) / 2 + 20} y={RY_RET - 12} text="Retours — révision" color="orange" />

                    {/* ══ GW2 OUI → RÉFÉRENTIEL ══ */}
                    <Seg x1={GW2X} y1={LY + GW} x2={GW2X} y2={REF_Y} color="green" sw={3} />
                    <Seg x1={GW2X} y1={REF_Y} x2={FORM} y2={REF_Y} color="green" sw={3} arrow />
                    <Lbl x={GW2X + 14} y={LY + GW + 20} text="Oui" color="green" />

                    <Station cx={FORM} cy={REF_Y} color="green" icon="◎"
                        label="Référentiel procédures" sublabel="Versioning, sauvegarde" />

                    {/* ══ 3 FLÈCHES RÉFÉRENTIEL → BRANCHES ══ */}
                    <Seg x1={FORM} y1={REF_Y + R} x2={FORM} y2={REF_Y + 60} color="gray" sw={2} />
                    <Seg x1={FORM} y1={REF_Y + 60} x2={DIAG} y2={REF_Y + 60} color="gray" sw={2} />
                    <Seg x1={DIAG} y1={REF_Y + 60} x2={DIAG} y2={BRY - R} color="gray" sw={2} arrow />

                    <Seg x1={FORM} y1={REF_Y + R} x2={FORM} y2={BRY - R} color="gray" sw={2} arrow />

                    <Seg x1={FORM} y1={REF_Y + R} x2={FORM} y2={REF_Y + 60} color="gray" sw={2} />
                    <Seg x1={FORM} y1={REF_Y + 60} x2={LIVR} y2={REF_Y + 60} color="gray" sw={2} />
                    <Seg x1={LIVR} y1={REF_Y + 60} x2={LIVR} y2={BRY - R} color="gray" sw={2} arrow />

                    {/* BRANCHES */}
                    <Station cx={DIAG} cy={BRY} color="red" icon="⊙"
                        label="Diagnostic" sublabel="Irritants, complexité" onClick={onIrritants} />
                    <Station cx={GEST} cy={BRY} color="orange" icon="⊞"
                        label="Gestion" sublabel="RACI, tâches" onClick={onRaci} />
                    <Station cx={LIVR} cy={BRY} color="teal" icon="⊡"
                        label="Livrables" sublabel="SFD, export" onClick={onSfd} />

                    {/* ══ 3 FLÈCHES BRANCHES → CAPSULE AMÉLIORATION
                        Diag et Livr tournent à TURN_Y (80px au-dessus capsule)
                        entrent par le haut de la capsule à x=GEST±40
                        Gestion entre directement au centre
                    ══ */}

                    {/* Diagnostic → descend → tourne → entre haut-gauche capsule */}
                    <Seg x1={DIAG} y1={BRY + R} x2={DIAG} y2={TURN_Y} color="red" sw={2} />
                    <Seg x1={DIAG} y1={TURN_Y} x2={GEST - 50} y2={TURN_Y} color="red" sw={2} />
                    <Seg x1={GEST - 50} y1={TURN_Y} x2={GEST - 50} y2={AM_Y} color="red" sw={2} arrow />

                    {/* Gestion → descend directement au centre haut capsule */}
                    <Seg x1={GEST} y1={BRY + R} x2={GEST} y2={AM_Y} color="violet" sw={3} arrow />

                    {/* Livrables → descend → tourne → entre haut-droite capsule */}
                    <Seg x1={LIVR} y1={BRY + R} x2={LIVR} y2={TURN_Y} color="teal" sw={2} />
                    <Seg x1={LIVR} y1={TURN_Y} x2={GEST + 50} y2={TURN_Y} color="teal" sw={2} />
                    <Seg x1={GEST + 50} y1={TURN_Y} x2={GEST + 50} y2={AM_Y} color="teal" sw={2} arrow />

                    {/* ══ CAPSULE AMÉLIORATION CONTINUE ══ */}
                    <rect x={AM_X} y={AM_Y} width={AM_W} height={AM_H} rx={AM_H / 2}
                        fill="#f5f3ff" stroke="#7c3aed" strokeWidth={2.5} />
                    <text x={FORM} y={AM_CY - 8} textAnchor="middle" dominantBaseline="central"
                        fontSize={13} fontWeight={700} fill="#4c1d95">↻ Amélioration continue</text>
                    <text x={FORM} y={AM_CY + 10} textAnchor="middle" dominantBaseline="central"
                        fontSize={9} fill="#7c3aed" opacity={0.8}>Diagnostic → actions → révision</text>

                    {/* ══ BOUCLE VIOLETTE — sort gauche capsule
                        → va à gauche (VIO_X)
                        → monte jusqu'à VIO_MID_Y
                        → va à droite jusqu'à FORM
                        → entre dans Formalisation par le bas
                    ══ */}
                    <Seg x1={AM_X} y1={AM_CY} x2={VIO_X} y2={AM_CY} color="violet" dashed sw={2} />
                    <Seg x1={VIO_X} y1={AM_CY} x2={VIO_X} y2={VIO_MID_Y} color="violet" dashed sw={2} />
                    <Seg x1={VIO_X} y1={VIO_MID_Y} x2={FORM} y2={VIO_MID_Y} color="violet" dashed sw={2} />
                    <Seg x1={FORM} y1={VIO_MID_Y} x2={FORM} y2={LY + R} color="violet" dashed sw={2} arrow />

                    {/* ══ CAPSULE → FIN ══ */}
                    <Seg x1={FORM} y1={AM_Y + AM_H} x2={FORM} y2={FIN_Y - 16}
                        color="green" sw={3} arrow />

                    <rect x={FORM - 90} y={FIN_Y - 16} width={180} height={32} rx={16} fill="#065f46" />
                    <text x={FORM} y={FIN_Y} textAnchor="middle" dominantBaseline="central"
                        fontSize={12} fontWeight={700} fill="white">Procédure maîtrisée ✓</text>

                </svg>
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-[11px] text-gray-400">
                    Les stations colorées sont cliquables — elles ouvrent la section correspondante dans ProcessMate.
                </p>
            </div>
        </div>
    );
}
