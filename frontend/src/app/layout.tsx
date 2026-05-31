// app/layout.tsx
// Root layout MINIMAL — html + body uniquement.
// AUCUN header, AUCUN footer ici.
// Chaque route group définit son propre shell complet.

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "ProcessMate",
  description: "ProcessMate – Automatisez votre documentation technique",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-white text-gray-900 font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}