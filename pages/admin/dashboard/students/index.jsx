// pages/admin/dashboard/students/index.jsx

import Link from "next/link";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  formatJST,
  formatRelativeJST,
  getLoginStatus,
} from "@/src/utils/formatDate";

// ⭐ SSR / SSG 完全禁止
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

export default function StudentsPage() {
  const router = useRouter();
  const ctx = useSupabase();

  // Provider 未初期化対策
  if (!ctx) {
    return <p className="p-6">読み込み中...</p>;
  }

  const { supabase, session } = ctx;
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 未ログイン → login
    if (session === null) {
      router.push("/login");
      return;
    }

    if (!session) return;

    const init = async () => {
      // ① 管理者チェック
      const { data: me, error: roleError } = await supabase
        .from("users_extended")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (roleError || me?.role !== "teacher") {
        router.push("/admin/dashboard");
        return;
      }

      // ② 生徒一覧取得（API経由）
      const res = await fetch("/api/admin/students");

      if (!res.ok) {
        console.error("API error", res.status);
        setStudents([]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      // ★ ここが重要
      setStudents(Array.isArray(data) ? data : []);

      setLoading(false);
    };

    init();
  }, [session]);

  if (loading) {
    return <p className="p-6">生徒一覧を読み込み中...</p>;
  }

  return (
    <div className="p-6">
      <button
        className="mb-6 text-blue-600 underline"
        onClick={() => router.push("/admin/dashboard")}
      >
        ← ダッシュボードに戻る
      </button>

      <h1 className="text-3xl font-bold mb-6">生徒一覧</h1>

      {students.length === 0 ? (
        <p className="text-gray-600">生徒がまだ登録されていません。</p>
      ) : (
        <table className="min-w-full bg-white shadow rounded-lg">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-4">最終ログイン</th>
              <th className="p-4">名前</th>
              <th className="p-4">メール</th>
              <th className="p-4">詳細</th>
            </tr>
          </thead>
          <tbody>
            {students.map((u) => {
              // ★ ここが肝：last_login を渡す
              const status = getLoginStatus(u.last_login);

              const rowClass =
                status === "danger"
                  ? "bg-red-50 hover:bg-red-100"
                  : status === "warning"
                  ? "bg-yellow-50 hover:bg-yellow-100"
                  : "hover:bg-gray-50";

              return (
                <tr key={u.user_id} className={`border-b ${rowClass}`}>
                  <td className="p-4 flex items-center gap-2">
                    {status === "danger" && "🔴"}
                    {status === "warning" && "🟡"}
                    {status === "recent" && "🟢"}
                    <span>{u.last_login ? formatJST(u.last_login) : "—"}</span>
                  </td>

                  <td className="p-4">{u.name}</td>

                  <td className="p-4">{u.email}</td>

                  <td className="p-4">
                    <button
                      onClick={() =>
                        router.push(`/admin/dashboard/students/${u.user_id}`)
                      }
                      className="text-blue-600 underline"
                    >
                      開く
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
