/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,

  // ★ SSR を有効化・静的エクスポートを禁止する
  output: "standalone",

  // ★ 今後のために必要（Recharts や動的 import の警告抑制）
  experimental: {
    serverActions: false,
  },
};

export default nextConfig;
