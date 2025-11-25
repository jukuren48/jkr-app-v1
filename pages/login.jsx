import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert(error.message);
    else window.location.href = "/";
  };

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    // 新規登録成功 → ログイン画面へ戻す
    alert("登録が完了しました！ログイン画面からログインしてください。");
    window.location.href = "/login";
  };

  const googleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/",
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 to-sky-400 flex items-center justify-center p-6">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl p-10 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-sky-700 mb-4">
          英語ひっかけ問題
        </h1>
        <p className="text-gray-600 text-sm mb-8">
          〜 今日の成長を記録しよう！〜
        </p>

        {/* アイコン */}
        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-sky-300 to-sky-500 rounded-full shadow-xl flex items-center justify-center">
            📘
          </div>
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
          className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-xl mb-3 shadow-md"
        >
          ログイン
        </button>

        {/* 新規登録 */}
        <button
          onClick={handleSignup}
          className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl mb-6 shadow-md"
        >
          新規登録
        </button>

        {/* Googleログイン */}
        <button
          onClick={googleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold py-3 rounded-xl shadow-md"
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
