// pages/admin/dashboard/students/[id].jsx

import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { formatJST } from "@/src/utils/formatDate";

// ⭐ SSR を完全に禁止
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

export default function StudentDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const { supabase, session } = useSupabase();

  // ★ 生徒データを必ず null 初期化
  const [user, setUser] = useState(null);

  useEffect(() => {
    // ログインしていない
    if (session === null) {
      router.push("/login");
      return;
    }

    // まだ supabase 読み込み前
    if (!session || !id) return;

    const fetchUser = async () => {
      const { data, error } = await supabase
        .from("users_extended")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("生徒詳細取得エラー:", error);
        return;
      }

      setUser(data);
    };

    fetchUser();
  }, [session, id]);

  // セッション or user 読み込み中
  if (!session || !user) {
    return <p>読み込み中...(詳細データ)</p>;
  }

  return (
    <div className="p-6">
      <button
        className="mb-4 text-blue-600 underline"
        onClick={() => router.push("/admin/dashboard/students")}
      >
        ← 生徒一覧に戻る
      </button>

      <h1 className="text-3xl font-bold mb-6">
        {user.name || "未設定"} さんの詳細
      </h1>

      <div className="space-y-4">
        <p>
          <strong>ID:</strong> {user.id}
        </p>
        <p>
          <strong>メール:</strong> {user.email}
        </p>
        <p>
          <strong>役割:</strong> {user.role}
        </p>
        <p>
          <strong>登録日:</strong> {formatJST(user.created_at)}
        </p>
        <p>
          <strong>最終ログイン:</strong> {formatJST(user.last_login)}
        </p>
      </div>
    </div>
  );
}
