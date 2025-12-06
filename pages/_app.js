// pages/_app.js
import "@/styles/globals.css";

import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";

export default function App({ Component, pageProps }) {
  // SSR と CSR 両方で使える Supabase クライアント
  const supabase = createPagesBrowserClient();

  return (
    <>
      {/* Next ボタンのポータル領域 */}
      <div id="next-button-root"></div>

      {/* ★ Supabase の セッション管理を全ページで有効化 ★ */}
      <SessionContextProvider
        supabaseClient={supabase}
        initialSession={pageProps.initialSession}
      >
        <Component {...pageProps} />
      </SessionContextProvider>
    </>
  );
}
