import type { NextConfig } from "next";

// Old English routes of the business app now live under /app with Spanish names.
const legacyRoutes: Record<string, string> = {
  "/materials": "/app/materiales",
  "/products": "/app/productos",
  "/inventory": "/app/inventario",
  "/sales": "/app/ventas",
  "/expenses": "/app/gastos",
  "/distributors": "/app/distribuidores",
  "/settings": "/app/configuracion",
};

const nextConfig: NextConfig = {
  async redirects() {
    return Object.entries(legacyRoutes).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
