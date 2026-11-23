'use client';

// Vue d'ensemble des irritants, toutes procédures : un tableau croisé procédures × axes de transformation.
// Chaque case donne le nombre de défaillances (dont majeures) et les pistes retenues ; un clic ouvre la procédure
// dans le chat, sur son onglet « Irritants et pistes », filtré sur l'axe. Le détail vit dans la procédure.
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, List, Loader2 } from 'lucide-react';
import { orchestrationApi } from '@/lib/orchestrationApi';

interface Irr {
    id: string; procedure_id?: string; procedure_nom?: string; criticite?: string; categorie?: string;
    findings?: { categorie?: string; pistes?: { statut: string }[] }[];
}
interface Cell { n: number; majeurs: number; pistes: number; retenues: number }

const axisOf = (i: Irr) => i.findings?.[0]?.categorie || i.categorie || 'Sans axe';
const empty = (): Cell => ({ n: 0, majeurs: 0, pistes: 0, retenues: 0 });
const add = (c: Cell, i: Irr) => {
    const ps = (i.findings || []).flatMap(f => f.pistes || []);
    c.n += 1; if (i.criticite === 'Majeur') c.majeurs += 1;
    c.pistes += ps.length; c.retenues += ps.filter(p => p.statut === 'retenue').length;
};

export default function IrritantsOverview({ onShowList }: { onShowList?: () => void }) {
    const [items, setItems] = useState<Irr[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        orchestrationApi.listIrritants({ with_findings: true })
            .then(r => setItems((r.irritants as Irr[]).filter(i => i.procedure_id)))
            .catch(e => setError(e?.message || 'Irritants indisponibles'));
    }, []);

    const { axes, rows, total, byAxis } = useMemo(() => {
        const list = items || [];
        const axes = Array.from(new Set(list.map(axisOf)))
            .sort((a, b) => (/^T\d/.test(a) ? 0 : 1) - (/^T\d/.test(b) ? 0 : 1) || a.localeCompare(b, 'fr'));
        const procs = new Map<string, { id: string; nom: string; cells: Record<string, Cell>; all: Cell }>();
        const byAxis: Record<string, Cell> = {};
        const total = empty();
        for (const i of list) {
            const id = i.procedure_id as string;
            const p = procs.get(id) || { id, nom: i.procedure_nom || 'Procédure', cells: {}, all: empty() };
            const ax = axisOf(i);
            add(p.cells[ax] = p.cells[ax] || empty(), i); add(p.all, i);
            add(byAxis[ax] = byAxis[ax] || empty(), i); add(total, i);
            procs.set(id, p);
        }
        const rows = Array.from(procs.values()).sort((a, b) => b.all.majeurs - a.all.majeurs || b.all.n - a.all.n);
        return { axes, rows, total, byAxis };
    }, [items]);

    const open = (procId: string, axis?: string) => {
        window.location.href = `/?procedure=${encodeURIComponent(procId)}&vue=irritants${axis ? `&axe=${encodeURIComponent(axis)}` : ''}`;
    };

    const CellView = ({ c, onClick, label }: { c?: Cell; onClick?: () => void; label: string }) => (
        c && c.n > 0 ? (
            <button type="button" onClick={onClick} aria-label={label} title={label}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-petrole-tint">
                <span className="block text-base font-semibold text-neutral-900">{c.n}</span>
                <span className="block text-[11px] text-neutral-600">
                    {c.majeurs > 0 && <span className="font-semibold text-amber-700">{c.majeurs} majeur{c.majeurs > 1 ? 's' : ''}, </span>}
                    {c.retenues}/{c.pistes} piste{c.pistes > 1 ? 's' : ''}
                </span>
            </button>
        ) : <span className="block px-2 py-1.5 text-neutral-300" aria-hidden>0</span>
    );

    return (
        <div className="h-full overflow-auto bg-white">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-2">
                <h2 className="text-sm font-semibold text-petrole">Irritants par procédure et par axe</h2>
                {items && (
                    <span className="text-xs text-neutral-600">
                        {total.n} défaillance{total.n > 1 ? 's' : ''} sur {rows.length} procédure{rows.length > 1 ? 's' : ''}, dont {total.majeurs} majeure{total.majeurs > 1 ? 's' : ''}.
                        {' '}{total.retenues} piste{total.retenues > 1 ? 's' : ''} retenue{total.retenues > 1 ? 's' : ''} sur {total.pistes}.
                    </span>
                )}
                {onShowList && (
                    <button type="button" onClick={onShowList}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-100">
                        <List className="h-3.5 w-3.5 text-neutral-600" />Liste détaillée
                    </button>
                )}
            </div>

            {error && <p className="flex items-center gap-2 p-4 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{error}</p>}
            {!items && !error && <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-neutral-400" /></div>}
            {items && rows.length === 0 && (
                <p className="p-4 text-sm text-neutral-600">Aucune défaillance relevée pour l’instant. Elles se relèvent depuis une procédure, dans son onglet « Irritants et pistes ».</p>
            )}

            {rows.length > 0 && (
                <div className="p-4">
                    <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className="sticky left-0 z-[1] min-w-[240px] border-b border-neutral-200 bg-white px-2 py-2 text-left text-xs font-semibold text-neutral-600">Procédure</th>
                                {axes.map(a => (
                                    <th key={a} scope="col" title={a} className="min-w-[120px] max-w-[180px] border-b border-neutral-200 px-2 py-2 text-left align-bottom text-xs font-semibold text-petrole">
                                        <span className="line-clamp-2">{a}</span>
                                    </th>
                                ))}
                                <th scope="col" className="border-b border-neutral-200 px-2 py-2 text-left text-xs font-semibold text-neutral-600">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="align-top">
                                    <th scope="row" className="sticky left-0 z-[1] border-b border-neutral-100 bg-white px-2 py-2 text-left font-medium">
                                        <button type="button" onClick={() => open(r.id)} className="text-left text-neutral-900 hover:text-petrole hover:underline">{r.nom}</button>
                                    </th>
                                    {axes.map(a => (
                                        <td key={a} className="border-b border-neutral-100 px-1 py-1">
                                            <CellView c={r.cells[a]} onClick={() => open(r.id, a)} label={`${r.nom}, ${a} : ouvrir les défaillances`} />
                                        </td>
                                    ))}
                                    <td className="border-b border-neutral-100 px-1 py-1">
                                        <CellView c={r.all} onClick={() => open(r.id)} label={`${r.nom} : toutes les défaillances`} />
                                    </td>
                                </tr>
                            ))}
                            <tr className="align-top">
                                <th scope="row" className="sticky left-0 z-[1] bg-white px-2 py-2 text-left text-xs font-semibold text-neutral-600">Total</th>
                                {axes.map(a => <td key={a} className="px-1 py-1"><CellView c={byAxis[a]} label={`${a} : total`} /></td>)}
                                <td className="px-1 py-1"><CellView c={total} label="Total général" /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
