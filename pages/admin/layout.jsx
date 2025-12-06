// app/admin/layout.jsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function AdminLayout({ children }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ❶ ログインしていない場合 → /login へ
  if (!user) {
    redirect("/login");
  }

  // ❷ 管理者ロールチェック（今は簡易版）
  // 後で users テーブルに role を追加したら、ここで判定できる
  // 今は「ログインしていればOK」の状態で進める
  // if (user.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* サイドバー */}
      <aside className="w-64 bg-white shadow-md p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-6">管理メニュー</h2>

        <nav className="flex flex-col gap-4">
          <Link
            href="/admin/dashboard"
            className="text-blue-600 hover:underline"
          >
            📊 ダッシュボード
          </Link>
          <Link
            href="/admin/students"
            className="text-blue-600 hover:underline"
          >
            👥 生徒管理
          </Link>
          <Link
            href="/admin/settings"
            className="text-blue-600 hover:underline"
          >
            ⚙ 設定
          </Link>
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 p-10">{children}</main>
    </div>
  );
}
