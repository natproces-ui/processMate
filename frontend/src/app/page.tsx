// src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  const app = process.env.NEXT_PUBLIC_APP || 'clinic';
  redirect(`/${app}`);
}

// Pour forcer le rendu statique
export const dynamic = 'force-static';