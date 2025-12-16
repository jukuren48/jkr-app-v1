// pages/admin/dashboard/students/[id].jsx

import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { formatJST, formatRelativeJST } from "@/src/utils/formatDate";

// ⭐ SSR を完全に禁止
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

export default function StudentDetailPage() {
  const router = useRouter();
  const { id: user_id } = router.query; // ★ user_id として扱う

  const ctx = useSupabase();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!ctx) {
    return <p className="p-6">読み込み中...</p>;
  }

  const { supabase, session } = ctx;

  useEffect(() => {
    // 未ログイン
    if (session === null) {
      router.replace("/login");
      return;
    }

    if (!session || !user_id) return;

    const init = async () => {
      // ① teacher チェック
      const { data: me } = await supabase
        .from("users_extended")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (me?.role !== "teacher") {
        router.replace("/admin/dashboard");
        return;
      }

      // ② 詳細 API 取得
      const res = await fetch(`/api/admin/students/${user_id}`);
      if (!res.ok) {
        router.replace("/admin/dashboard/students");
        return;
      }

      const data = await res.json();
      setStudent(data);
      setLoading(false);
    };

    init();
  }, [session, user_id]);

  if (loading) {
    return <p className="p-6">生徒詳細を読み込み中...</p>;
  }

  return (
    <div className="p-6 max-w-xl">
      <button
        className="mb-6 text-blue-600 underline"
        onClick={() => router.push("/admin/dashboard/students")}
      >
        ← 生徒一覧に戻る
      </button>

      <h1 className="text-3xl font-bold mb-6">{student.name} さんの詳細</h1>

      <div className="space-y-4">
        <div>
          <strong>メール：</strong>
          {student.email}
        </div>

        <div>
          <strong>登録日：</strong>
          {formatJST(student.created_at)}
        </div>

        <div>
          <strong>最終ログイン：</strong>
          {student.last_login ? formatJST(student.last_login) : "—"}
          {student.last_login && (
            <span className="ml-2 text-gray-500 text-xs">
              （{formatRelativeJST(student.last_login)}）
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
