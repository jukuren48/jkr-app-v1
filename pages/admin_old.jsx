// pages/admin_old.jsx または pages/admin_old/index.jsx

// ⭐ Next.js に「SSRもSSGも絶対にするな」と明示（buildエラー防止）
export const dynamic = "error";
export const revalidate = 0;
export const fetchCache = "only-no-store";

import { useSession } from "@supabase/auth-helpers-react";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function AdminOldPage() {
  const session = useSession();
  const router = useRouter();

  // 未ログイン時はログインページへ強制遷移
  useEffect(() => {
    if (session === null) {
      router.push("/login");
    }
  }, [session]);

  // ローディング中
  if (session === undefined) {
    return <p className="text-center mt-10">読み込み中...</p>;
  }

  // 未ログインはリダイレクト済み
  if (!session) return null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">旧管理画面</h1>
      <p className="text-gray-600 mb-6">
        ここは過去バージョンの管理ページです。
      </p>

      <ul className="list-disc pl-5 space-y-2">
        <li>いろいろな旧管理機能がここに表示されます。</li>
        <li>必要がなければ削除しても問題ありません。</li>
      </ul>
    </div>
  );
}
