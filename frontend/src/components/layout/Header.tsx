"use client";

import Link from "next/link";
import LogoutButton from "@/components/auth/LogoutButton"; // 🔹 Import du bouton de déconnexion

export default function Header() {
  return (
    <header className="bg-primary text-white shadow-md">
      <nav className="container mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold tracking-wide text-secondary">
          ⚡ Wattara
        </Link>

        {/* Menu + Logout */}
        <div className="flex items-center space-x-6">
          <ul className="flex space-x-6">
            <li>
              <Link href="/users" className="hover:text-accent transition">
                Utilisateurs
              </Link>
            </li>
            <li>
              <Link href="/reports" className="hover:text-accent transition">
                Signalements
              </Link>
            </li>
            <li>
              <Link href="/outages" className="hover:text-accent transition">
                Pannes
              </Link>
            </li>
          </ul>

          {/* 🔹 Bouton Déconnexion */}
          <LogoutButton />
        </div>
      </nav>
    </header>
  );
}
