import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ProcessMate",
  description: "Votre compagnon pour des formalisations rapides.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-white text-gray-900 font-sans antialiased">
        <div className="flex flex-col min-h-screen">
          {/* Header */}
          <header className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
            <div className="container mx-auto px-6 py-4">
              <div className="flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center group-hover:bg-purple-700 transition-colors">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">ProcessMate</h1>
                    <p className="text-xs text-gray-500">Votre compagnon pour des formalisations rapides</p>
                  </div>
                </Link>

                {/* Navigation */}
                <nav className="hidden md:flex items-center gap-8">
                  <Link
                    href="/clinic"
                    className="flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Clinic
                  </Link>
                  <Link
                    href="/scv-test"
                    className="flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h12M6 16h12M6 8h12" />
                    </svg>
                    ScvMaker
                  </Link>

                  <Link
                    href="/stt"
                    className="flex items-center gap-2 text-gray-600 hover:text-green-600 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Image to Process
                  </Link>
                </nav>

                {/* Mobile menu button */}
                <button className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-200 bg-gray-50 py-6">
            <div className="container mx-auto px-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-sm text-gray-600">
                  © 2024 ProcessMate. Tous droits réservés.
                </p>
                <div className="flex items-center gap-6">
                  <a href="#" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                    Documentation
                  </a>
                  <a href="#" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                    Support
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}