import { useRouter } from "next/router";

export default function LearningDashboard({
  streak,
  studiedToday,
  reviewCount,
  weakTop3,
}) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow p-5 mb-6">
      <h2 className="text-xl font-bold mb-4 text-center">
        今日の学習ダッシュボード
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ストリーク */}
        <div className="bg-orange-100 border border-orange-300 rounded-xl p-4 text-center">
          <div className="text-lg font-bold mb-2">🔥 連続学習</div>

          <div className="text-3xl font-bold">{streak}日</div>

          <div className="text-sm mt-2">
            {studiedToday ? "今日も学習済み！" : "今日も学習して記録更新！"}
          </div>
        </div>

        {/* 復習 */}
        <div className="bg-indigo-100 border border-indigo-300 rounded-xl p-4 text-center">
          <div className="text-lg font-bold mb-2">🧠 今日の復習</div>

          <div className="text-3xl font-bold">{reviewCount}問</div>

          <button
            onClick={() => router.push("/my")}
            className="mt-3 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            復習する
          </button>
        </div>

        {/* 弱点 */}
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 text-center">
          <div className="text-lg font-bold mb-2">🎯 弱点トレーニング</div>

          <div className="text-sm mb-3">
            {weakTop3?.length
              ? weakTop3.map((u) => u.unit).join(" / ")
              : "弱点データなし"}
          </div>

          <button
            onClick={() => router.push("/my")}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            トレーニング
          </button>
        </div>
      </div>
    </div>
  );
}
