// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",           // Génère du HTML/JS statique (obligatoire)
  trailingSlash: true,        // URLs propres : /clinic/
  images: {
    unoptimized: true         // Nécessaire pour export statique
  },
  // Optionnel : basePath si besoin
  // basePath: "/app"
};

export default nextConfig;