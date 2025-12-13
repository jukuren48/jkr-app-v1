// pages/admin/dashboard/index.jsx
import Link from "next/link";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useRouter } from "next/router";

export default function DashboardPage() {
  const { supabase } = useSupabase();
  const router = useRouter();

  return (
    <div className="p-6">
      <button
        className="px-4 py-2 bg-red-500 text-white rounded"
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/login"); // ← ★修正ポイント
        }}
      >
        ログアウト
      </button>

      <h1 className="text-3xl font-bold mb-4">ダッシュボード</h1>

      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Link
            href="/admin/dashboard/students"
            className="text-blue-600 underline"
          >
            生徒一覧（学習カルテを見る）
          </Link>
        </li>
      </ul>
    </div>
  );
}
