// pages/admin/dashboard/students/[id].jsx

import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import dayjs from "dayjs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";

export async function getServerSideProps(ctx) {
  const supabase = createServerSupabaseClient(ctx);
  const { id } = ctx.params;

  // ログインチェック
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  // 生徒情報取得
  const { data: student } = await supabase
    .from("users_extended")
    .select("*")
    .eq("id", id)
    .single();

  // 学習ログ取得
  const { data: logsRaw, error } = await supabase
    .from("study_logs")
    .select("*")
    .eq("user_id", id);

  if (error) {
    console.error("ログ取得エラー:", error);
  }

  return {
    props: {
      student: student ?? null,
      logs: logsRaw ?? [],
    },
  };
}

export default function StudentDetailPage({ student, logs }) {
  // --- 各種集計 ---

  const total = logs.length;
  const correct = logs.filter((l) => l.is_correct).length;
  const suspicious = logs.filter((l) => l.is_suspicious).length;

  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "-";

  // 今日の範囲
  const startOfToday = dayjs().startOf("day").toISOString();
  const endOfToday = dayjs().endOf("day").toISOString();

  const today = logs.filter(
    (l) => l.created_at >= startOfToday && l.created_at <= endOfToday
  ).length;

  // 単元別正答率
  const units = {};
  logs.forEach((log) => {
    if (!units[log.unit]) {
      units[log.unit] = { total: 0, correct: 0 };
    }
    units[log.unit].total++;
    if (log.is_correct) units[log.unit].correct++;
  });

  const unitStats = Object.entries(units).map(([unit, data]) => ({
    unit,
    accuracy: ((data.correct / data.total) * 100).toFixed(1),
    total: data.total,
  }));

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">
        {student?.name || "生徒"} の学習カルテ
      </h1>

      {/* 基本情報カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <InfoCard title="総ログ数" value={total} />
        <InfoCard
          title="正答率"
          value={accuracy === "-" ? "-" : `${accuracy}%`}
        />
        <InfoCard title="適当回答（疑い）" value={suspicious} />
        <InfoCard title="今日の学習数" value={today} />
        <InfoCard
          title="最終ログイン"
          value={
            student?.last_login
              ? dayjs(student.last_login).format("YYYY/MM/DD HH:mm")
              : "-"
          }
        />
      </div>

      {/* 単元別正答率 */}
      <h2 className="text-2xl font-bold mb-3">単元別 正答率</h2>
      <UnitTable stats={unitStats} />

      {/* 日別学習量 */}
      <h2 className="text-2xl font-bold mb-3 mt-10">日別の学習量</h2>
      <DailyStudyChart logs={logs} />

      {/* 正答率の推移 */}
      <h2 className="text-2xl font-bold mb-3 mt-10">正答率の推移</h2>
      <AccuracyChart logs={logs} />
    </div>
  );
}

/* =======================
  情報カード
======================= */
function InfoCard({ title, value }) {
  return (
    <div className="bg-white shadow p-6 rounded-lg">
      <div className="text-gray-600 text-sm">{title}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </div>
  );
}

/* =======================
  単元別正答率テーブル
======================= */
function UnitTable({ stats }) {
  return (
    <table className="min-w-full bg-white shadow rounded-lg mb-10">
      <thead>
        <tr className="bg-gray-100 text-left text-gray-700 text-sm">
          <th className="p-4">単元</th>
          <th className="p-4">正答率</th>
          <th className="p-4">学習数</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((u) => (
          <tr key={u.unit} className="border-b hover:bg-gray-50">
            <td className="p-4">{u.unit}</td>
            <td className="p-4">{u.accuracy}%</td>
            <td className="p-4">{u.total}</td>
          </tr>
        ))}

        {stats.length === 0 && (
          <tr>
            <td className="p-4" colSpan={3}>
              まだ学習ログがありません。
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/* =======================
  日別学習量グラフ
======================= */
function DailyStudyChart({ logs }) {
  const map = {};
  logs.forEach((log) => {
    const date = log.created_at.slice(0, 10); // YYYY-MM-DD
    if (!map[date]) map[date] = 0;
    map[date]++;
  });

  const data = Object.entries(map).map(([date, count]) => ({
    date,
    count,
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* =======================
  正答率の推移グラフ
======================= */
function AccuracyChart({ logs }) {
  const map = {};
  logs.forEach((log) => {
    const date = log.created_at.slice(0, 10);
    if (!map[date]) map[date] = { correct: 0, total: 0 };
    map[date].total++;
    if (log.is_correct) map[date].correct++;
  });

  const data = Object.entries(map).map(([date, obj]) => ({
    date,
    accuracy: ((obj.correct / obj.total) * 100).toFixed(1),
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="#10b981"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
