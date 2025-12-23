// pages/login.jsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";

export default function LoginPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  // すでにログイン済みならトップへ
  useEffect(() => {
    if (session) {
      router.push("/");
    }
  }, [session]);

  async function handleAuth(e) {
    e.preventDefault();

    if (!email || !password) {
      alert("メールとパスワードを入力してください");
      return;
    }

    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert("新規登録失敗: " + error.message);
        return;
      }

      alert("登録が完了しました。ログインしてください。");
      setIsSignup(false);
      setPassword("");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert("ログイン失敗: " + error.message);
      }
    }
  }

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });

    if (error) {
      alert("Googleログイン失敗: " + error.message);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* 背景：煙突町（画像差し替え可） */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/steam-town.png')",
        }}
      />

      {/* 煙レイヤー */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-[200%] h-32 bg-white/10 blur-2xl animate-smoke" />
        <div className="absolute top-1/2 left-0 w-[200%] h-24 bg-white/10 blur-3xl animate-smoke-slow" />
      </div>

      {/* 中央パネル */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-black/50 backdrop-blur-md rounded-2xl shadow-2xl p-8">
          {/* タイトル */}
          <h1 className="text-center text-2xl font-semibold tracking-wide mb-2">
            Let's エンタメ英語
          </h1>
          <p className="text-center text-sm text-gray-300 mb-6">
            ～楽しく身につく英語トレーニング～
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm mb-1 text-gray-200">メール</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded bg-black/40 border border-gray-500 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-200">
                パスワード
              </label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded bg-black/40 border border-gray-500 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3 rounded-full bg-yellow-500 text-black font-semibold tracking-wide hover:bg-yellow-400 transition"
            >
              {isSignup ? "新規登録する" : "光を探しに行く"}
            </button>
          </form>

          {!isSignup && (
            <button
              onClick={handleGoogleLogin}
              className="w-full mt-4 py-2 rounded-full bg-red-600 hover:bg-red-500 transition text-white"
            >
              Googleでログイン
            </button>
          )}

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-sm text-gray-300 hover:text-white underline"
            >
              {isSignup
                ? "すでにアカウントをお持ちの方はこちら"
                : "はじめての方はこちら（新規登録）"}
            </button>
          </div>
        </div>
      </div>

      {/* CSSアニメーション */}
      <style jsx>{`
        @keyframes smoke {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        .animate-smoke {
          animation: smoke 60s linear infinite;
        }
        .animate-smoke-slow {
          animation: smoke 120s linear infinite;
        }
      `}</style>
    </div>
  );
}
