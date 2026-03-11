import { useSupabase } from "@/src/providers/SupabaseProvider";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { LabelList } from "recharts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function MyDataPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase();
  const [data, setData] = useState([]);
  const [period, setPeriod] = useState("all");
  const [showOnlyWeak, setShowOnlyWeak] = useState(false);
  const aggregatedByUnit = {};
  data.forEach((l) => {
    const unit = l.unit;
    const acc = l.accuracy ?? 0;

    if (!aggregatedByUnit[unit]) {
      aggregatedByUnit[unit] = {
        total: 0,
        count: 0,
      };
    }

    aggregatedByUnit[unit].total += acc;
    aggregatedByUnit[unit].count += 1;
  });

  // logs からグラフ用データを作る
  const chartData = Object.entries(aggregatedByUnit).map(([unit, v]) => ({
    unit,
    accuracy: Math.round(v.total / v.count),
  }));
  const filteredChartData = showOnlyWeak
    ? chartData.filter((d) => d.accuracy !== null && d.accuracy < 80)
    : chartData;
  const sortedChartData = [...filteredChartData].sort(
    (a, b) => a.accuracy - b.accuracy,
  );
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  const ROW_HEIGHT = 32; // 単元1つあたりの高さ
  const chartHeight = Math.max(sortedChartData.length * ROW_HEIGHT, 300);
  const getBarColor = (accuracy) => {
    if (accuracy === null || accuracy === undefined) return "#d1d5db"; // グレー
    if (accuracy < 50) return "#ef4444"; // 赤
    if (accuracy < 80) return "#facc15"; // 黄
    return "#22c55e"; // 緑
  };

  useEffect(() => {
    if (session === null) {
      router.replace("/login");
      return;
    }
    if (!session) return;

    const fetchData = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData?.session?.access_token;

        if (!token) {
          console.error("No access token");
          setData([]);
          return;
        }

        const res = await fetch(`/api/me/study-summary?period=${period}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json = await res.json();
        console.log("study-summary status =", res.status);
        console.log("study-summary response =", json);

        if (!res.ok) {
          console.error("study-summary fetch failed:", json);
          setData([]);
          return;
        }

        setData(json);
      } catch (err) {
        console.error("study-summary fetch exception:", err);
        setData([]);
      }
    };

    fetchData();
  }, [session, period]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-blue-600 underline"
      >
        ← 単元選択画面に戻る
      </button>

      <h1 className="text-2xl font-bold mb-4">My学習データ</h1>

      {/* 期間切り替え */}
      <div className="flex gap-2 mb-4">
        {["7", "30", "all"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded border ${
              period === p ? "bg-blue-600 text-white" : ""
            }`}
          >
            {p === "7" ? "7日" : p === "30" ? "30日" : "すべて"}
          </button>
        ))}
      </div>

      {/* グラフ */}
      <h2 className="text-xl font-bold mt-8 mb-4">単元別 正答率</h2>
      <button
        onClick={() => setShowOnlyWeak((prev) => !prev)}
        className={`mb-4 px-3 py-1 rounded text-sm border
    ${
      showOnlyWeak
        ? "bg-red-100 text-red-700 border-red-300"
        : "bg-white text-gray-700 border-gray-300"
    }`}
      >
        {showOnlyWeak ? "すべて表示" : "要復習（🔴🟡）のみ表示"}
      </button>

      {chartData.length === 0 ? (
        <p className="text-gray-500">表示できるデータがありません。</p>
      ) : (
        // ★ 外側：スクロール担当
        <div className="w-full max-h-[400px] overflow-y-auto bg-white rounded shadow p-4">
          {/* ★ 内側：実データ数に応じた高さ */}
          <div style={{ height: `${chartHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedChartData}
                layout="vertical"
                margin={{
                  top: 10,
                  right: 40,
                  left: isMobile ? 40 : 100,
                  bottom: 10,
                }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />

                <YAxis
                  type="category"
                  dataKey="unit"
                  width={isMobile ? 80 : 140}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />

                <Tooltip
                  formatter={(value, name, props) =>
                    `${props.payload.accuracy}%`
                  }
                />

                <Bar
                  dataKey="accuracy"
                  minPointSize={6}
                  onClick={(payload) => {
                    const unit =
                      payload?.payload?.unit ??
                      payload?.activePayload?.[0]?.payload?.unit;

                    if (!unit) return;

                    console.log("🎯 Myデータから unit 指定:", unit);

                    // ★★★★★ ここが決定打 ★★★★★
                    try {
                      // すべてのBGMを強制停止
                      if (typeof window !== "undefined") {
                        window.stopBgm?.(true);
                        window.stopQbgm?.(true);
                        window.resetAudioState?.();
                      }
                    } catch (e) {
                      console.warn("[Audio] force stop failed:", e);
                    }

                    // Myデータ経由フラグ
                    localStorage.setItem("fromMyData", "1");
                    localStorage.setItem("startUnitFromMyData", unit);
                    localStorage.setItem("enteringQuestion", "1");

                    // 少しだけ待ってから遷移（音の完全停止を保証）
                    setTimeout(() => {
                      router.push("/");
                    }, 50);
                  }}
                >
                  {/* ★ 正答率ラベルを右側に表示 */}
                  <LabelList
                    dataKey="accuracy"
                    position="right"
                    formatter={(v) => `${v}%`}
                    style={{
                      fill: "#374151", // 濃いグレー（スマホでも見やすい）
                      fontSize: 12,
                      fontWeight: 600,
                      pointerEvents: "none", // ← クリック判定に影響させない
                    }}
                  />

                  {sortedChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getBarColor(entry.accuracy)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
