// EnglishTrapQuestions.jsx - Google TTS対応版
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

function Character({ mood }) {
  const expressions = {
    neutral: { emoji: "😊", message: "がんばれー！" },
    happy: { emoji: "😃", message: "よくできたね！" },
    sad: { emoji: "😢💦", message: "おしい！もう一度がんばろう" },
  };

  return (
    <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg shadow-md">
      <span className="text-6xl">{expressions[mood].emoji}</span>
      <p className="ml-4 text-xl font-bold">{expressions[mood].message}</p>
    </div>
  );
}

// TTS用ボタンコンポーネント
function TTSButton({ text }) {
  const [loading, setLoading] = useState(false);

  const speakText = async () => {
    if (!text) {
      alert("読み上げるテキストがありません。");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("TTS APIエラー");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      await audio.play();
    } catch (err) {
      console.error("音声再生エラー:", err);
      alert("音声の取得または再生に失敗しました。");
    }
    setLoading(false);
  };

  return (
    <button
      onClick={speakText}
      disabled={loading}
      className="ml-2 px-2 py-1 bg-blue-300 rounded hover:bg-blue-400 transition"
    >
      {loading ? "🔄 読み上げ中..." : "🔊 聞く"}
    </button>
  );
}

export default function EnglishTrapQuestions() {
  const [questions, setQuestions] = useState([]);
  const [questionList, setQuestionList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("questionList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedUnits");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [questionCount, setQuestionCount] = useState(null);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});
  const [characterMood, setCharacterMood] = useState("neutral");
  const [inputAnswer, setInputAnswer] = useState("");
  const [selectedWord, setSelectedWord] = useState(null);
  const [wordMeaning, setWordMeaning] = useState("");
  const [wordAudioSrc, setWordAudioSrc] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState("");
  const [hintLevels, setHintLevels] = useState({});
  const [addMessage, setAddMessage] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    localStorage.setItem("questionList", JSON.stringify(questionList));
  }, [questionList]);

  useEffect(() => {
    localStorage.setItem("selectedUnits", JSON.stringify(selectedUnits));
  }, [selectedUnits]);

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

  const currentQuestion = filteredQuestions?.[currentIndex] ?? null;

  useEffect(() => {
    if (!showFeedback) return;
    if (isCorrect) return;
    if (!currentQuestion) return;
    if (typeof currentQuestion.explanation !== "string") return;
    if (currentQuestion.explanation.trim() === "") return;

    speakExplanation(currentQuestion.explanation);
  }, [showFeedback, isCorrect, currentQuestion]);

  const speakExplanation = async (text, lang = "ja-JP") => {
    if (!text || text.trim() === "") return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) throw new Error("TTS API error");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      await audio.play();
    } catch (err) {
      console.error("音声再生エラー:", err);
    }
  };

  const handleWordClick = async (word) => {
    setSelectedWord(word);
    setWordMeaning("翻訳中...");

    // ① クリックした単語を英語音声で再生
    await speakExplanation(word, "en-US");

    // ② Google翻訳APIで日本語訳を取得
    try {
      const res = await fetch(
        `/api/translate?word=${encodeURIComponent(word)}`
      );
      if (!res.ok) throw new Error("Translation API error");
      const data = await res.json();
      setWordMeaning(data.translation);
    } catch (err) {
      console.error(err);
      setWordMeaning("意味を取得できませんでした");
    }
  };

  const selectAllUnits = () => setSelectedUnits([...units]);
  const clearAllUnits = () => setSelectedUnits([]);
  const toggleUnit = (unit) =>
    setSelectedUnits((prev) =>
      prev.includes(unit) ? prev.filter((u) => u !== unit) : [...prev, unit]
    );

  const startQuiz = () => {
    const filtered = questions.filter((q) => selectedUnits.includes(q.unit));
    if (filtered.length === 0) {
      alert("選択した単元に問題がありません。");
      return;
    }
    const shuffled = shuffleArray(filtered);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);
    setCharacterMood("neutral");
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

  const handleAnswer = (answer) => {
    const currentQuestion = filteredQuestions[currentIndex];
    let isCorrectAnswer = false;

    if (currentQuestion.type === "multiple-choice") {
      isCorrectAnswer = answer === currentQuestion.correct;
    } else if (currentQuestion.type === "input") {
      let corrects = [];

      if (Array.isArray(currentQuestion.correct)) {
        // correct が配列ならそのまま使う
        corrects = currentQuestion.correct;
      } else if (Array.isArray(currentQuestion.correctAnswers)) {
        // correctAnswers が配列ならそれを使う
        corrects = currentQuestion.correctAnswers;
      } else {
        // どれも配列でなければ単一の文字列として扱う
        corrects = [
          currentQuestion.correctAnswer || currentQuestion.correct || "",
        ];
      }

      // nullや空文字を除去して安全に比較
      corrects = corrects.filter(
        (c) => typeof c === "string" && c.trim() !== ""
      );

      isCorrectAnswer = corrects.some(
        (c) => c.trim().toLowerCase() === answer.trim().toLowerCase()
      );
    }

    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));

    if (isCorrectAnswer) {
      setCharacterMood("happy");
    } else {
      setCharacterMood("sad");
      if (!mistakes[currentQuestion.id]) {
        setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
        setFirstMistakeAnswers((prev) => ({
          ...prev,
          [currentQuestion.id]: answer,
        }));
      }
    }

    setSelectedChoice(answer);
    setIsCorrect(isCorrectAnswer);
    setShowFeedback(true);
    setInputAnswer("");
    setHintLevel(0);
    setHintText("");
  };

  const handleNext = () => {
    setCharacterMood("neutral");
    if (isCorrect) {
      if (currentIndex + 1 < filteredQuestions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setShowQuestions(false);
        setShowResult(true);
      }
    }
    setSelectedChoice(null);
    setShowFeedback(false);
    setTimeout(() => setInputDisabled(false), 300);
  };

  const hintPenalties = [2, 5, 10];

  const generateHint = () => {
    if (!currentQuestion?.correctAnswer) return "";

    const words = currentQuestion.correctAnswer.trim().split(/\s+/);
    const hintPercents = [20, 50, 100];
    const percent = hintPercents[Math.min(hintLevel, 2)];
    const numWords = Math.ceil((percent / 100) * words.length);
    return words.slice(0, numWords).join(" ");
  };

  const handleShowHint = () => {
    if (hintLevel < 3) {
      const nextLevel = hintLevel + 1;
      setHintLevel(nextLevel);
      setHintText(generateHint());

      // 現在の問題IDをキーにしてhintLevelを記録
      setHintLevels((prev) => ({
        ...prev,
        [currentQuestion.id]: nextLevel,
      }));
    }
  };

  const handleAddToQuestionList = () => {
    if (!currentQuestion) return;

    // 重複チェック
    const isAlreadySaved = questionList.some(
      (item) => item.id === currentQuestion.id
    );
    if (isAlreadySaved) {
      setAddMessage("この質問はすでに質問ボックスに入っています。");
      return;
    }

    const questionItem = {
      id: currentQuestion.id,
      question: currentQuestion.question || currentQuestion.prompt,
      answer: selectedChoice || inputAnswer,
      correct: currentQuestion.correct || currentQuestion.correctAnswer,
      explanation: currentQuestion.explanation,
    };

    setQuestionList((prev) => [...prev, questionItem]);
    setAddMessage("質問ボックスに保存しました！");

    // 数秒後にメッセージを消す
    setTimeout(() => setAddMessage(""), 3000);
  };

  const handleDeleteQuestion = (index) => {
    const newList = [...questionList];
    newList.splice(index, 1);
    setQuestionList(newList);
  };

  // ========== UI ==========
  const totalQuestions = filteredQuestions.length;
  const incorrectCount = Object.keys(mistakes).length;
  const correctCount = totalQuestions - incorrectCount;
  const correctRate = Math.round((correctCount / totalQuestions) * 100);
  const incorrectQuestionsList = filteredQuestions.filter(
    (q) => mistakes[q.id]
  );
  const totalHintPenalty = Object.values(hintLevels)
    .map((level) =>
      level === 0 ? 0 : hintPenalties.slice(0, level).reduce((a, b) => a + b, 0)
    )
    .reduce((a, b) => a + b, 0);

  const adjustedCorrectRate = Math.max(0, correctRate - totalHintPenalty);

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-pink-100 to-yellow-100 max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">
          英語ひっかけ問題 ～塾長からの挑戦状～
        </h1>
        <button
          onClick={() => setShowQuestionModal(true)}
          className="bg-yellow-300 hover:bg-yellow-400 text-[#4A6572] px-4 py-2 rounded-full shadow transition"
        >
          📥 質問ボックス（{questionList.length}件）
        </button>
      </div>

      {/* スタート画面 */}
      {!showQuestions && !showResult && units.length > 0 && (
        <div className="max-w-2xl mx-auto bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-6 shadow">
          <h2 className="text-2xl font-bold text-[#4A6572] mb-4 text-center">
            単元を選んでください（★は記述問題です）
          </h2>
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={selectAllUnits}
              className="bg-[#A7D5C0] text-[#4A6572] px-4 py-2 rounded-full shadow-sm hover:bg-[#92C8B2] transition"
            >
              全選択
            </button>
            <button
              onClick={clearAllUnits}
              className="bg-[#F8B195] text-white px-4 py-2 rounded-full shadow-sm hover:bg-[#F49A87] transition"
            >
              全解除
            </button>
          </div>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {units.map((unit) => (
              <button
                key={unit}
                onClick={() => toggleUnit(unit)}
                className={`px-4 py-2 rounded-full border shadow-sm transition ${
                  selectedUnits.includes(unit)
                    ? "bg-[#A7D5C0] text-[#4A6572] font-semibold"
                    : "bg-white text-[#4A6572]"
                }`}
              >
                {unit}
              </button>
            ))}
          </div>
          <h2 className="text-xl font-bold text-[#4A6572] mb-2 text-center">
            出題数を選んでください
          </h2>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {[5, 10, 15, "all"].map((count) => (
              <button
                key={count}
                onClick={() => setQuestionCount(count)}
                className={`px-4 py-2 rounded-full border shadow-sm transition ${
                  questionCount === count
                    ? "bg-[#A7D5C0] text-[#4A6572] font-semibold"
                    : "bg-white text-[#4A6572]"
                }`}
              >
                {count === "all" ? "すべて" : `${count}問`}
              </button>
            ))}
          </div>
          <button
            onClick={startQuiz}
            disabled={selectedUnits.length === 0 || !questionCount}
            className="bg-[#4A6572] text-white rounded-full px-6 py-3 shadow hover:bg-[#3F555F] transition mx-auto block"
          >
            開始
          </button>
        </div>
      )}

      {/* クイズ進行中 */}
      {showQuestions && !showResult && currentQuestion && (
        <div>
          <Character mood={characterMood} />

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
                <div className="bg-[#6DBD98] text-white p-4 rounded-lg shadow text-center">
                  ✅ 正解です！ よくできました！
                </div>
              ) : (
                <div className="bg-[#F8B195] text-white p-4 rounded-lg shadow text-center">
                  ❌ 不正解です。
                  {!showAnswer ? (
                    <div className="mt-4">
                      <button
                        onClick={() => setShowAnswer(true)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow"
                      >
                        答えを見てみる
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <p className="font-bold mb-2">✅ 正解は：</p>
                      <p className="bg-green-100 text-gray-800 p-2 rounded">
                        {Array.isArray(currentQuestion.correct)
                          ? currentQuestion.correct.join(" / ")
                          : currentQuestion.correct}
                      </p>
                      <button
                        onClick={() => {
                          setShowAnswer(false);
                          // 回答リセットして同じ問題を再挑戦
                          setAnswers((prev) => ({
                            ...prev,
                            [currentQuestion.id]: undefined,
                          }));
                          setShowFeedback(false); // 解答結果表示を閉じる
                        }}
                        className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded shadow"
                      >
                        もう一度解いてみる
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-gray-800 mt-2">
                あなたの答え: {selectedChoice}
              </p>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="bg-[#F9F9F9] border-l-8 border-[#A7D5C0] rounded-xl p-6 mt-4 shadow"
              >
                <div className="flex items-center mb-2">
                  <span className="text-2xl mr-2">📘</span>
                  <h3 className="text-[#4A6572] font-bold text-lg">
                    解説をしっかり読もう！
                  </h3>
                </div>
                <p className="text-gray-800 leading-relaxed">
                  {currentQuestion.explanation}
                </p>
              </motion.div>

              <button
                onClick={handleAddToQuestionList}
                className="bg-yellow-400 hover:bg-yellow-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
              >
                後で先生に質問する
              </button>

              {addMessage && (
                <p className="mt-2 text-green-700 font-semibold">
                  {addMessage}
                </p>
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

              <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-6 shadow mb-6 max-w-2xl mx-auto text-left">
                <h2 className="text-xl font-bold mb-2 text-left word-break-clean whitespace-pre-wrap max-w-prose mx-auto">
                  {currentQuestion.type === "multiple-choice" && (
                    <span>
                      {currentQuestion.question.split(" ").map((word, idx) => (
                        <span
                          key={idx}
                          onClick={() => handleWordClick(word)}
                          className="hover:bg-[#A7D5C0] cursor-pointer px-1 rounded transition"
                        >
                          {word}
                        </span>
                      ))}
                    </span>
                  )}
                  {currentQuestion.type === "input" && currentQuestion.question}
                </h2>
              </div>

              {currentQuestion.type === "multiple-choice" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {shuffleArray(currentQuestion.choices || []).map(
                    (choice, index) => (
                      <button
                        key={index}
                        onClick={() => handleAnswer(choice)}
                        className="bg-white border border-[#E0E0E0] rounded-lg px-4 py-3 hover:bg-[#A7D5C0] text-[#4A6572] transition shadow-sm"
                      >
                        {choice}
                      </button>
                    )
                  )}
                </div>
              )}

              {currentQuestion.type === "input" && (
                <div className="flex flex-col gap-4 mt-4">
                  <input
                    type="text"
                    value={inputAnswer}
                    onChange={(e) => setInputAnswer(e.target.value)}
                    placeholder="ここに英語で入力"
                    className="border border-[#E0E0E0] rounded-lg px-4 py-3 shadow focus:outline-none focus:ring-2 focus:ring-[#A7D5C0] transition"
                  />
                  <button
                    onClick={() => handleAnswer(inputAnswer)}
                    className="bg-[#4A6572] text-white rounded-full px-6 py-3 hover:bg-[#3F555F] transition shadow"
                  >
                    答える
                  </button>

                  {hintText && (
                    <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg p-4 mt-2 shadow">
                      <h3 className="text-[#4A6572] font-bold mb-2">ヒント</h3>
                      <p className="text-gray-800">{hintText}</p>
                    </div>
                  )}

                  <button
                    onClick={handleShowHint}
                    disabled={hintLevel >= 3}
                    className="bg-[#A7D5C0] text-[#4A6572] rounded-full px-4 py-2 shadow hover:bg-[#92C8B2] transition"
                  >
                    {hintLevel < 3
                      ? "ヒントを見る"
                      : "これ以上ヒントはありません"}
                  </button>
                </div>
              )}

              {selectedWord && (
                <div className="mt-4 p-4 bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg shadow">
                  <h3 className="text-lg font-bold text-[#4A6572] mb-2">
                    選択した単語
                  </h3>
                  <p className="text-xl text-[#4A6572]">{selectedWord}</p>
                  <p className="text-gray-800">{wordMeaning}</p>
                </div>
              )}
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
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-2xl p-8 mb-6 text-center shadow-lg"
          >
            <h2 className="text-3xl font-bold text-[#4A6572] mb-4">結果発表</h2>
            <p className="text-6xl font-extrabold text-[#6DBD98] mb-2">
              {correctRate}%
            </p>
            <p className="text-[#4A6572]">
              ヒント利用による減点: -{totalHintPenalty}%
            </p>
            <p className="text-xl font-bold text-[#4A6572]">
              最終正答率: {adjustedCorrectRate}%
            </p>
          </motion.div>

          {incorrectQuestionsList.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-bold mb-2">不正解だった問題と解説</h3>
              {incorrectQuestionsList.map((q) => (
                <div key={q.id} className="mb-4 p-3 border rounded bg-red-50">
                  <p className="font-semibold">
                    問題: {q.question || q.prompt}
                  </p>
                  <p className="text-red-600">
                    あなたの答え: {firstMistakeAnswers[q.id]}
                  </p>
                  <p className="text-green-600">
                    正解: {q.correct || q.correctAnswer}
                  </p>
                  <p className="mt-1 text-gray-700 flex items-center">
                    解説: {q.explanation}
                    {q.explanation && <TTSButton text={q.explanation} />}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setShowQuestions(true)}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              同じ問題でもう一度
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-pink-400 hover:bg-pink-500 text-white px-6 py-3 rounded-full shadow-md transition"
            >
              別の問題にチャレンジ
            </button>
          </div>
          {questionList.length > 0 && (
            <div className="mt-6 p-4 bg-gray-100 rounded shadow">
              <h3 className="font-bold mb-2">質問ボックス（仮表示）</h3>
              <ul className="list-disc pl-5">
                {questionList.map((item, index) => (
                  <li key={index}>
                    {item.question}（あなたの答え: {item.answer}）
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setQuestionList([]);
                  localStorage.removeItem("questionList");
                }}
                className="bg-red-400 text-white px-4 py-2 rounded shadow hover:bg-red-500"
              >
                質問ボックスを全てクリア
              </button>
            </div>
          )}
        </div>
      )}

      {showQuestionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-lg relative">
            <h2 className="text-xl font-bold mb-4 text-center">質問ボックス</h2>

            {questionList.length === 0 ? (
              <p className="text-gray-600 text-center">
                質問はまだありません。
              </p>
            ) : (
              <ul className="space-y-4 max-h-96 overflow-y-auto">
                {questionList.map((item, index) => (
                  <li key={index} className="p-3 border rounded bg-gray-50">
                    <p className="font-semibold">{item.question}</p>
                    <p className="text-sm text-gray-600">
                      あなたの答え: {item.answer}
                    </p>
                    <p className="text-sm text-green-700">
                      正解: {item.correct}
                    </p>
                    <p className="text-sm text-gray-800 mt-1">
                      {item.explanation}
                    </p>
                    <button
                      onClick={() => handleDeleteQuestion(index)}
                      className="mt-2 bg-red-400 text-white px-3 py-1 rounded shadow hover:bg-red-500"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setShowQuestionModal(false)}
                className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded shadow"
              >
                閉じる
              </button>
              {questionList.length > 0 && (
                <button
                  onClick={() => {
                    setQuestionList([]);
                    localStorage.removeItem("questionList");
                    setShowQuestionModal(false);
                  }}
                  className="bg-red-400 text-white px-4 py-2 rounded shadow hover:bg-red-500"
                >
                  全てクリア
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
