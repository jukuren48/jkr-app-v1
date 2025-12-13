// pages/admin/settings/index.jsx

// ⭐ Next.js に「SSRも静的生成も絶対にするな」と指示
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

import { useSession } from "@supabase/auth-helpers-react";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function SettingsPage() {
  const session = useSession();
  const router = useRouter();

  // 未ログイン時は強制リダイレクト
  useEffect(() => {
    if (session === null) {
      router.push("/login");
    }
  }, [session]);

  // ローディング中
  if (session === undefined) {
    return <p className="text-center mt-10">読み込み中...</p>;
  }

  // 未ログインはリダイレクトされるため描画しない
  if (!session) return null;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">設定</h1>
      <p className="text-gray-600">
        ここにアプリ設定や管理者設定が追加されます。
      </p>
    </div>
  );
}
