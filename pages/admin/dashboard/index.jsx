// pages/admin/dashboard/index.jsx
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useRouter } from "next/router";

const ADMIN_EMAILS = ["info@juku-ren.jp"]; // 必要なら追加

export default function DashboardPage() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  /* ===============================
     管理者判定
  =============================== */
  const isAdmin = useMemo(() => {
    const email = session?.user?.email ?? "";
    return ADMIN_EMAILS.includes(email);
  }, [session]);

  /* ===============================
     管理者以外は弾く
  =============================== */
  useEffect(() => {
    if (session === undefined) return; // まだ判定中
    if (!session) return; // 未ログイン
    if (!isAdmin) return; // 管理者でない

    fetchStatsToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isAdmin]);

  /* ===============================
     Upgrade 導線ダッシュボード
  =============================== */
  const [statsToday, setStatsToday] = useState(null);
  const [statsYesterday, setStatsYesterday] = useState(null);
  const [stats7days, setStats7days] = useState(null);

  const [statsLoading, setStatsLoading] = useState(false);

  const [statsError, setStatsError] = useState("");

  const fetchStatsToday = async () => {
    try {
      setStatsLoading(true);
      setStatsError("");

      // ★アクセストークンを取得して API に渡す
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      if (!token) {
        setStatsError("セッションが取得できませんでした（tokenなし）");
        return;
      }

      const res = await fetch("/api/admin/upgrade-today", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      console.log("[upgrade-today] status:", res.status, "json:", json);

      if (!res.ok) {
        setStatsError(`API Error: ${res.status} ${json?.error ?? ""}`);
        return;
      }

      setStatsToday(json?.today ?? null);
      setStatsYesterday(json?.yesterday ?? null);
      setStats7days(json?.last7days ?? null);
    } catch (e) {
      setStatsError(`Fetch failed: ${String(e?.message ?? e)}`);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchStatsToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="p-6 text-gray-700">管理者権限を確認中…</div>;
  }

  return (
    <div className="p-6">
      {/* ログアウト */}
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          setTimeout(() => router.replace("/login"), 100);
        }}
        className="px-4 py-2 bg-red-500 text-white rounded font-bold"
      >
        ログアウト
      </button>

      <h1 className="text-3xl font-bold mt-4 mb-4">管理者ダッシュボード</h1>

      {/* ===== アップグレード導線（全ユーザー合算） ===== */}
      <div className="space-y-6 mb-6">
        {statsError && (
          <div className="max-w-2xl mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {statsError}
          </div>
        )}

        {statsToday && (
          <div className="max-w-2xl bg-white rounded-2xl p-4 shadow">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">今日</h2>
              <button
                onClick={fetchStatsToday}
                disabled={statsLoading}
                className="text-sm px-3 py-1 rounded-lg bg-gray-200 hover:opacity-90 disabled:opacity-50"
              >
                {statsLoading ? "更新中…" : "更新"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">表示</div>
                <div className="text-lg font-bold">
                  {statsToday.impressions}
                </div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">クリック</div>
                <div className="text-lg font-bold">{statsToday.clicks}</div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">CVR</div>
                <div className="text-lg font-bold">{statsToday.cvr}%</div>
              </div>
            </div>
          </div>
        )}

        {statsYesterday && (
          <div className="max-w-2xl bg-white rounded-2xl p-4 shadow">
            <h2 className="font-bold mb-2">昨日</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">表示</div>
                <div className="text-lg font-bold">
                  {statsYesterday.impressions}
                </div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">クリック</div>
                <div className="text-lg font-bold">{statsYesterday.clicks}</div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">CVR</div>
                <div className="text-lg font-bold">{statsYesterday.cvr}%</div>
              </div>
            </div>
          </div>
        )}

        {stats7days && (
          <div className="max-w-2xl bg-white rounded-2xl p-4 shadow">
            <h2 className="font-bold mb-2">直近7日</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">表示</div>
                <div className="text-lg font-bold">
                  {stats7days.impressions}
                </div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">クリック</div>
                <div className="text-lg font-bold">{stats7days.clicks}</div>
              </div>
              <div className="bg-gray-100 rounded-xl p-2">
                <div className="text-xs text-gray-600">CVR</div>
                <div className="text-lg font-bold">{stats7days.cvr}%</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 既存メニュー */}
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
