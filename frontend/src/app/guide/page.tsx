// Guide d'utilisation, accessible sans compte (même contenu que l'onglet Guide de l'espace).
import GuidePanel from '@/components/orchestration/GuidePanel';
import PublicShell from '@/components/home/PublicShell';

export default function GuidePage() {
    return (
        <PublicShell fullHeight>
            <GuidePanel />
        </PublicShell>
    );
}
