// pages/index.jsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";

export default function Home() {
  const router = useRouter();
  const ctx = useSupabase();

  if (!ctx) {
    return <p>読み込み中...</p>;
  }

  const { supabase, session } = ctx;
  const [role, setRole] = useState(null);
  const [redirected, setRedirected] = useState(false); // ★ 追加

  // ① ロール取得
  useEffect(() => {
    if (session === null) {
      router.replace("/login");
      return;
    }

    if (!session || !session.user) return;

    const fetchRole = async () => {
      const { data, error } = await supabase
        .from("users_extended")
        .select("role")
        .eq("user_id", session.user.id)
        .single();

      if (!error && data?.role) {
        setRole(data.role);
      }
    };

    fetchRole();
  }, [session]);

  // ② ロール確定後の遷移（ここが重要）
  useEffect(() => {
    if (!role || redirected) return;

    setRedirected(true); // ★ 二重遷移防止

    if (role === "teacher") {
      router.replace("/admin/dashboard");
    } else if (role === "student") {
      router.replace("/HomeCSR");
    }
  }, [role]);

  return <p>読み込み中（role判定）</p>;
}
