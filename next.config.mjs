/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ★ SSR を使うアプリではこれが必須
  output: "standalone",
};

export default nextConfig;
