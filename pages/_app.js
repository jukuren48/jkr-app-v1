// pages/_app.js

import "@/styles/globals.css";
import { useEffect, useState } from "react";
import { AuthProvider } from "../contexts/AuthContext";

export default function App({ Component, pageProps }) {
  // 🚫 SSR では AuthProvider を起動させない
  // SSR では window がないため、useEffect 後にのみ CSR を開始する
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // クライアントでのみ true になる
    setIsClient(true);
  }, []);

  return (
    <>
      {/* Next ボタンのポータル受け皿 */}
      <div id="next-button-root"></div>

      {/*
        🟢 SSR のときはただ Component を描画
        🟢 CSR（useEffect後）になったら AuthProvider を起動
        これで SSR ページ（admin など）に絶対干渉しない
      */}
      {isClient ? (
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      ) : (
        <Component {...pageProps} />
      )}
    </>
  );
}
