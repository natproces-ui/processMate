// src/app/page.tsx
'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-purple-600 to-purple-900">
      <div className="bg-white rounded-2xl p-12 shadow-2xl max-w-md w-full">
        <h1 className="text-4xl font-bold mb-4 text-center bg-gradient-to-r from-purple-600 to-purple-900 bg-clip-text text-transparent">
          ProcessMate
        </h1>

        <p className="text-center text-slate-500 mb-8 text-lg">
          Choisissez une application
        </p>

        <nav className="flex flex-col gap-4">
          <Link
            href="/clinic"
            className="block px-6 py-5 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-xl text-center text-lg font-semibold shadow-lg shadow-purple-500/50 hover:shadow-xl hover:shadow-purple-500/60 hover:-translate-y-0.5 transition-all duration-200"
          >
            🏥 Clinic
          </Link>

          <Link
            href="/stt"
            className="block px-6 py-5 bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-xl text-center text-lg font-semibold shadow-lg shadow-pink-500/50 hover:shadow-xl hover:shadow-pink-500/60 hover:-translate-y-0.5 transition-all duration-200"
          >
            🎤 STT (Speech to Text)
          </Link>

          <Link
            href="/scv-test"
            className="block px-6 py-5 bg-gradient-to-r from-blue-500 to-cyan-400 text-white rounded-xl text-center text-lg font-semibold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 hover:-translate-y-0.5 transition-all duration-200"
          >
            📊 SCV Test
          </Link>

          <Link
            href="/new-stt-test"
            className="block px-6 py-5 bg-gradient-to-r from-green-500 to-teal-400 text-white rounded-xl text-center text-lg font-semibold shadow-lg shadow-green-500/50 hover:shadow-xl hover:shadow-green-500/60 hover:-translate-y-0.5 transition-all duration-200"
          >
            🆕 New STT Test
          </Link>
        </nav>
      </div>
    </div>
  );
}