import "@/styles/globals.css";
import { AuthProvider } from "../contexts/AuthContext";

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* 🔽 ポータル受け皿（Nextボタンをここへ強制表示） */}
      <div id="next-button-root"></div>

      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  );
}
