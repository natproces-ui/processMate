"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    role: "user",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("http://127.0.0.1:8000/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        // 🔹 Stockage du token
        localStorage.setItem("access_token", data.access_token);

        // 🔹 Stockage de l'ID utilisateur pour ReportForm
        if (data.user && data.user.id) {
          localStorage.setItem("userId", data.user.id);
        }

        setMessage({ type: "success", text: "Inscription réussie 🎉" });

        // 🔹 Redirection vers la page d'accueil après 1s
        setTimeout(() => router.push("/"), 1000);
      } else {
        setMessage({ type: "error", text: data.detail || "Erreur d'inscription." });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau. Réessayez." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md mx-auto bg-white/80 dark:bg-gray-800/80 
                 rounded-2xl shadow-md p-6"
    >
      <h2 className="text-2xl font-semibold text-center text-[var(--color-primary)] mb-2">
        Créer un compte
      </h2>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Adresse email</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Nom d’utilisateur</label>
        <input
          type="text"
          name="username"
          value={form.username}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Mot de passe</label>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          required
          className="w-full p-2 border rounded-md focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--color-primary)] text-white py-2 rounded-md font-semibold 
                   hover:opacity-90 transition disabled:opacity-50"
      >
        {loading ? "Création..." : "S'inscrire"}
      </button>

      <p className="text-sm text-center mt-2">
        Déjà inscrit ?{" "}
        <a
          href="/auth/login"
          className="text-[var(--color-primary)] font-medium hover:underline"
        >
          Se connecter
        </a>
      </p>
    </form>
  );
}
