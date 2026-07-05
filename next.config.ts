import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "@libsql/kysely-libsql"],
};

export default nextConfig;
