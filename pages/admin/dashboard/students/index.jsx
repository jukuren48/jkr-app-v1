// pages/admin/dashboard/students/index.jsx

import Link from "next/link";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { formatJST } from "@/src/utils/formatDate";

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
        .eq("id", session.user.id)
        .maybeSingle();

      if (roleError || me?.role !== "teacher") {
        router.push("/admin/dashboard");
        return;
      }

      // ② 生徒一覧取得
      const { data, error } = await supabase
        .from("users_extended")
        .select("id, name, email, school, grade, created_at")
        .eq("role", "student")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("生徒取得エラー:", error);
        setStudents([]);
      } else {
        setStudents(data || []);
      }

      setLoading(false);
    };

    init();
  }, [session]);

  if (loading) {
    return <p className="p-6">生徒一覧を読み込み中...</p>;
  }

  return (
    <div className="p-6">
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
            {students.map((u) => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{formatJST(u.last_login)}</td>
                <td className="p-4">{u.name || "未設定"}</td>
                <td className="p-4">{u.email}</td>
                <td className="p-4">
                  <Link
                    href={`/admin/dashboard/students/${u.id}`}
                    className="text-blue-600 underline"
                  >
                    開く
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
