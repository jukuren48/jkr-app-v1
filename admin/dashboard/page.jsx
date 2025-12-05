// app/admin/dashboard/page.jsx

import { createClient } from "@/utils/supabase/server";
import dayjs from "dayjs";

export default async function DashboardPage() {
  const supabase = createClient();

  // 今日の日付範囲を作成
  const startOfToday = dayjs().startOf("day").toISOString();
  const endOfToday = dayjs().endOf("day").toISOString();

  // 1️⃣ 今日の学習ログ件数
  const { data: todayLogs } = await supabase
    .from("study_logs")
    .select("*")
    .gte("created_at", startOfToday)
    .lte("created_at", endOfToday);

  // 2️⃣ 全ログ件数
  const { data: allLogs } = await supabase.from("study_logs").select("*");

  // 3️⃣ 平均正答率
  const correctCount = allLogs.filter((log) => log.is_correct).length;
  const accuracy =
    allLogs.length > 0 ? ((correctCount / allLogs.length) * 100).toFixed(1) : 0;

  // 4️⃣ 適当回答（AA判定）
  const suspiciousCount = allLogs.filter((log) => log.is_suspicious).length;

  // 5️⃣ 時間切れ
  const timeoutCount = allLogs.filter((log) => log.is_timeout).length;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">ダッシュボード</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="今日の学習ログ" value={todayLogs.length} />
        <StatCard title="総ログ数" value={allLogs.length} />
        <StatCard title="平均正答率" value={`${accuracy}%`} />
        <StatCard title="適当回答（疑い）" value={suspiciousCount} />
        <StatCard title="時間切れの回数" value={timeoutCount} />
      </div>
    </div>
  );
}

// シンプルなカードコンポーネント（UIを整えるため）
function StatCard({ title, value }) {
  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <div className="text-gray-600 text-sm">{title}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </div>
  );
}
