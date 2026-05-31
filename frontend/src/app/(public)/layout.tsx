// app/(public)/layout.tsx
// Layout UNIQUEMENT pour les routes publiques : / et /scv-test
// Ce groupe ne contient PAS /orchestration, /stt, /sfd, /clinic
// Structure app/ :
//   (public)/page.tsx          → landing
//   (public)/scv-test/page.tsx → ScvMaker
//   (processmate)/orchestration/page.tsx → ProcessMate shell

import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col min-h-screen">

            {/* Header public — simple */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">

                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center group-hover:bg-blue-700 transition-colors">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">ProcessMate</span>
                    </Link>

                    <nav className="flex items-center gap-2">
                        <Link
                            href="/orchestration"
                            className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                        >
                            Ouvrir ProcessMate
                        </Link>
                        <Link
                            href="/scv-test"
                            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                            ScvMaker
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="border-t border-gray-100 py-6">
                <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
                    <p className="text-xs text-gray-400">© 2025 ProcessMate</p>
                    <div className="flex items-center gap-4">
                        <Link href="/orchestration" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">ProcessMate</Link>
                        <Link href="/scv-test" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">ScvMaker</Link>
                    </div>
                </div>
            </footer>

        </div>
    );
}