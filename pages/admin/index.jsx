// pages/admin/index.jsx
import Link from "next/link";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

// ★ サーバー側でログインチェック
export async function getServerSideProps(ctx) {
  const supabase = createPagesServerClient({ req: ctx.req, res: ctx.res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  return { props: {} };
}

export default function AdminHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">管理画面トップ</h1>

      {/* ログアウトボタン */}
      <form method="post" action="/api/logout">
        <button className="px-4 py-2 bg-red-500 text-white rounded mb-4">
          ログアウト
        </button>
      </form>

      <p className="text-gray-700 mb-4">
        ここから生徒の学習状況やログを確認できます。
      </p>

      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Link
            href="/admin/dashboard/students"
            className="text-blue-600 underline"
          >
            生徒一覧（学習カルテ）
          </Link>
        </li>
      </ul>
    </div>
  );
}
