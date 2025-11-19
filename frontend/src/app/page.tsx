'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Formalisez vos processus
            <span className="block text-purple-600 mt-2">en quelques clics</span>
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            Transformez vos idées en diagrammes BPMN professionnels.
            Uploadez du code.
          </p>

          {/* CTA Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Clinic Card */}
            <Link href="/clinic" className="group">
              <div className="bg-white border-2 border-purple-100 rounded-2xl p-8 hover:border-purple-600 hover:shadow-xl transition-all duration-300">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-6 group-hover:bg-purple-600 transition-colors">
                  <svg className="w-8 h-8 text-purple-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Clinic</h2>
                <p className="text-gray-600 mb-4">
                  Analysez du code WinDev et générez des flowcharts automatiquement
                </p>
                <div className="flex items-center justify-center gap-2 text-purple-600 font-semibold group-hover:gap-3 transition-all">
                  Commencer
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Image to Process Card */}
            <Link href="/stt" className="group">
              <div className="bg-white border-2 border-green-100 rounded-2xl p-8 hover:border-green-600 hover:shadow-xl transition-all duration-300">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-6 group-hover:bg-green-600 transition-colors">
                  <svg className="w-8 h-8 text-green-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">Image to Process</h2>
                <p className="text-gray-600 mb-4">
                  Uploadez une image de workflow et obtenez un diagramme BPMN structuré
                </p>
                <div className="flex items-center justify-center gap-2 text-green-600 font-semibold group-hover:gap-3 transition-all">
                  Commencer
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              Pourquoi ProcessMate ?
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Rapide</h3>
                <p className="text-gray-600">
                  Générez des diagrammes en quelques secondes
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Précis</h3>
                <p className="text-gray-600">
                  IA entraînée sur des standards BPMN
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Flexible</h3>
                <p className="text-gray-600">
                  Plusieurs formats d'entrée supportés
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}