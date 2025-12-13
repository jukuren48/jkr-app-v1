// pages/test.jsx

// ⭐ SSR / SSG を完全禁止（絶対に必要）
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

import { useState } from "react";

export default function TestPage() {
  const [count, setCount] = useState(null);

  const callApi = async () => {
    try {
      const res = await fetch("/api/questions");
      const data = await res.json();
      console.log("📦 questions:", data);

      setCount(data.length);
      alert(`問題数: ${data.length}`);
    } catch (err) {
      console.error("API エラー:", err);
      alert("API 呼び出しに失敗しました");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">テストページ</h1>

      <button
        onClick={callApi}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
      >
        API呼び出しテスト
      </button>

      {count !== null && (
        <p className="mt-4 text-lg">取得した問題数：{count}</p>
      )}
    </div>
  );
}
