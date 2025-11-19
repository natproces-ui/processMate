"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    // 1️⃣ Supprimer le token
    localStorage.removeItem("access_token");

    // 2️⃣ Rediriger vers la page de login
    router.push("/auth/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-500 text-white rounded-md font-semibold hover:bg-red-600 transition"
    >
      Déconnexion
    </button>
  );
}
