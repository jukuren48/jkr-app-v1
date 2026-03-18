import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/src/providers/SupabaseProvider";

function scoreColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "#CBD5E1";
  if (n >= 80) return "#22C55E";
  if (n >= 60) return "#F59E0B";
  return "#EF4444";
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

function formatDate(dateString) {
  if (!dateString) return "未記録";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "未記録";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function UnitDetailPage() {
  const router = useRouter();
  const { supabase, session } = useSupabase();
  const unit = String(router.query.unit ?? "");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

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

  useEffect(() => {
    let alive = true;

    if (session === null) {
      router.replace("/login");
      return;
    }
    if (!session || !unit) return;

    async function load() {
      try {
        setLoading(true);
        const data = await fetchJson(
          `/api/me/question-progress?unit=${encodeURIComponent(unit)}`,
        );
        if (!alive) return;
        setRows(Array.isArray(data?.questions) ? data.questions : []);
      } catch (error) {
        console.error("UnitDetailPage load error:", error);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [session, unit, router]);

  const summary = useMemo(() => {
    if (!rows.length) {
      return {
        count: 0,
        avgAccuracy: 0,
        avgUnderstanding: 0,
        avgRetention: 0,
        urgentCount: 0,
      };
    }

    const sumAccuracy = rows.reduce((a, r) => a + Number(r.accuracy ?? 0), 0);
    const sumUnderstanding = rows.reduce(
      (a, r) => a + Number(r.understanding_score ?? 0),
      0,
    );
    const sumRetention = rows.reduce(
      (a, r) => a + Number(r.retention_score ?? 0),
      0,
    );
    const urgentCount = rows.filter(
      (r) => Number(r.review_priority ?? 0) >= 80,
    ).length;

    return {
      count: rows.length,
      avgAccuracy: sumAccuracy / rows.length,
      avgUnderstanding: sumUnderstanding / rows.length,
      avgRetention: sumRetention / rows.length,
      urgentCount,
    };
  }, [rows]);

  const handleSolveUnit = () => {
    if (!unit) return;
    localStorage.setItem("startUnitFromMyData", unit);
    localStorage.setItem("enteringQuestion", "1");
    router.push("/");
  };

  const handleSolveQuestion = (questionId) => {
    if (!questionId) return;
    localStorage.setItem("startReviewTraining", "true");
    localStorage.setItem(
      "reviewQuestionIds",
      JSON.stringify([String(questionId)]),
    );
    router.push("/");
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort(
      (a, b) => Number(b.review_priority ?? 0) - Number(a.review_priority ?? 0),
    );
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-6 text-slate-700">
            単元データを読み込み中です...
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
            <h1 className="text-3xl font-bold text-slate-900">{unit}</h1>
            <p className="text-slate-600 mt-1">
              この単元の問題ごとの理解度・定着度を確認できます。
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => router.push("/my")}
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50 transition"
            >
              ダッシュボードへ戻る
            </button>
            <button
              onClick={handleSolveUnit}
              className="px-4 py-2 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition"
            >
              この単元を解く
            </button>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">問題数</p>
            <p className="text-3xl font-bold text-slate-900">{summary.count}</p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">平均正答率</p>
            <p className="text-3xl font-bold text-slate-900">
              {summary.avgAccuracy.toFixed(0)}%
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">平均理解度</p>
            <p className="text-3xl font-bold text-slate-900">
              {summary.avgUnderstanding.toFixed(0)}%
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500 mb-2">最優先復習問題数</p>
            <p className="text-3xl font-bold text-slate-900">
              {summary.urgentCount}
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            問題別の学習状況
          </h2>

          {sortedRows.length === 0 ? (
            <p className="text-slate-500">
              この単元の問題データはまだありません。
            </p>
          ) : (
            <div className="space-y-4">
              {sortedRows.map((row, index) => (
                <div
                  key={`${row.question_id}-${index}`}
                  className="border border-slate-200 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div className="space-y-2 max-w-3xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                          問題 {index + 1}
                        </span>
                        <span
                          className="text-sm px-2 py-1 rounded-full text-white font-semibold"
                          style={{
                            backgroundColor: scoreColor(row.review_priority),
                          }}
                        >
                          {row.status_label || "要復習"}
                        </span>
                      </div>

                      <p className="text-sm md:text-base text-slate-900 font-medium leading-relaxed">
                        {row.question_text || `問題ID: ${row.question_id}`}
                      </p>

                      <p className="text-xs text-slate-500">
                        最終学習日: {formatDate(row.last_answered_at)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleSolveQuestion(row.question_id)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 transition"
                    >
                      この問題を復習
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ProgressBar value={row.accuracy} label="正答率" />
                    <ProgressBar
                      value={row.understanding_score}
                      label="理解度"
                    />
                    <ProgressBar value={row.retention_score} label="定着度" />
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="font-semibold text-slate-800 mb-1">
                        復習優先度
                      </p>
                      <p className="text-slate-700">
                        {Number(row.review_priority ?? 0).toFixed(0)}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="font-semibold text-slate-800 mb-1">
                        正解回数 / 回答回数
                      </p>
                      <p className="text-slate-700">
                        {row.total_correct} / {row.total_attempts}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="font-semibold text-slate-800 mb-1">
                        レベル
                      </p>
                      <p className="text-slate-700">{row.level || "未設定"}</p>
                    </div>
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
