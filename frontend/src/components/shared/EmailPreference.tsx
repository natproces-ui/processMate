'use client';

/** E-mail des tâches (valider, répondre, relances) : activé par défaut, désactivable par chacun. */
import { useEffect, useState } from 'react';
import { inboxApi } from '@/lib/inboxApi';

export default function EmailPreference() {
    const [value, setValue] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { inboxApi.notifications().then(r => setValue(r.email_taches)).catch(() => setValue(null)); }, []);
    if (value === null) return null;

    const toggle = async (next: boolean) => {
        setValue(next);
        setError(null);
        try { await inboxApi.setNotifications(next); }
        catch { setValue(!next); setError('Préférence non enregistrée'); }
    };

    return (
        <section aria-labelledby="notif-title" className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 id="notif-title" className="text-sm font-semibold text-gray-800">Notifications</h2>
            <label className="mt-3 flex items-start gap-3 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={value} onChange={e => void toggle(e.target.checked)} />
                <span>Recevoir un e-mail quand une tâche m&apos;attend (valider, relire, répondre à un point ouvert) et avant une échéance.</span>
            </label>
            {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </section>
    );
}
