// pages/login.jsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";

export default function LoginPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false); // ★ 追加

  // すでにログイン済みならトップへ
  useEffect(() => {
    if (session) {
      router.push("/");
    }
  }, [session]);

  // ログイン / 新規登録 共通処理
  async function handleAuth(e) {
    e.preventDefault();

    if (!email || !password) {
      alert("メールとパスワードを入力してください");
      return;
    }

    if (isSignup) {
      // 🔵 新規登録（生徒）
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
      // 🔵 ログイン
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert("ログイン失敗: " + error.message);
      }
    }
  }

  // Google OAuth ログイン
  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });

    if (error) {
      alert("Googleログイン失敗: " + error.message);
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        {isSignup ? "新規登録（生徒）" : "ログイン"}
      </h1>

      <form onSubmit={handleAuth} className="space-y-4">
        <div>
          <label className="block mb-1">メール</label>
          <input
            type="email"
            className="border p-2 w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-1">パスワード</label>
          <input
            type="password"
            className="border p-2 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          {isSignup ? "新規登録する" : "ログイン"}
        </button>
      </form>

      {/* Googleログインはログイン時のみ表示 */}
      {!isSignup && (
        <button
          onClick={handleGoogleLogin}
          className="mt-4 bg-red-500 text-white px-4 py-2 rounded w-full"
        >
          Google ログイン
        </button>
      )}

      {/* ★ 切り替えボタン */}
      <div className="text-center mt-6">
        <button
          type="button"
          onClick={() => setIsSignup(!isSignup)}
          className="text-sm text-blue-600 underline"
        >
          {isSignup
            ? "すでにアカウントをお持ちの方はこちら（ログイン）"
            : "はじめての方はこちら（新規登録）"}
        </button>
      </div>
    </div>
  );
}
