// pages/admin/dashboard/students/[id].jsx

import { useRouter } from "next/router";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { formatJST, formatRelativeJST } from "@/src/utils/formatDate";
import { getAccuracyStatus } from "@/src/utils/studyStatus";
import { getAccuracyBarStyle } from "@/src/utils/accuracyBar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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
  const [logs, setLogs] = useState([]);
  const [logLoading, setLogLoading] = useState(true);
  const [showOnlyWeak, setShowOnlyWeak] = useState(false);
  const [period, setPeriod] = useState("all"); // "7" | "30" | "all"

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

      // ③ 学習ログ（集計）取得
      const logRes = await fetch(`/api/admin/study-summary/${user_id}`);
      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(Array.isArray(logData) ? logData : []);
      } else {
        setLogs([]);
      }
      setLogLoading(false);
    };

    init();
  }, [session, user_id]);

  const isWithinPeriod = (isoDate, period) => {
    if (period === "all") return true;

    const now = new Date(); // ← 関数内で生成
    const days = period === "7" ? 7 : 30;
    const target = new Date(isoDate);

    const diffMs = now - target;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays <= days;
  };

  const filteredLogs = logs.filter((l) => {
    // 期間フィルタ
    if (!isWithinPeriod(l.last_study_at, period)) return false;

    // 弱点のみ表示
    if (showOnlyWeak) {
      return l.accuracy !== null && l.accuracy < 50;
    }

    return true;
  });

  const chartData = filteredLogs.map((l) => ({
    unit: l.unit,
    accuracy: l.accuracy ?? 0,
  }));

  const sortedChartData = [...chartData].sort(
    (a, b) => a.accuracy - b.accuracy
  );

  const ROW_HEIGHT = 32; // 単元1つあたりの高さ（px）
  const chartHeight = Math.max(sortedChartData.length * ROW_HEIGHT, 300);

  const getBarColorByAccuracy = (accuracy) => {
    if (accuracy === null || accuracy === undefined) return "#9ca3af"; // gray
    if (accuracy >= 80) return "#16a34a"; // green-600
    if (accuracy >= 50) return "#facc15"; // yellow-400
    return "#dc2626"; // red-600
  };

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

      <h2 className="text-2xl font-bold mt-10 mb-4">単元別 正答率（グラフ）</h2>

      {chartData.length === 0 ? (
        <p className="text-gray-500">表示できるデータがありません。</p>
      ) : (
        // ★ 外側：スクロール担当
        <div className="w-full max-h-[400px] overflow-y-auto bg-white rounded shadow p-4">
          {/* ★ 内側：実際のグラフ高さ */}
          <div style={{ height: `${chartHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedChartData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 120, bottom: 10 }}
              >
                {/* 横軸：正答率 */}
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />

                {/* 縦軸：単元名 */}
                <YAxis
                  type="category"
                  dataKey="unit"
                  width={140}
                  tick={{ fontSize: 12 }}
                />

                <Tooltip formatter={(v) => `${v}%`} />

                <Bar dataKey="accuracy">
                  {sortedChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getBarColorByAccuracy(entry.accuracy)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          const params = new URLSearchParams({
            period,
            weak: showOnlyWeak ? "1" : "0",
          });
          window.open(
            `/api/admin/study-export/${user_id}?${params.toString()}`,
            "_blank"
          );
        }}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        CSVでエクスポート
      </button>

      <h2 className="text-2xl font-bold mt-10 mb-4">学習ログ（単元別）</h2>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setPeriod("7")}
          className={`px-3 py-1 rounded text-sm border ${
            period === "7"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300"
          }`}
        >
          直近7日
        </button>

        <button
          onClick={() => setPeriod("30")}
          className={`px-3 py-1 rounded text-sm border ${
            period === "30"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300"
          }`}
        >
          直近30日
        </button>

        <button
          onClick={() => setPeriod("all")}
          className={`px-3 py-1 rounded text-sm border ${
            period === "all"
              ? "bg-gray-800 text-white border-gray-800"
              : "bg-white text-gray-700 border-gray-300"
          }`}
        >
          すべて
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => setShowOnlyWeak((prev) => !prev)}
          className={`px-3 py-1 rounded text-sm font-medium border
      ${
        showOnlyWeak
          ? "bg-red-100 text-red-700 border-red-300"
          : "bg-white text-gray-700 border-gray-300"
      }`}
        >
          {showOnlyWeak ? "すべて表示" : "弱点（🔴）のみ表示"}
        </button>
      </div>

      {logLoading ? (
        <p className="text-gray-500">学習ログを読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500">まだ学習ログはありません。</p>
      ) : (
        <table className="min-w-full bg-white shadow rounded-lg">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-3">最終学習日</th>
              <th className="p-3">単元</th>
              <th className="p-3">正答率</th>
              <th className="p-3">問題数</th>
              <th className="p-3">学習時間</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((l, i) => {
              const status = getAccuracyStatus(l.accuracy);

              const rowClass =
                status === "good"
                  ? "bg-green-50 hover:bg-green-100"
                  : status === "warning"
                  ? "bg-yellow-50 hover:bg-yellow-100"
                  : status === "danger"
                  ? "bg-red-50 hover:bg-red-100"
                  : "bg-gray-50";

              return (
                <tr key={i} className={`border-b ${rowClass}`}>
                  <td className="p-3">{formatJST(l.last_study_at)}</td>
                  <td className="p-3 font-medium">{l.unit}</td>
                  <td className="p-3">
                    {(() => {
                      const bar = getAccuracyBarStyle(l.accuracy);
                      return (
                        <div className="w-full">
                          <div className="h-3 bg-gray-200 rounded">
                            <div
                              className={`h-3 rounded ${bar.color}`}
                              style={{ width: bar.width }}
                            />
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {l.accuracy !== null ? `${l.accuracy}%` : "—"}
                          </div>
                        </div>
                      );
                    })()}
                  </td>

                  <td className="p-3">
                    {l.correct_count}/{l.total_count}
                  </td>
                  <td className="p-3">
                    {l.total_answer_time
                      ? `${Math.floor(l.total_answer_time / 60)}分`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  {showOnlyWeak
                    ? "弱点（正答率50%未満）の単元はありません。"
                    : "選択した期間の学習ログはありません。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
