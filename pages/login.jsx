import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ▼ ログイン処理（ここに last_login + users_extended 自動作成を統合）
  const handleLogin = async () => {
    // ① ログイン実行
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    const user = data.user;
    const userId = user.id;
    const now = new Date().toISOString();

    // ② users_extended にレコードがあるか確認
    const { data: userExt } = await supabase
      .from("users_extended")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!userExt) {
      // ③ なければ新規作成（初回ログイン時）
      await supabase.from("users_extended").insert({
        id: userId,
        role: "student", // デフォルト
        last_login: now,
      });
    } else {
      // ④ あれば last_login 更新
      await supabase
        .from("users_extended")
        .update({ last_login: now })
        .eq("id", userId);
    }

    // ⑤ 完了したらトップページへ
    window.location.href = "/";
  };

  // ▼ 新規登録
  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("登録が完了しました！ログイン画面からログインしてください。");
    window.location.href = "/login";
  };

  // ▼ Googleログイン（後で last_login 更新処理を追加できます）
  const googleLogin = async () => {
    const redirectUrl =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000/"
        : "https://jkr-app-v1.vercel.app/";

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 to-sky-400 flex items-center justify-center p-6">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl p-10 w-full max-w-md text-center">
        {/* ▼ ロゴ */}
        <div className="flex justify-center mb-6">
          <img
            src="/entame_eng.png"
            alt="ロゴ"
            className="w-150 h-auto select-none"
          />
        </div>

        {/* メール */}
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-sky-400 outline-none"
        />

        {/* パスワード */}
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-sky-400 outline-none"
        />

        {/* ログイン */}
        <button
          onClick={handleLogin}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl mb-3 shadow-md transition"
        >
          ログイン
        </button>

        {/* 新規登録 */}
        <button
          onClick={handleSignup}
          className="w-full border border-gray-400 bg-white hover:bg-gray-100 text-gray-700 font-bold py-3 rounded-xl mb-6 shadow-sm transition"
        >
          新規登録
        </button>

        {/* Googleログイン */}
        <button
          onClick={googleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-400 hover:bg-gray-100 text-gray-700 font-bold py-3 rounded-xl shadow-md transition"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google icon"
            className="w-5 h-5"
          />
          Googleでログイン
        </button>
      </div>
    </div>
  );
}
