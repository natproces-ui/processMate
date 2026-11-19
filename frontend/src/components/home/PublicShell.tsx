// Habillage commun des pages publiques (guide, blog) : en-tête simple, retour au chat.
import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function PublicShell({ children, fullHeight = false }: { children: React.ReactNode; fullHeight?: boolean }) {
    return (
        <div className={fullHeight ? 'h-screen flex flex-col bg-white' : 'min-h-screen flex flex-col bg-white'}>
            <header className="h-14 shrink-0 border-b border-neutral-200 px-4 flex items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2 font-bold text-neutral-900">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></span>
                    ProcessMate
                </Link>
                <nav className="flex items-center gap-1 text-sm">
                    <Link href="/decouvrir" className="px-2.5 py-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">Découvrir</Link>
                    <Link href="/guide" className="px-2.5 py-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">Guide</Link>
                    <Link href="/blog" className="px-2.5 py-1.5 rounded-lg text-neutral-900 hover:bg-neutral-100">Blog</Link>
                    <Link href="/" className="ml-1 px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700">Ouvrir le chat</Link>
                </nav>
            </header>
            <main className={fullHeight ? 'flex-1 min-h-0' : 'flex-1'}>{children}</main>
        </div>
    );
}
