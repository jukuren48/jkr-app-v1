// EnglishTrapQuestions.jsx - 完全修正版（読み込み表示・解説表示・「次へ」ボタン対応）
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function EnglishTrapQuestions() {
  const [questions, setQuestions] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [questionCount, setQuestionCount] = useState(null);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});

  useEffect(() => {
    fetch("/api/questions2")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data);
        const uniqueUnits = [...new Set(data.map((q) => q.unit))];
        setUnits(uniqueUnits);
      })
      .catch((error) => {
        console.error("Failed to fetch questions:", error);
      });
  }, []);

  const selectAllUnits = () => {
    setSelectedUnits([...units]);
  };

  const clearAllUnits = () => {
    setSelectedUnits([]);
  };

  const toggleUnit = (unit) => {
    setSelectedUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit]
    );
  };

  const startQuiz = () => {
    const filtered = questions.filter((q) => selectedUnits.includes(q.unit));
    if (filtered.length === 0) {
      alert("選択した単元に問題がありません。");
      return;
    }
    const shuffled = shuffleArray(filtered);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setAnswers({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
  };

  const handleAnswer = (choice) => {
    const currentQuestion = filteredQuestions[currentIndex];
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: choice }));

    if (!mistakes[currentQuestion.id] && choice !== currentQuestion.correct) {
      setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
      setFirstMistakeAnswers((prev) => ({
        ...prev,
        [currentQuestion.id]: choice,
      }));
    }

    setSelectedChoice(choice);
    setIsCorrect(choice === currentQuestion.correct);
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (isCorrect) {
      if (currentIndex + 1 < filteredQuestions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setShowQuestions(false);
        setShowResult(true);
      }
    }
    // 正解じゃない場合は同じ問題を再出す
    setSelectedChoice(null);
    setShowFeedback(false);
  };

  const handleRetrySame = () => {
    if (initialQuestions.length === 0) {
      // safety guard: fallback to full reset if no previous questions
      handleRetryNew();
      return;
    }

    setFilteredQuestions([...initialQuestions]); // make a fresh copy
    setCurrentIndex(0);
    setAnswers({});
    setMistakes({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setIsCorrect(false);
    setFirstMistakeAnswers({});
  };

  const handleRetryNew = () => {
    setShowQuestions(false);
    setShowResult(false);
    setSelectedUnits([]);
    setQuestionCount(null);
    setAnswers({});
    setShowFeedback(false);
    setSelectedChoice(null);
    setIsCorrect(false);
    setMistakes({});
    setFilteredQuestions([]);
    setInitialQuestions([]);
    setFirstMistakeAnswers({});
  };

  const correctAnswers = filteredQuestions.filter(
    (q) => answers[q.id] === q.correct
  );
  const incorrectAnswers = filteredQuestions.filter(
    (q) => answers[q.id] !== q.correct
  );
  const incorrectQuestionsList = filteredQuestions.filter(
    (q) => mistakes[q.id]
  );

  const totalQuestions = filteredQuestions.length;
  const incorrectCount = Object.keys(mistakes).length;
  const correctCount = totalQuestions - incorrectCount;
  const correctRate = Math.round((correctCount / totalQuestions) * 100);

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-pink-100 to-yellow-100 max-w-4xl mx-auto p-4">
      {/* クイズ開始前の設定画面 */}
      {!showQuestions && !showResult && units.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-2">単元を選んでください</h2>
          <div className="flex gap-4 mb-2">
            <button
              onClick={selectAllUnits}
              className="bg-green-200 px-3 py-1 rounded"
            >
              全選択
            </button>
            <button
              onClick={clearAllUnits}
              className="bg-red-200 px-3 py-1 rounded"
            >
              全解除
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {units.map((unit) => (
              <button
                key={unit}
                onClick={() => toggleUnit(unit)}
                className={`px-4 py-2 rounded border ${
                  selectedUnits.includes(unit) ? "bg-blue-300" : "bg-white"
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
          <h2 className="text-xl font-bold mb-2">出題数を選んでください</h2>
          <div className="flex gap-4 mb-4">
            {[5, 10, 15, "all"].map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={`px-4 py-2 rounded border ${
                  questionCount === count ? "bg-green-300" : "bg-white"
                }`}
              >
                {count === "all" ? "すべて" : `${count}問`}
              </button>
            ))}
          </div>
          <button
            onClick={startQuiz}
            disabled={selectedUnits.length === 0 || !questionCount}
            className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
          >
            開始
          </button>
        </div>
      )}

      {/* クイズ進行中 */}
      {showQuestions && !showResult && (
        <div>
          {showFeedback ? (
            <div
              className={`p-4 rounded-lg shadow-md mb-4 ${
                isCorrect
                  ? "bg-green-100 border-green-300"
                  : "bg-red-100 border-red-300"
              }`}
            >
              <motion.h2
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="text-xl font-bold mb-4"
              >
                解答結果
              </motion.h2>

              {isCorrect ? (
                <>
                  <p className="text-green-700 font-bold text-lg">
                    ✅ 正解です！
                  </p>
                  <p className="mb-2">
                    解説: {filteredQuestions[currentIndex].explanation}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-red-700 font-bold text-lg">
                    ❌ 不正解です。もう一度挑戦しよう！
                  </p>
                  {selectedChoice && (
                    <>
                      <p className="mb-2">あなたの答え: {selectedChoice}</p>
                      <p className="mb-2">
                        理由:{" "}
                        {filteredQuestions[currentIndex]
                          ?.incorrectExplanations?.[selectedChoice] ||
                          filteredQuestions[currentIndex]?.explanation}
                      </p>
                    </>
                  )}
                </>
              )}

              <button
                onClick={handleNext}
                className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
              >
                次へ
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-4">
                第{currentIndex + 1}問 / 全{filteredQuestions.length}問
              </h2>
              <div className="w-full bg-gray-300 rounded-full h-3 mb-4">
                <div
                  className="bg-green-400 h-3 rounded-full"
                  style={{
                    width: `${
                      ((currentIndex + 1) / filteredQuestions.length) * 100
                    }%`,
                  }}
                />
              </div>
              <div className="mb-4 text-lg font-semibold">
                {filteredQuestions[currentIndex]?.question}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shuffleArray(
                  filteredQuestions[currentIndex]?.choices || []
                ).map((choice, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(choice)}
                    className="bg-white border rounded px-4 py-2 hover:bg-gray-100"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 結果画面 */}
      {showResult && (
        <div>
          <h2 className="text-2xl font-bold mb-4">結果発表</h2>
          <p className="text-2xl font-bold mb-4">
            {correctRate >= 90
              ? "🎉 すばらしい！🥇"
              : correctRate >= 80
              ? "✨ よくできました！🥈"
              : correctRate >= 70
              ? "👍 もう少し！🥉"
              : "💪 何度も挑戦しよう！"}
          </p>
          <p className="text-lg mb-2">
            正解数: {correctCount} / {totalQuestions}（正答率: {correctRate}%）
          </p>
          <div className="mb-4">
            {incorrectQuestionsList.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-bold mb-2">
                  不正解だった問題と解説
                </h3>
                {incorrectQuestionsList.map((q) => (
                  <div key={q.id} className="mb-4 p-3 border rounded bg-red-50">
                    <p className="font-semibold">問題: {q.question}</p>
                    <p className="text-red-600">
                      あなたの答え: {firstMistakeAnswers[q.id]}
                    </p>
                    <p className="text-green-600">正解: {q.correct}</p>
                    <p className="mt-1 text-gray-700">
                      解説:{" "}
                      {q.incorrectExplanations?.[answers[q.id]] ||
                        q.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleRetrySame}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              同じ問題でもう一度
            </button>
            <button
              onClick={handleRetryNew}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              別の問題にチャレンジ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
