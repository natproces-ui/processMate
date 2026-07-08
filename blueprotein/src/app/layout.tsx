import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blue Protein — Des Biostimulants & engrais pour le Maroc et l'Afrique",
  description: "Blue Protein conçoit des biostimulants durables et des engrais adaptés aux besoins réels des agriculteurs marocains et africains.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
