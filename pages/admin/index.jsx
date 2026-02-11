// pages/admin/index.jsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_EMAILS = ["info@juku-ren.jp"]; // 必要なら追加

// ★ サーバー側でログインチェック + 管理者チェック
export async function getServerSideProps(ctx) {
  const supabaseServer = createPagesServerClient({
    req: ctx.req,
    res: ctx.res,
  });

  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session) {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const email = session?.user?.email ?? "";
  const isAdmin = ADMIN_EMAILS.includes(email);

  if (!isAdmin) {
    return {
      redirect: { destination: "/", permanent: false },
    };
  }

  return {
    props: {
      userId: session.user.id,
      email,
    },
  };
}

export default function AdminHomePage({ userId, email }) {
  const router = useRouter();

  // ====== Upgrade CV Dashboard（暫定：自分のログのみ） ======
  const [statsToday, setStatsToday] = useState({
    impressions: 0,
    clicks: 0,
    closes: 0,
    cvr: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStatsToday = async () => {
    try {
      setStatsLoading(true);

      // 今日の0:00（ローカル時刻/JST想定）
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const { data: rows, error } = await supabase
        .from("upgrade_events")
        .select("event, created_at")
        .eq("user_id", userId) // ★今は「自分のログ」だけ（全体集計は次の段でAPI化）
        .gte("created_at", start.toISOString())
        .limit(5000);

      if (error) {
        console.warn("[upgrade_events] fetch error:", error);
        return;
      }

      const counts = (rows || []).reduce(
        (acc, r) => {
          if (r.event === "upgrade_modal_impression") acc.impressions += 1;
          if (r.event === "upgrade_click_checkout") acc.clicks += 1;
          if (r.event === "upgrade_click_close") acc.closes += 1;
          return acc;
        },
        { impressions: 0, clicks: 0, closes: 0 },
      );

      const cvr =
        counts.impressions > 0
          ? Math.round((counts.clicks / counts.impressions) * 1000) / 10
          : 0;

      setStatsToday({ ...counts, cvr });
    } catch (e) {
      console.warn("[upgrade_events] fetch exception:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatsToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">管理画面トップ</h1>

        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded font-bold hover:opacity-90"
        >
          学習画面へ戻る
        </button>
      </div>

      <div className="mt-2 text-sm text-gray-600">管理者: {email}</div>

      {/* ログアウトボタン */}
      <form method="post" action="/api/logout" className="mt-4">
        <button className="px-4 py-2 bg-red-500 text-white rounded font-bold hover:opacity-90">
          ログアウト
        </button>
      </form>

      {/* ====== 今日のアップグレード導線（管理者用） ====== */}
      <div className="mt-6 max-w-2xl bg-white rounded-2xl p-4 shadow">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">今日のアップグレード導線（暫定）</h2>
          <button
            onClick={fetchStatsToday}
            disabled={statsLoading}
            className="text-sm px-3 py-1 rounded-lg bg-gray-200 hover:opacity-90 disabled:opacity-50"
          >
            {statsLoading ? "更新中…" : "更新"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div className="rounded-xl bg-gray-100 p-2">
            <div className="text-xs text-gray-600">表示</div>
            <div className="text-lg font-bold">{statsToday.impressions}</div>
          </div>
          <div className="rounded-xl bg-gray-100 p-2">
            <div className="text-xs text-gray-600">クリック</div>
            <div className="text-lg font-bold">{statsToday.clicks}</div>
          </div>
          <div className="rounded-xl bg-gray-100 p-2">
            <div className="text-xs text-gray-600">CVR</div>
            <div className="text-lg font-bold">{statsToday.cvr}%</div>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-600 text-center">
          閉じる：{statsToday.closes}（参考）
        </div>

        <div className="mt-4 text-xs text-gray-500">
          ※現時点は「あなた自身のログ」集計です。全ユーザー合算は次に Service
          Role のAPIで安全に集計します。
        </div>
      </div>

      <p className="text-gray-700 mt-6 mb-4">
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
