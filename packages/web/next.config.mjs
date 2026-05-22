/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: [
    "@notes-app/ai",
    "@notes-app/auth",
    "@notes-app/domain",
    "@notes-app/editor-schema",
    "@notes-app/shared",
  ],
  webpack(config) {
    // Workspace packages import sibling modules with explicit `.js`
    // extensions (Node ESM convention) but ship as `.ts` source. Map the
    // request extension back so webpack can resolve them at build time.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
