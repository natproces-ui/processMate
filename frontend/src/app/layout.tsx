import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProcessMate",
  description: "Generer facilement des diagrammes de processus BPMN à partir de tablaux  et vocalement.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-background text-foreground font-sans">
        <div className="flex flex-col min-h-screen">

          <main className="flex-1 container mx-auto px-4 py-6">{children}</main>

        </div>
      </body>
    </html>
  );
}
