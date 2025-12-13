// pages/login.jsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider"; // ← これが重要

export default function LoginPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase(); // ← auth-helpers は使わない

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // すでにログイン済みならトップへ
  useEffect(() => {
    if (session) {
      router.push("/");
    }
  }, [session]);

  // メール＋パスワードログイン
  async function handleLogin(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("ログイン失敗: " + error.message);
    } else {
      router.push("/");
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
      <h1 className="text-2xl font-bold mb-4">ログイン</h1>

      <form onSubmit={handleLogin} className="space-y-4">
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
          ログイン
        </button>
      </form>

      <button
        onClick={handleGoogleLogin}
        className="mt-4 bg-red-500 text-white px-4 py-2 rounded w-full"
      >
        Google ログイン
      </button>
    </div>
  );
}
