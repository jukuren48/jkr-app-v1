import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import LearningDashboard from "@/src/components/LearningDashboard";
import { useSupabase } from "@/src/providers/SupabaseProvider";
import {
  getUnderstandingMessage,
  getRetentionMessage,
  getPriorityMessage,
} from "@/lib/learningMessages";

function scoreColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "#CBD5E1";
  if (n >= 80) return "#22C55E";
  if (n >= 60) return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score, type = "understanding") {
  const n = Number(score);
  if (!Number.isFinite(n)) return "未計測";

  if (type === "retention") {
    if (n >= 70) return "しっかり定着";
    if (n >= 40) return "忘れかけ";
    return "要復習";
  }

  if (n >= 80) return "よく理解できています";
  if (n >= 60) return "かなり理解しています";
  if (n >= 40) return "まだ不安定です";
  return "要理解";
}

function ProgressBar({ value, label }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="text-slate-700 font-medium">{label}</span>
        <span className="font-bold text-slate-800">
          {safeValue.toFixed(0)}%
        </span>
      </div>
      <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-3 rounded-full transition-all"
          style={{
            width: `${safeValue}%`,
            backgroundColor: scoreColor(safeValue),
          }}
        />
      </div>
    </div>
  );
}

function HorizontalTopChart({
  title,
  description,
  data,
  dataKey,
  onBarClick,
  scoreType = "understanding",
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1 mb-4">{description}</p>

      {data.length === 0 ? (
        <p className="text-slate-500">表示できるデータがありません。</p>
      ) : (
        <div className="w-full h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
            >
              <XAxis type="number" domain={[0, 100]} />
              <YAxis
                type="category"
                dataKey="unit"
                width={220}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Bar dataKey={dataKey} radius={[0, 8, 8, 0]} onClick={onBarClick}>
                {data.map((entry, index) => (
                  <Cell
                    key={`${dataKey}-cell-${index}`}
                    fill={scoreColor(entry[dataKey])}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-4 text-sm text-slate-600">
          {scoreType === "priority"
            ? "数値が高いほど、今すぐ復習した方がよい単元です。"
            : scoreType === "retention"
              ? "低いほど忘れかけています。"
              : "低いほど自力での理解が不安定です。"}
        </div>
      )}
    </div>
  );
}

export default function MyDataPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase();

  const [unitStats, setUnitStats] = useState([]);
  const [reviewQuestions, setReviewQuestions] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  const [chartMode, setChartMode] = useState("priority");
  const [tableFilter, setTableFilter] = useState("all");

  const fetchJson = async (url) => {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData?.session?.access_token;

    if (!token) {
      throw new Error("No access token");
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || `${url} failed: ${res.status}`);
    }

    return json;
  };

  const enrichReviewQuestionsWithMaster = async (questions) => {
    const needsText = questions.filter(
      (q) => !q.question_text || String(q.question_text).trim() === "",
    );

    if (needsText.length === 0) {
      return questions;
    }

    try {
      const res = await fetch("/api/questions2");
      if (!res.ok) {
        throw new Error(`/api/questions2 failed: ${res.status}`);
      }

      const masterQuestions = await res.json();

      const masterMap = new Map(
        (masterQuestions ?? []).map((q) => [String(q.id), q.question ?? ""]),
      );

      return questions.map((q) => {
        if (q.question_text && String(q.question_text).trim() !== "") {
          return q;
        }

        const fallbackText = masterMap.get(String(q.question_id)) ?? "";
        return {
          ...q,
          question_text: fallbackText,
        };
      });
    } catch (error) {
      console.error("reviewQuestions 補完エラー:", error);
      return questions;
    }
  };

  useEffect(() => {
    let alive = true;

    if (session === null) {
      router.replace("/login");
      return;
    }
    if (!session) return;

    async function loadAll() {
      try {
        setLoading(true);

        const [summary, reviewData, streakData, rankingData] =
          await Promise.all([
            fetchJson("/api/me/study-summary"),
            fetchJson("/api/me/review-questions?limit=20"),
            fetchJson("/api/me/streak"),
            fetchJson("/api/me/weekly-ranking"),
          ]);

        if (!alive) return;

        setUnitStats(Array.isArray(summary) ? summary : []);
        const rawReviewQuestions = Array.isArray(reviewData?.questions)
          ? reviewData.questions
          : [];

        const enrichedReviewQuestions =
          await enrichReviewQuestionsWithMaster(rawReviewQuestions);

        setReviewQuestions(enrichedReviewQuestions);
        setReviewCount(Number(reviewData?.count ?? 0));
        setStreak(Number(streakData?.streak ?? 0));
        setRanking(
          Array.isArray(rankingData?.ranking) ? rankingData.ranking : [],
        );
      } catch (error) {
        console.error("MyDataPage load error:", error);
        if (alive) {
          setUnitStats([]);
          setReviewQuestions([]);
          setReviewCount(0);
          setStreak(0);
          setRanking([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadAll();

    return () => {
      alive = false;
    };
  }, [session, router]);

  const weakTop3 = useMemo(() => {
    return [...unitStats]
      .filter((item) => Number.isFinite(Number(item.review_priority)))
      .sort(
        (a, b) =>
          Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
      )
      .slice(0, 3);
  }, [unitStats]);

  const urgentTotal = useMemo(() => {
    return unitStats.reduce(
      (sum, item) => sum + Number(item.urgent_count ?? 0),
      0,
    );
  }, [unitStats]);

  const avgUnderstanding = useMemo(() => {
    const valid = unitStats.filter((item) =>
      Number.isFinite(Number(item.understanding_score)),
    );
    if (valid.length === 0) return null;
    const sum = valid.reduce(
      (acc, item) => acc + Number(item.understanding_score ?? 0),
      0,
    );
    return sum / valid.length;
  }, [unitStats]);

  const avgRetention = useMemo(() => {
    const valid = unitStats.filter((item) =>
      Number.isFinite(Number(item.retention_score)),
    );
    if (valid.length === 0) return null;
    const sum = valid.reduce(
      (acc, item) => acc + Number(item.retention_score ?? 0),
      0,
    );
    return sum / valid.length;
  }, [unitStats]);

  const todayRecommendation = useMemo(() => {
    if (!unitStats.length) {
      return {
        title: "今日はまず1問解いてみましょう",
        message:
          "まだ学習データが少ないので、まずは問題を解いて理解度と定着度をためていきましょう。",
        actionLabel: "問題を解く",
        actionType: "home",
        unit: null,
      };
    }

    const sortedByPriority = [...unitStats].sort(
      (a, b) => Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
    );

    const topUnit = sortedByPriority[0];
    const topPriority = Number(topUnit?.review_priority ?? 0);
    const topUnderstanding = Number(topUnit?.understanding_score ?? 0);
    const topRetention = Number(topUnit?.retention_score ?? 0);
    const urgentCount = Number(topUnit?.urgent_count ?? 0);

    if (reviewQuestions.length > 0 && urgentTotal >= 3) {
      return {
        title: "今日は最優先の復習から始めましょう",
        message: `要復習問題が ${urgentTotal} 問あります。まずは復習で、忘れかけている内容を思い出すのがおすすめです。`,
        actionLabel: "復習を始める",
        actionType: "review",
        unit: null,
      };
    }

    if (topUnit && topRetention < 50 && topUnderstanding >= 70) {
      return {
        title: `今日は「${topUnit.unit}」の復習がおすすめです`,
        message: `理解度は ${topUnderstanding.toFixed(0)}% と高めですが、定着度が ${topRetention.toFixed(0)}% まで下がっています。今のうちに復習すると効果的です。`,
        actionLabel: "この単元を復習する",
        actionType: "unit",
        unit: topUnit.unit,
      };
    }

    if (topUnit && topUnderstanding < 60) {
      return {
        title: `今日は「${topUnit.unit}」を重点的に進めましょう`,
        message: `この単元は理解度が ${topUnderstanding.toFixed(0)}% で、まだ不安定です。解説を確認しながら、もう一度自力で解いてみるのがおすすめです。`,
        actionLabel: "この単元を解く",
        actionType: "unit",
        unit: topUnit.unit,
      };
    }

    if (weakTop3.length > 0) {
      return {
        title: "今日は弱点トレーニングがおすすめです",
        message: `復習優先度が高い単元は「${weakTop3
          .map((x) => x.unit)
          .slice(0, 3)
          .join("、")}」です。苦手をまとめて練習しましょう。`,
        actionLabel: "弱点トレーニングへ",
        actionType: "weak",
        unit: null,
      };
    }

    return {
      title: "今日は今の調子を維持しましょう",
      message:
        "大きく崩れている単元は少なめです。今のペースで学習を続けながら、気になる単元を1つ解いてみましょう。",
      actionLabel: "問題を解く",
      actionType: "home",
      unit: null,
    };
  }, [unitStats, reviewQuestions, urgentTotal, weakTop3]);

  const priorityTop10 = useMemo(() => {
    return [...unitStats]
      .filter((item) => Number.isFinite(Number(item.review_priority)))
      .sort(
        (a, b) =>
          Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
      )
      .slice(0, 10)
      .map((item) => ({
        ...item,
        review_priority: Number(item.review_priority ?? 0),
      }));
  }, [unitStats]);

  const understandingWorst10 = useMemo(() => {
    return [...unitStats]
      .filter((item) => Number.isFinite(Number(item.understanding_score)))
      .sort(
        (a, b) =>
          Number(a.understanding_score ?? 0) -
          Number(b.understanding_score ?? 0),
      )
      .slice(0, 10)
      .map((item) => ({
        ...item,
        understanding_score: Number(item.understanding_score ?? 0),
      }));
  }, [unitStats]);

  const retentionWorst10 = useMemo(() => {
    return [...unitStats]
      .filter((item) => Number.isFinite(Number(item.retention_score)))
      .sort(
        (a, b) =>
          Number(a.retention_score ?? 0) - Number(b.retention_score ?? 0),
      )
      .slice(0, 10)
      .map((item) => ({
        ...item,
        retention_score: Number(item.retention_score ?? 0),
      }));
  }, [unitStats]);

  const filteredTableData = useMemo(() => {
    const rows = [...unitStats];

    if (tableFilter === "urgent") {
      return rows
        .filter((item) => Number(item.urgent_count ?? 0) > 0)
        .sort(
          (a, b) =>
            Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
        );
    }

    if (tableFilter === "low-understanding") {
      return rows.sort(
        (a, b) =>
          Number(a.understanding_score ?? 0) -
          Number(b.understanding_score ?? 0),
      );
    }

    if (tableFilter === "low-retention") {
      return rows.sort(
        (a, b) =>
          Number(a.retention_score ?? 0) - Number(b.retention_score ?? 0),
      );
    }

    if (tableFilter === "high-priority") {
      return rows.sort(
        (a, b) =>
          Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
      );
    }

    return rows.sort((a, b) => a.unit.localeCompare(b.unit, "ja"));
  }, [unitStats, tableFilter]);

  const handleReviewStart = () => {
    if (!reviewQuestions.length) {
      alert("今日の復習問題はありません。");
      return;
    }

    localStorage.setItem("startReviewTraining", "true");
    localStorage.setItem(
      "reviewQuestionIds",
      JSON.stringify(reviewQuestions.map((q) => String(q.question_id))),
    );

    router.push("/");
  };

  const handleWeakTrainingStart = () => {
    if (!weakTop3.length) {
      alert("弱点データがまだありません。");
      return;
    }

    const weakUnits = weakTop3.map((item) => item.unit).filter(Boolean);

    if (!weakUnits.length) {
      alert("弱点単元が取得できませんでした。");
      return;
    }

    localStorage.setItem("weakTrainingUnits", JSON.stringify(weakUnits));
    localStorage.setItem("questionCount", JSON.stringify(10));
    localStorage.setItem("startWeakTraining", "true");

    router.push("/");
  };

  const handleRecommendationAction = () => {
    if (todayRecommendation.actionType === "review") {
      handleReviewStart();
      return;
    }

    if (todayRecommendation.actionType === "weak") {
      handleWeakTrainingStart();
      return;
    }

    if (todayRecommendation.actionType === "unit" && todayRecommendation.unit) {
      handleUnitBarClick({ unit: todayRecommendation.unit });
      return;
    }

    router.push("/");
  };

  const handleUnitBarClick = (data) => {
    const unit = data?.unit;
    if (!unit) return;

    localStorage.setItem("startUnitFromMyData", unit);
    localStorage.setItem("enteringQuestion", "1");

    router.push("/");
  };

  const handleReviewQuestionStart = (questionId) => {
    if (!questionId) return;

    localStorage.setItem("startReviewTraining", "true");
    localStorage.setItem(
      "reviewQuestionIds",
      JSON.stringify([String(questionId)]),
    );

    router.push("/");
  };

  const currentChart = useMemo(() => {
    if (chartMode === "understanding") {
      return {
        title: "理解度ワースト10",
        description: "自力での理解が不安定な単元です。",
        data: understandingWorst10,
        dataKey: "understanding_score",
        scoreType: "understanding",
      };
    }

    if (chartMode === "retention") {
      return {
        title: "定着度ワースト10",
        description: "以前できたけれど、忘れかけている単元です。",
        data: retentionWorst10,
        dataKey: "retention_score",
        scoreType: "retention",
      };
    }

    return {
      title: "復習優先度 TOP10",
      description: "今すぐ復習した方がよい単元です。",
      data: priorityTop10,
      dataKey: "review_priority",
      scoreType: "priority",
    };
  }, [chartMode, priorityTop10, understandingWorst10, retentionWorst10]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-6 text-slate-700">
            学習データを読み込み中です...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              学習ダッシュボード
            </h1>
            <p className="text-slate-600 mt-1">
              理解度と定着度から、今やるべき復習を見つけましょう。
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition"
          >
            問題画面へ戻る
          </button>
        </div>

        <LearningDashboard
          streak={streak}
          reviewCount={reviewCount}
          weakTop3={weakTop3}
          onStartReview={handleReviewStart}
          onStartWeakTraining={handleWeakTrainingStart}
        />

        <section className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl shadow p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-3xl">
              <p className="text-sm font-bold text-blue-700 mb-2">
                📌 今日のおすすめ
              </p>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {todayRecommendation.title}
              </h2>
              <p className="text-slate-700 leading-relaxed">
                {todayRecommendation.message}
              </p>
            </div>

            <button
              onClick={handleRecommendationAction}
              className="px-5 py-3 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition"
            >
              {todayRecommendation.actionLabel}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">平均理解度</p>
            <p className="text-3xl font-bold text-slate-900">
              {avgUnderstanding == null
                ? "--"
                : `${avgUnderstanding.toFixed(0)}%`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {avgUnderstanding == null
                ? "まだデータがありません"
                : scoreLabel(avgUnderstanding, "understanding")}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">平均定着度</p>
            <p className="text-3xl font-bold text-slate-900">
              {avgRetention == null ? "--" : `${avgRetention.toFixed(0)}%`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {avgRetention == null
                ? "まだデータがありません"
                : scoreLabel(avgRetention, "retention")}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">最優先復習問題数</p>
            <p className="text-3xl font-bold text-slate-900">{urgentTotal}</p>
            <p className="mt-2 text-sm text-slate-600">
              今やるべき問題を優先して復習しましょう
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setChartMode("priority")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                chartMode === "priority"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              復習優先度TOP10
            </button>

            <button
              onClick={() => setChartMode("understanding")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                chartMode === "understanding"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              理解度ワースト10
            </button>

            <button
              onClick={() => setChartMode("retention")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                chartMode === "retention"
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              定着度ワースト10
            </button>
          </div>

          <HorizontalTopChart
            title={currentChart.title}
            description={currentChart.description}
            data={currentChart.data}
            dataKey={currentChart.dataKey}
            scoreType={currentChart.scoreType}
            onBarClick={handleUnitBarClick}
          />
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">全単元一覧</h2>
              <p className="text-sm text-slate-600 mt-1">
                単元が多い場合は、表の方が見やすく確認できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTableFilter("all")}
                className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                  tableFilter === "all"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                すべて
              </button>
              <button
                onClick={() => setTableFilter("urgent")}
                className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                  tableFilter === "urgent"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                要復習だけ
              </button>
              <button
                onClick={() => setTableFilter("low-understanding")}
                className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                  tableFilter === "low-understanding"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                理解度が低い順
              </button>
              <button
                onClick={() => setTableFilter("low-retention")}
                className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                  tableFilter === "low-retention"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                定着度が低い順
              </button>
              <button
                onClick={() => setTableFilter("high-priority")}
                className={`px-3 py-2 rounded-full text-sm font-semibold transition ${
                  tableFilter === "high-priority"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                優先度が高い順
              </button>
            </div>
          </div>

          {filteredTableData.length === 0 ? (
            <p className="text-slate-500">表示できる単元がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="text-left py-3 pr-4">単元</th>
                    <th className="text-right py-3 px-4">正答率</th>
                    <th className="text-right py-3 px-4">理解度</th>
                    <th className="text-right py-3 px-4">定着度</th>
                    <th className="text-right py-3 px-4">優先度</th>
                    <th className="text-right py-3 px-4">要復習</th>
                    <th className="text-right py-3 pl-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableData.map((item) => (
                    <tr
                      key={item.unit}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 pr-4 text-slate-900 font-medium">
                        {item.unit}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {Number(item.accuracy ?? 0).toFixed(0)}%
                      </td>
                      <td
                        className="py-3 px-4 text-right font-semibold"
                        style={{ color: scoreColor(item.understanding_score) }}
                      >
                        {Number(item.understanding_score ?? 0).toFixed(0)}%
                      </td>
                      <td
                        className="py-3 px-4 text-right font-semibold"
                        style={{ color: scoreColor(item.retention_score) }}
                      >
                        {Number(item.retention_score ?? 0).toFixed(0)}%
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        {Number(item.review_priority ?? 0).toFixed(0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {Number(item.urgent_count ?? 0)}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                `/my/unit/${encodeURIComponent(item.unit)}`,
                              )
                            }
                            className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50 transition"
                          >
                            詳細
                          </button>
                          <button
                            onClick={() =>
                              handleUnitBarClick({ unit: item.unit })
                            }
                            className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition"
                          >
                            解く
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                要復習問題一覧
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                復習で解けるかを確認しましょう。
              </p>
            </div>
            <button
              onClick={handleReviewStart}
              className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition"
            >
              復習を始める
            </button>
          </div>

          {reviewQuestions.length === 0 ? (
            <p className="text-slate-500">今のところ要復習問題はありません。</p>
          ) : (
            <div className="space-y-3">
              {reviewQuestions.map((q) => {
                const understanding =
                  q.understanding_score == null
                    ? null
                    : Number(q.understanding_score);
                const retention =
                  q.retention_score == null ? null : Number(q.retention_score);
                const priority =
                  q.review_priority == null ? null : Number(q.review_priority);

                return (
                  <div
                    key={`${q.question_id}-${q.source ?? "review"}`}
                    className="border border-slate-200 rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                            {q.unit || "未分類"}
                          </span>
                          <span
                            className="text-sm px-2 py-1 rounded-full text-white font-semibold"
                            style={{ backgroundColor: scoreColor(priority) }}
                          >
                            {q.status_label || "要復習"}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm text-slate-500">問題</p>
                          <p className="text-sm md:text-base text-slate-800 font-medium leading-relaxed">
                            {q.question_text &&
                            String(q.question_text).trim() !== ""
                              ? q.question_text.length > 90
                                ? `${q.question_text.slice(0, 90)}...`
                                : q.question_text
                              : `問題ID: ${q.question_id}`}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-[280px]">
                          {understanding == null ? (
                            <div className="text-sm text-slate-500">
                              理解度：未計測
                            </div>
                          ) : (
                            <ProgressBar value={understanding} label="理解度" />
                          )}

                          {retention == null ? (
                            <div className="text-sm text-slate-500">
                              定着度：未計測
                            </div>
                          ) : (
                            <ProgressBar value={retention} label="定着度" />
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 min-w-[160px]">
                        <button
                          onClick={() =>
                            handleReviewQuestionStart(q.question_id)
                          }
                          className="px-4 py-2 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition"
                        >
                          この問題を復習
                        </button>
                        <p className="text-xs text-slate-500">
                          復習優先度:{" "}
                          {priority == null ? "未計測" : priority.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            今週ランキング
          </h2>

          {ranking.length === 0 ? (
            <p className="text-slate-500">ランキングデータがありません。</p>
          ) : (
            <div className="space-y-3">
              {ranking.map((row, index) => (
                <div
                  key={`${row.user_id ?? row.name ?? "rank"}-${index}`}
                  className="flex items-center justify-between border border-slate-200 rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {row.name ?? "ユーザー"}
                      </p>
                      <p className="text-sm text-slate-500">
                        学習回数 {row.count ?? 0}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-slate-900">{row.count ?? 0}</p>
                    <p className="text-xs text-slate-500">今週</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
