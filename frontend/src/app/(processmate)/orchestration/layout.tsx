import MemberGuard from '@/components/auth/MemberGuard';

/** Orchestration = espace de l'organisation : membres actifs seulement */
export default function OrchestrationLayout({ children }: { children: React.ReactNode }) {
    return <MemberGuard>{children}</MemberGuard>;
}
