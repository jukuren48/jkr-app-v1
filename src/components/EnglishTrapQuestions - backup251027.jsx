// EnglishTrapQuestions.jsx - 手書き入力＋OCR採点＋記憶機能統合版
import { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import SignatureCanvas from "react-signature-canvas";
import Tesseract from "tesseract.js";
//import HandwritingPad from "./HandwritingPad";

// ===== Audio Utility (iPhone対応版) =====
let audioCtx;
let bgmGain, qbgmGain, sfxGain;
let bgmSource = null,
  qbgmSource = null;
// ===== Audio Utility 共通変数 =====
let isBgmPlaying = false; // ✅ BGM多重再生防止フラグ
// ===== BGM多重再生防止のグローバルフラグ =====
let globalUnitBgmPlaying = false;

function unlockAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      console.log("[Audio] resumed on user gesture");
    });
  }
}

async function ensureAudioResume() {
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
    console.log("[Audio] resumed before BGM play");
  }
}

// 最初のクリック/タップで必ず呼ぶ
document.addEventListener("touchstart", unlockAudio, { once: true });
document.addEventListener("click", unlockAudio, { once: true });

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmGain = audioCtx.createGain();
    qbgmGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();

    bgmGain.connect(audioCtx.destination);
    qbgmGain.connect(audioCtx.destination);
    sfxGain.connect(audioCtx.destination);

    bgmGain.gain.value = 0.0; // 最初は無音
    qbgmGain.gain.value = 0.0; // 最初は無音
    sfxGain.gain.value = 1.0; // 効果音は常時オン
  }
}

async function ensureLoop(src, gainNode, storeRefName, forceReload = false) {
  initAudio();

  // ✅ BGM の多重再生防止
  if (storeRefName === "bgm" && bgmSource && !forceReload) {
    console.log("[ensureLoop] bgm already playing → skip");
    return;
  }

  // ✅ すでに再生中ならスキップ（forceReload 以外）
  if (!forceReload) {
    if (storeRefName === "qbgm" && qbgmSource) {
      console.log("[ensureLoop] qbgm already playing → skip");
      return;
    }
  } else {
    // 強制リロード時は stop して再生し直す
    try {
      if (storeRefName === "bgm" && bgmSource) {
        bgmSource.stop(0);
        bgmSource = null;
        console.log("[ensureLoop] force stop bgm");
      }
      if (storeRefName === "qbgm" && qbgmSource) {
        qbgmSource.stop(0);
        qbgmSource = null;
        console.log("[ensureLoop] force stop qbgm");
      }
    } catch (e) {
      console.warn("[ensureLoop] force stop error:", e);
    }
  }

  // ✅ iOS安全：resumeが完了していることを保証
  if (audioCtx && audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
      console.log("[ensureLoop] AudioContext resumed before start");
    } catch (e) {
      console.warn("[ensureLoop] resume failed:", e);
    }
  }

  // ✅ AudioBufferを取得
  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(buf);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(gainNode);

  // ✅ iOSの再生遅延対策：resume後 200ms 待ってから start
  await new Promise((resolve) => setTimeout(resolve, 200));
  try {
    source.start(0);
    console.log(`[ensureLoop] started ${src} (${storeRefName})`);
  } catch (e) {
    console.warn("[ensureLoop] start failed:", e);
  }

  if (storeRefName === "bgm") bgmSource = source;
  if (storeRefName === "qbgm") qbgmSource = source;
}

function stopQbgm(force = false) {
  if (qbgmSource) {
    try {
      qbgmSource.stop(0);
      console.log("[Audio] qbgm stopped");
    } catch (e) {
      console.warn("[stopQbgm] failed:", e);
    }
    qbgmSource = null;
  } else if (force) {
    console.log("[Audio] qbgm already null, force reset");
    qbgmSource = null;
  }
}

function prepareNextAudioResume() {
  const resumeOnGesture = async () => {
    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
      console.log("[Audio] resumed on next gesture (iOS safe)");
    }
  };

  document.addEventListener("touchstart", resumeOnGesture, { once: true });
  document.addEventListener("click", resumeOnGesture, { once: true });
}

function fadeInBGM(gainNode, targetVolume = 1.0, duration = 2.0) {
  if (!audioCtx || !gainNode) return;

  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now); // いったん0から
  gainNode.gain.linearRampToValueAtTime(targetVolume, now + duration);
}

// アプリ起動後、最初のユーザー操作で呼ぶ
async function startAllBGMs() {
  initAudio(); // ✅ 先に必ず呼ぶ
  await ensureLoop("/sounds/bgm.mp3", bgmGain, "bgm");
  await ensureLoop("/sounds/qbgm.mp3", qbgmGain, "qbgm");
}

async function playSFX(src) {
  initAudio();

  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(buf);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(sfxGain);
  source.start(0);
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function Character({ mood, userName }) {
  const expressions = {
    neutral: { emoji: "😊", message: "がんばれー！" },
    happy: { emoji: "😃", message: "よくできたね！" },
    sad: { emoji: "😢💦", message: "おしい！もう一度がんばろう" },
    panic: { emoji: "😱", message: "時間切れ〜！！" },
  };

  // 名前を前につける
  const displayMessage = userName
    ? `${userName}さん、${expressions[mood].message}`
    : expressions[mood].message;

  return (
    <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg shadow-md">
      <span className="text-6xl">{expressions[mood].emoji}</span>
      <p className="ml-4 text-xl font-bold">{displayMessage}</p>
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

// ✅ 正解/不正解で出す解説テキストを統一的に取得
function getFeedbackText({ currentQuestion, isCorrect, selectedChoice }) {
  if (!currentQuestion) return "";

  if (isCorrect) {
    // 正解時：通常のexplanation
    return currentQuestion.explanation || "";
  }

  // 不正解時：選んだ選択肢に対応する誤答解説を優先
  const wrongMap = currentQuestion.incorrectExplanations || {};
  const wrong =
    wrongMap?.[selectedChoice] ?? wrongMap?.[String(selectedChoice)] ?? "";

  if (wrong && String(wrong).trim() !== "") return wrong;

  // フォールバック（誤答解説が用意されていない場合）
  const correctText =
    currentQuestion.correct ?? currentQuestion.correctAnswer ?? "";
  const base = currentQuestion.explanation || "";
  return `正解は「${correctText}」。${base}`.trim();
}

// ======== 手書き入力パッドコンポーネント ========
function HandwritingPad({
  ocrEngine,
  onCharRecognized,
  onSpace,
  onClearAll,
  onSubmitAnswer,
  currentAnswer,
  currentQuestion,
  handleAnswer,
}) {
  const sigCanvas = useRef(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizedChar, setRecognizedChar] = useState("");
  const [strokes, setStrokes] = useState([]);

  // 🧭 書くたびに履歴を更新
  const handleEndStroke = () => {
    if (sigCanvas.current) setStrokes(sigCanvas.current.toData());
  };

  // 🔙 一つ戻す
  const handleUndoLastStroke = () => {
    if (!sigCanvas.current || strokes.length === 0) return;
    const newData = strokes.slice(0, -1);
    sigCanvas.current.fromData(newData);
    setStrokes(newData);
  };

  const clearCanvas = () => {
    if (sigCanvas.current?.clear) sigCanvas.current.clear();
    setRecognizedChar("");
  };

  const recognizeChar = async () => {
    if (!sigCanvas.current) return;
    setRecognizing(true);
    const dataURL = sigCanvas.current.getCanvas().toDataURL("image/png");
    try {
      let text = "";
      if (ocrEngine === "vision") {
        const res = await fetch("/api/vision-ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataURL }),
        });
        const json = await res.json();
        text = json?.text || "";
      } else {
        const {
          data: { text: localText },
        } = await Tesseract.recognize(dataURL, "eng+jpn", {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
        });
        text = localText;
      }
      const cleaned = text.trim().replace(/[\u0000-\u001F]/g, "");
      setRecognizedChar(cleaned);
    } catch (err) {
      alert("文字認識に失敗しました。");
    }
    setRecognizing(false);
  };

  // ✅ currentAnswer が変わるたびに自動で採点（完全一致のみ）
  useEffect(() => {
    if (!currentQuestion || !currentAnswer || !handleAnswer) return;

    // 正答群を展開
    const rawCorrect = Array.isArray(currentQuestion.correct)
      ? currentQuestion.correct
      : Array.isArray(currentQuestion.correctAnswers)
      ? currentQuestion.correctAnswers
      : currentQuestion.correctAnswer ?? currentQuestion.correct ?? "";

    //const correctArray = Array.isArray(rawCorrect)
    //  ? rawCorrect
    //  : String(rawCorrect)
    //      .split(/\s*(\/|｜|\||,|，)\s*/)
    //      .filter(Boolean);
    const correctArray = expandCorrects(rawCorrect);

    // ✅ 大文字小文字・句読点・空白を標準化
    const normalize = (s) =>
      s
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[．。]/g, ".")
        .replace(/[,，]/g, ",")
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s*\.\s*/g, ".")
        .toLowerCase();

    const user = normalize(currentAnswer);

    // ✅ 完全一致だけを正解にする（途中文は無視）
    const isPerfectMatch = correctArray.some((ans) => normalize(ans) === user);

    // ✅ 完全一致時のみ自動採点
    if (isPerfectMatch) {
      console.log("✅ 完全一致 → 自動正解:", user);
      handleAnswer(currentAnswer);
    } else {
      // 途中文ではスルー（正解にも不正解にもならない）
      console.log("⏳ 途中入力または不一致:", user);
    }
  }, [currentAnswer, currentQuestion]);

  return (
    <div className="fixed bottom-0 left-0 w-full h-[35vh] bg-white border-t shadow-lg flex flex-col justify-between z-50">
      {/* === 🧩 現在の解答 === */}
      <div className="text-center py-1 border-b bg-white font-mono text-base">
        🧩 現在の解答：
        <span className="font-bold text-[#4A6572]">
          {currentAnswer || "(まだ入力なし)"}
        </span>
      </div>

      {/* === 認識結果 === */}
      <div className="text-center mt-1 text-base font-mono">
        {recognizing ? (
          <span className="text-gray-500 animate-pulse">🔍 認識中...</span>
        ) : recognizedChar ? (
          <span className="text-blue-600 font-bold text-lg">
            認識結果：{recognizedChar}
          </span>
        ) : (
          <span className="text-gray-400">(まだ書かれていません)</span>
        )}
      </div>

      {/* === キャンバス === */}
      <div className="flex-1 flex justify-center items-center pb-16 sm:pb-4">
        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          minWidth={2}
          maxWidth={3}
          backgroundColor="#ffffff"
          canvasProps={{
            width: 360,
            height: 160,
            className:
              "border-2 border-gray-300 rounded-xl mx-auto block bg-gradient-to-b from-white to-gray-50 shadow-md max-w-[90vw]",
          }}
          onEnd={handleEndStroke}
        />
      </div>

      {/* === ボタン群 === */}
      <div
        className="fixed bottom-0 left-0 right-0 flex justify-around items-center 
             py-3 bg-gray-50 border-t shadow-lg text-sm 
             pb-[calc(env(safe-area-inset-bottom,0px)+32px)] 
             sm:pb-[calc(env(safe-area-inset-bottom,0px)+16px)] 
             z-50"
      >
        <button
          onClick={clearCanvas}
          className="px-2 py-1 bg-gray-300 rounded hover:bg-gray-400"
        >
          🧽 クリア
        </button>

        <button
          onClick={handleUndoLastStroke}
          className="px-2 py-1 bg-orange-400 text-white rounded hover:bg-orange-500"
        >
          ⌫ 一つ戻す
        </button>

        <button
          onClick={recognizeChar}
          disabled={recognizing}
          className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {recognizing ? "認識中…" : "認識"}
        </button>

        <button
          onClick={() => {
            if (!recognizedChar || recognizing) return;
            if (onCharRecognized) {
              onCharRecognized(recognizedChar);
              clearCanvas();
            }
          }}
          disabled={!recognizedChar || recognizing}
          className={`px-2 py-1 rounded shadow transition-all duration-200 ${
            recognizing
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : recognizedChar
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          {recognizedChar ? "⬆ アップ" : "⏳ 認識待ち"}
        </button>

        <button
          onClick={onSpace}
          className="px-2 py-1 bg-yellow-400 text-white rounded hover:bg-yellow-500"
        >
          ␣ スペース
        </button>

        <button
          onClick={onClearAll}
          className="px-2 py-1 bg-red-400 text-white rounded hover:bg-red-500"
        >
          🧹 全消去
        </button>

        <button
          onClick={onSubmitAnswer}
          className="px-3 py-1 bg-[#4A6572] text-white rounded hover:bg-[#3F555F]"
        >
          ✅ 採点
        </button>
      </div>
    </div>
  );
}

// 入力文字列の正規化（大文字小文字・全角半角・末尾句読点を吸収）
const normText = (s = "") =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    // 🚫 以下の2行を削除 → ピリオドやカンマを削らない
    // .replace(/[。．，、・！？；：]+$/u, "")
    // .replace(/[.,!?;:]+$/u, "")
    .replace(/\s+/g, " "); // 連続空白のみ整える

// 正答が「in front of / in the front of」のように複数書かれている場合に分割
const expandCorrects = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  return String(raw)
    .split(/\s*(\/|｜|\|)\s*/)
    .filter(Boolean);
};

const normEn = (s = "") =>
  s
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:]+$/g, "") // 末尾の句読点を削除
    .replace(/\s+/g, " ");

const normJa = (s = "") =>
  s
    .trim()
    .replace(/[。！？、・（）()\[\]「」『』【】]+$/g, "") // 末尾の記号を削除
    .replace(/\s+/g, "");

export default function EnglishTrapQuestions() {
  const [initialQuestionCount, setInitialQuestionCount] = useState(0);

  const [questions, setQuestions] = useState([]);
  const [questionList, setQuestionList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("questionList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [units, setUnits] = useState([]);
  // 0: 未選択, 1: 両方, 2: 選択のみ, 3: 記述のみ
  const [unitModes, setUnitModes] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unitModes");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  // 効果音 ON/OFF（← これを state 群の先頭付近に）
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("soundEnabled") === "true";
    }
    return false; // 初期状態は OFF
  });

  // 🧑 生徒ごとのデータ切り替え用
  const [userName, setUserName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("userName") || "";
    }
    return "";
  });

  // ✍️ 手書き入力モード（記憶機能付き）
  const [useHandwriting, setUseHandwriting] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("useHandwriting");
      return saved ? JSON.parse(saved) : true; // 初期値は手書きON
    }
    return true;
  });

  const [ocrEngine, setOcrEngine] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ocrEngine") || "tesseract";
    }
    return "tesseract";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ocrEngine", ocrEngine);
    }
  }, [ocrEngine]);

  const [unitBgmPlaying, setUnitBgmPlaying] = useState(false);
  const [questionCount, setQuestionCount] = useState(null);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});
  const [characterMood, setCharacterMood] = useState("neutral");
  const [inputAnswer, setInputAnswer] = useState("");
  const [lastLength, setLastLength] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [inputHistory, setInputHistory] = useState([]);
  const [selectedWord, setSelectedWord] = useState(null);
  const [wordMeaning, setWordMeaning] = useState("");
  const [reviewList, setReviewList] = useState([]); // 「覚え直す」対象を保存
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewAnsweredIds, setReviewAnsweredIds] = useState(new Set());
  const [showReviewPrompt, setShowReviewPrompt] = useState(false); // 復習開始モーダル表示フラグ
  const reviewQueueRef = useRef([]); // 復習出題キューを保持（alert排除で安全に受け渡し）
  // ✅ 覚え直し（復習）中フラグ
  const [reviewing, setReviewing] = useState(false);
  const [reviewMistakes, setReviewMistakes] = useState([]);
  const [showAnswerTemporarily, setShowAnswerTemporarily] = useState(false);
  const [temporaryAnswer, setTemporaryAnswer] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState("");
  const [hintLevels, setHintLevels] = useState({});
  const [addMessage, setAddMessage] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  // 選択肢を一度だけシャッフルして保持
  const [shuffledChoices, setShuffledChoices] = useState([]);

  // 🔽 追加: タイマー state
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [maxTime, setMaxTime] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [countPlayedForQuestion, setCountPlayedForQuestion] = useState({});

  // 単語帳（英単語と意味を保存）
  const [wordList, setWordList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wordList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [showWordList, setShowWordList] = useState(false);
  const [showWordTest, setShowWordTest] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testWord, setTestWord] = useState(null);
  const [answer, setAnswer] = useState("");
  const [wrongWords, setWrongWords] = useState([]);
  const [round, setRound] = useState(1); // 1 = 英→日, 2 = 日→英
  const [lastLengthTest, setLastLengthTest] = useState(0);
  const [showWarningTest, setShowWarningTest] = useState(false);

  // 単元ごとの間違い回数を記録
  const [unitStats, setUnitStats] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unitStats");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // 連続正解カウンター
  const [streak, setStreak] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("streak") || 0);
    }
    return 0;
  });

  const handleSetUserName = (name) => {
    setUserName(name);
    setStreak(0); // 💡 連続正解はリセット
    localStorage.setItem("streak", "0");

    // 新しいユーザーの unitStats を読み込む
    const savedStats = localStorage.getItem(`unitStats_${name}`);
    setUnitStats(savedStats ? JSON.parse(savedStats) : {});
  };

  // デバッグログ用（不要になったら削除してOK）
  const [debugLogs, setDebugLogs] = useState([]);

  function log(message) {
    console.log(message); // PC用にも出す
    setDebugLogs((prev) => [...prev.slice(-20), message]);
    // ← 最大20件だけ保持して古いのは削除
  }

  function muteBGM() {
    initAudio();
    if (bgmGain) {
      bgmGain.gain.value = 0;
      log("[BGM] muted " + audioCtx?.state);
    } else {
      log("[BGM] mute skipped - no bgmGain");
    }
  }

  async function unmuteBGM() {
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
        log("[BGM] resumed in unmuteBGM → state=" + audioCtx.state);
      } catch (e) {
        log("[BGM] resume failed in unmuteBGM");
      }
    }
    if (bgmGain) {
      bgmGain.gain.value = 0.4;
      log("[BGM] unmuted " + audioCtx?.state);
    } else {
      log("[BGM] unmute skipped - no bgmGain");
    }
  }

  // 音量（0〜100）
  const [masterVol, setMasterVol] = useState(() => {
    if (typeof window === "undefined") return 100;
    return Number(localStorage.getItem("vol_master") ?? 100);
  });
  const [sfxVol, setSfxVol] = useState(() => {
    if (typeof window === "undefined") return 100;
    return Number(localStorage.getItem("vol_sfx") ?? 100);
  });
  const [bgmVol, setBgmVol] = useState(() => {
    if (typeof window === "undefined") return 50;
    return Number(localStorage.getItem("vol_bgm") ?? 50);
  });

  const firstRunRef = useRef(true);

  // 効果音付きボタンハンドラ
  const playButtonSound = (callback) => {
    if (soundEnabled) {
      playSFX("/sounds/botan.mp3");
    }
    if (callback) callback();
  };

  // 参照（GainやBuffer保持）
  const soundsRef = useRef({}); // { count, timeup, correct, wrong, bgm } を保持
  const masterGainRef = useRef(null);
  const sfxGainRef = useRef(null);
  const bgmGainRef = useRef(null);
  const bgmSourceRef = useRef(null);

  const toggleUnitMode = (unit) => {
    setUnitModes((prev) => {
      const current = prev[unit] || 0;
      const next = (current + 1) % 4; // 0→1→2→3→0…
      return { ...prev, [unit]: next };
    });
  };

  const currentQuestion = filteredQuestions?.[currentIndex] ?? null;

  const startedRef = useRef(false);

  // 🧭 問題画面が表示された瞬間にトップへスクロール
  useEffect(() => {
    if (showQuestions && !showResult) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [showQuestions, showResult]);

  useEffect(() => {
    localStorage.setItem("useHandwriting", JSON.stringify(useHandwriting));
  }, [useHandwriting]);

  useEffect(() => {
    if (soundEnabled && !startedRef.current) {
      startAllBGMs();
      startedRef.current = true;
    }
  }, [soundEnabled]);

  // unitModes が更新されたら localStorage に保存
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("unitModes", JSON.stringify(unitModes));
    }
  }, [unitModes]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("soundEnabled");
      if (saved !== null) {
        setSoundEnabled(saved === "true");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("soundEnabled", String(soundEnabled));
    }
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("questionList", JSON.stringify(questionList));
  }, [questionList]);

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

  const renderInputSection = () => (
    <div className="flex flex-col gap-2 mt-2 items-center">
      <p className="text-gray-700 text-lg font-mono mb-2">
        🧾 現在の解答欄：
        <span className="font-bold text-[#4A6572]">{inputAnswer}</span>
      </p>

      {useHandwriting ? (
        <HandwritingPad
          ocrEngine={ocrEngine}
          // ✅ ここでは「文字追加だけ」行い、自動採点はしない！
          onCharRecognized={(char) => setInputAnswer((prev) => prev + char)}
          onSubmitAnswer={() => handleAnswer(inputAnswer)} // ← 保険で残す
          onClearAll={() => setInputAnswer("")}
          onSpace={() => setInputAnswer((prev) => prev + " ")}
          currentAnswer={inputAnswer}
          currentQuestion={filteredQuestions[currentIndex]}
          handleAnswer={handleAnswer}
        />
      ) : (
        <>
          <input
            type="text"
            value={inputAnswer}
            onChange={(e) => setInputAnswer(e.target.value)}
            placeholder="ここに英語で入力"
            className="border px-3 py-2 rounded w-full mb-2"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button
            onClick={() => handleAnswer(inputAnswer)}
            className="bg-[#4A6572] text-white rounded-full px-6 py-2 hover:bg-[#3F555F] transition shadow mt-2"
          >
            採点する
          </button>
        </>
      )}

      {/* 🎯 採点ボタン */}
      {!useHandwriting && (
        <button
          onClick={() => handleAnswer(inputAnswer)}
          className="bg-[#4A6572] text-white rounded-full px-6 py-2 hover:bg-[#3F555F] transition shadow mt-2"
        >
          採点する
        </button>
      )}

      {/* OCRモード切替 */}
      {useHandwriting && (
        <label className="text-sm text-gray-700 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={ocrEngine === "vision"}
            onChange={() =>
              setOcrEngine(ocrEngine === "vision" ? "tesseract" : "vision")
            }
            className="mr-1"
          />
          高精度OCR（Google Vision）を使う
        </label>
      )}

      <div className="mt-2 flex justify-end w-full">
        <label className="text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={useHandwriting}
            onChange={() => setUseHandwriting(!useHandwriting)}
            className="mr-1"
          />
          手書き入力を使う（記録されます）
        </label>
      </div>
    </div>
  );

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
    // ✅ 単語を正規化（末尾ピリオド等を除去）
    const cleanWord = normEn(word);

    setSelectedWord(cleanWord);
    setWordMeaning("翻訳中...");

    // 🔹 英単語を音声で再生
    await speakExplanation(cleanWord, "en-US");

    try {
      const res = await fetch(
        `/api/translate?word=${encodeURIComponent(cleanWord)}`
      );
      if (!res.ok) throw new Error("Translation API error");
      const data = await res.json();

      // ✅ 日本語訳を正規化（末尾「。」などを除去）
      const meaning = normJa(data.translation);

      setWordMeaning(meaning);

      // ✅ 単語帳に保存（重複チェックあり）
      setWordList((prev) => {
        if (prev.some((item) => item.word === cleanWord)) return prev;
        return [...prev, { word: cleanWord, meaning }];
      });
    } catch (err) {
      console.error(err);
      setWordMeaning("意味を取得できませんでした");
    }
  };

  const selectAllUnits = () => {
    const newModes = {};
    units.forEach((u) => (newModes[u] = 1)); // 1 = 両方
    setUnitModes(newModes);
  };
  const clearAllUnits = () => {
    const newModes = {};
    units.forEach((u) => (newModes[u] = 0)); // 0 = 未選択
    setUnitModes(newModes);
  };
  const filtered = useMemo(() => {
    return questions.filter((q) => {
      const mode = unitModes[q.unit] || 0;
      if (mode === 0) return false; // 未選択
      if (mode === 1) return true; // 両方
      if (mode === 2) return q.type === "multiple-choice"; // 選択問題のみ
      if (mode === 3) return q.type === "input"; // 記述問題のみ
      return false;
    });
  }, [questions, unitModes]);

  // クイズ開始処理
  const startQuiz = () => {
    if (filtered.length === 0) {
      alert("選択した単元に問題がありません。");
      return;
    }

    const shuffled = shuffleArray(filtered);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);

    // ✅ filteredQuestions の更新前に limited.length を使う
    setInitialQuestionCount(limited.length); // ← これが重要！

    setCharacterMood("neutral");
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
  };

  // 出題対象の問題を作る処理
  useEffect(() => {
    if (questions.length > 0 && Object.keys(unitModes).length > 0) {
      const selected = questions.filter((q) => {
        const mode = unitModes[q.unit] || 0;
        if (mode === 0) return false; // 未選択 → 出さない
        if (mode === 1) return true; // 両方 → 出す
        if (mode === 2) return q.type === "multiple-choice"; // 選択問題のみ
        if (mode === 3) return q.type === "input"; // 記述問題のみ
        return false;
      });

      setFilteredQuestions(selected);
    }
  }, [questions, unitModes]);

  // 切り替えは音量制御のみ

  useEffect(() => {
    if (!showQuestions && !showResult) {
      // 単元選択画面
      if (soundEnabled) {
        (async () => {
          try {
            if (audioCtx?.state === "suspended") {
              await audioCtx.resume();
              console.log("[Audio] resumed in unit select");
            }
            if (bgmGain) {
              bgmGain.gain.value = 0.4;
            }
          } catch (e) {
            console.warn("[Audio] resume failed in unit select", e);
          }
        })();
      }
    }
  }, [showQuestions, showResult, soundEnabled]);

  useEffect(() => {
    const applyBGM = async () => {
      initAudio();

      if (!soundEnabled) {
        bgmGain.gain.value = 0;
        qbgmGain.gain.value = 0;
        return;
      }

      await ensureAudioResume();

      // ✅ 通常問題中 or 復習中のBGM制御
      if (showQuestions) {
        if (isReviewMode) {
          prepareNextAudioResume();
          stopQbgm(true);
          qbgmSource = null;
          await ensureAudioResume();

          setTimeout(async () => {
            try {
              await ensureLoop("/sounds/review.mp3", qbgmGain, "qbgm", true);
              fadeInBGM(qbgmGain, 0.4, 3.0);
              console.log("[Audio] review BGM started (iOS tap-safe)");
            } catch (e) {
              console.warn("[Audio] review BGM start failed:", e);
            }
          }, 300);
        } else {
          await ensureAudioResume();
          await ensureLoop("/sounds/qbgm.mp3", qbgmGain, "qbgm");
          fadeInBGM(qbgmGain, 0.4, 3.0);
        }
        bgmGain.gain.value = 0;
        setUnitBgmPlaying(false); // ✅ 単元BGM再生中フラグを解除
        globalUnitBgmPlaying = false;
      }

      // ✅ 結果画面
      else if (showResult) {
        if (isReviewMode) {
          fadeInBGM(qbgmGain, 0, 1.0);
          setTimeout(() => stopQbgm(true), 1200);
        } else {
          bgmGain.gain.value = 0.001;
          qbgmGain.gain.value = 0;
        }
        setUnitBgmPlaying(false); // ✅ 結果画面でも解除
        globalUnitBgmPlaying = false;
      }

      // ✅ 単元選択画面（ここを重点修正）
      else if (!showQuestions && !showResult) {
        if (!globalUnitBgmPlaying) {
          // まだ単元BGMが流れていない場合のみ再生
          try {
            if (bgmSource) {
              bgmSource.stop(0);
              bgmSource = null;
            }
            await ensureLoop("/sounds/bgm.mp3", bgmGain, "bgm", true);
            fadeInBGM(bgmGain, 0.4, 2.0);
            qbgmGain.gain.value = 0;
            globalUnitBgmPlaying = true; // ✅ グローバル変数に記録
            console.log("[Audio] bgm started for unit select (first only)");
          } catch (e) {
            console.warn("[Audio] bgm start failed:", e);
          }
        } else {
          console.log("[Audio] bgm already playing, skip start");
        }
      }
    };

    applyBGM();
  }, [soundEnabled, showQuestions, showResult, isReviewMode]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().then(() => {
          console.log("[Audio] resumed on first gesture");
        });
      }
    };

    // ✅ iOSは touchstart の方が確実
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("vol_master", String(masterVol));
    if (masterGainRef.current && audioCtx) {
      masterGainRef.current.gain.setValueAtTime(
        masterVol / 100,
        audioCtx.currentTime
      );
    }
  }, [masterVol]);

  useEffect(() => {
    localStorage.setItem("vol_sfx", String(sfxVol));
    if (sfxGainRef.current && audioCtx) {
      sfxGainRef.current.gain.setValueAtTime(
        sfxVol / 100,
        audioCtx.currentTime
      );
    }
  }, [sfxVol]);

  useEffect(() => {
    localStorage.setItem("vol_bgm", String(bgmVol));
    if (bgmGainRef.current && audioCtx) {
      bgmGainRef.current.gain.setValueAtTime(
        bgmVol / 100,
        audioCtx.currentTime
      );
    }
  }, [bgmVol]);

  useEffect(() => {
    if (!soundEnabled) return; // 🔇 OFFなら鳴らさない
    // 単元選択画面が表示されたときに再生
    if (soundEnabled && !showQuestions && !showResult && units.length > 0) {
      playSFX("/sounds/sentaku.mp3");
    }
  }, [soundEnabled, showQuestions, showResult, units]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("soundEnabled", String(soundEnabled));
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("wordList", JSON.stringify(wordList));
    }
  }, [wordList]);

  useEffect(() => {
    if (!soundEnabled) return; // 🔇 OFFなら鳴らさない
    if (showQuestions && currentQuestion) {
      let soundFile = null;

      if (currentIndex === 0) {
        // ✅ 最初の問題
        soundFile = "/sounds/deden.mp3"; // ← 1問目専用の音
      } else {
        // ✅ 2問目以降
        soundFile = "/sounds/mondai.mp3"; // ← 通常の出題音
      }

      if (soundFile) {
        playSFX(soundFile);
      }
    }
  }, [currentIndex, showQuestions]);

  useEffect(() => {
    if (!userName) {
      const name = prompt(
        "あなたの名前（またはニックネーム）を入力してください"
      );
      if (name && name.trim() !== "") {
        handleSetUserName(name.trim());
        localStorage.setItem("userName", name.trim());
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("streak", String(streak));
    }
  }, [streak]);

  // ✅ unitStats の保存（ユーザーごとに別管理）
  useEffect(() => {
    if (userName) {
      localStorage.setItem(`unitStats_${userName}`, JSON.stringify(unitStats));
    }
  }, [unitStats, userName]);

  // ✅ unitStats の復元（ユーザー切り替え時）
  useEffect(() => {
    if (userName) {
      const saved = localStorage.getItem(`unitStats_${userName}`);
      if (saved) {
        setUnitStats(JSON.parse(saved));
        console.log(`[LOAD] ${userName} の unitStats を復元しました`);
      } else {
        setUnitStats({}); // 新しいユーザーは空
      }
    }
  }, [userName]);

  // 🔽 追加: 問題切り替え時に制限時間を設定
  useEffect(() => {
    if (!currentQuestion || showFeedback || showResult) return;

    let limit = 15; // デフォルト
    if (currentQuestion.type === "input") {
      limit = 50; // 記述問題
    } else if (currentQuestion.type === "multiple-choice") {
      if (currentQuestion.unit && currentQuestion.unit.includes("読解")) {
        limit = 30; // 読解問題
      } else {
        limit = 15; // 通常の選択問題
      }
    }

    setTimeLeft(limit);
    setMaxTime(limit);
    setTimerActive(true);
    setShowAnswer(false);
  }, [currentQuestion, showFeedback, showResult]);

  // 🔽 カウントダウン処理
  useEffect(() => {
    if (!showQuestions) return; // ← クイズ画面でなければタイマー止める
    if (!timerActive || timeLeft <= 0 || showResult) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerActive, timeLeft, showResult, showQuestions]);

  // 🔽 カウントダウン音 (残り5秒以内)
  useEffect(() => {
    if (
      !showQuestions || // ← ここでしっかりガード
      !timerActive ||
      showResult ||
      timeLeft <= 0 ||
      !soundEnabled
    )
      return;

    if (timeLeft <= 5) {
      const key = `${currentIndex}-${timeLeft}`;
      if (!countPlayedForQuestion[key]) {
        playSFX("/sounds/count.mp3");
        setCountPlayedForQuestion((prev) => ({ ...prev, [key]: true }));
      }
    }
  }, [timeLeft, timerActive, soundEnabled, showQuestions, currentIndex]);

  // ✅ 解説の自動読み上げ（不正解時は誤答解説を優先）
  useEffect(() => {
    if (!showFeedback || !currentQuestion) return;

    const textToRead = isCorrect
      ? currentQuestion.explanation
      : currentQuestion.incorrectExplanations?.[selectedChoice] ??
        `正解は「${currentQuestion.correct}」。${currentQuestion.explanation}`;

    if (!textToRead || textToRead.trim() === "") return;

    // ✅ 再生開始時にボタンを無効化
    setIsSpeaking(true);

    // 音声再生
    speakExplanation(textToRead);

    // ✅ テキスト長から再生時間を概算して解除
    const len = textToRead.length;
    let delay = 2500; // 最短3秒
    if (len > 50 && len <= 100) delay = 4500; // 中くらい
    else if (len > 100) delay = 7500; // 長め

    const timer = setTimeout(() => setIsSpeaking(false), delay);

    // クリーンアップ（次の問題に行くときにタイマー解除）
    return () => clearTimeout(timer);
  }, [showFeedback, isCorrect, currentQuestion, selectedChoice]);

  // 時間切れ処理
  useEffect(() => {
    if (!timerActive || timeLeft > 0 || !currentQuestion || showResult) return;

    setTimerActive(false);
    setCharacterMood("panic");
    setTimeUp(true); // 時間切れ演出フラグON

    // 時間切れ音を再生
    if (soundEnabled) {
      playSFX("/sounds/timesup.mp3");
    }

    // ✅ 1.5秒後に自動不正解処理を実行
    setTimeout(() => {
      console.log("⏰ 時間切れ → 自動で不正解扱い");
      handleAnswer("(時間切れ)"); // ← ★追加（これだけでOK）
      setShowFeedback(true);
      setIsCorrect(false);
      setShowAnswer(true);
      setSelectedChoice("（時間切れ）");
      setTimeUp(false); // 演出を消す

      if (!mistakes[currentQuestion.id]) {
        setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
        setFirstMistakeAnswers((prev) => ({
          ...prev,
          [currentQuestion.id]: "（時間切れ）",
        }));
      }
    }, 1500);
  }, [
    timeLeft,
    timerActive,
    currentQuestion,
    mistakes,
    showResult,
    soundEnabled,
  ]);

  useEffect(() => {
    if (!showResult) return; // 結果画面以外は処理しない

    // タイマー停止処理
    setTimerActive(false);
    setTimeLeft(0);
    setTimeUp(false);

    if (!soundEnabled) return; // 🔇 サウンドOFFなら処理しない

    // 効果音を再生
    const playResultSound = () => {
      let soundFile = null;

      if (adjustedCorrectRate === 100) {
        soundFile = "/sounds/manten.mp3";
      } else if (adjustedCorrectRate >= 80) {
        soundFile = "/sounds/yokudekimasita.mp3";
      } else if (adjustedCorrectRate > 0) {
        soundFile = "/sounds/ganbarimasho.mp3";
      } else {
        soundFile = "/sounds/zero.mp3";
      }

      if (soundFile) {
        muteBGM();
        playSFX(soundFile);
      }
    };

    playResultSound();
  }, [showResult]);

  useEffect(() => {
    if (currentQuestion?.choices) {
      setShuffledChoices(shuffleArray(currentQuestion.choices));
    }
  }, [currentQuestion]);

  useEffect(() => {
    console.log("unitStats 更新:", unitStats);
  }, [unitStats]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("unitStats", JSON.stringify(unitStats));
    }
  }, [unitStats]);

  useEffect(() => {
    console.log("=== 単元ごとのwrongカウント ===", unitStats);
    units.forEach((u) => {
      console.log("ボタン描画対象:", u, "→", unitStats[u]?.wrong);
    });
  }, [unitStats, units]);

  const handleInputChange = (e) => {
    const value = e.target.value;

    // 直前から2文字以上まとめて増えた場合は候補入力の可能性あり
    if (value.length - lastLength > 1) {
      setShowWarning(true);
      setInputAnswer(""); // 入力リセット
    } else {
      setShowWarning(false);
      setInputAnswer(value);
    }

    setLastLength(value.length);
  };

  const handleTestInputChange = (e) => {
    const value = e.target.value;
    const diff = value.length - lastLengthTest;

    if (diff > 1) {
      setShowWarningTest(true);
      setAnswer(""); // リセット
    } else {
      setShowWarningTest(false);
      setAnswer(value); // 正常入力
    }
    setLastLengthTest(value.length);
  };

  const handleAnswer = (answer) => {
    const currentQuestion = filteredQuestions[currentIndex];
    let isCorrectAnswer = false;

    if (currentQuestion.type === "multiple-choice") {
      isCorrectAnswer = answer === currentQuestion.correct;
    } else if (currentQuestion.type === "input") {
      const raw = Array.isArray(currentQuestion.correct)
        ? currentQuestion.correct
        : Array.isArray(currentQuestion.correctAnswers)
        ? currentQuestion.correctAnswers
        : currentQuestion.correctAnswer ?? currentQuestion.correct ?? "";

      const corrects = expandCorrects(raw);

      // ✅ 末尾のピリオド・カンマ・空白を統一して削りすぎない
      const normalize = (s) =>
        s
          .trim()
          .replace(/\s+/g, " ")
          .replace(/[’‘]/g, "'")
          .replace(/[“”]/g, '"')
          .replace(/[．。]/g, ".")
          .replace(/[,，]/g, ",")
          .replace(/\s*,\s*/g, ", ")
          .replace(/\s*\.\s*/g, ".")
          .replace(/[ ]+$/g, "") // 末尾空白だけ除去
          .toLowerCase();

      const userInput =
        typeof answer === "string" && answer.trim() !== ""
          ? answer
          : inputAnswer;

      const user = normalize(userInput);

      // ✅ 完全一致のみ判定（末尾ピリオドの有無も許容）
      isCorrectAnswer = corrects.some((c) => {
        const normC = normalize(c);
        return normC === user || normC + "." === user || normC === user + ".";
      });
    }

    const unit = currentQuestion.unit;

    // ✅ 覚え直しモードではスコア集計をスキップ
    if (!reviewing) {
      setUnitStats((prev) => {
        const prevStat = prev[unit] || { wrong: 0, total: 0 };
        return {
          ...prev,
          [unit]: {
            ...prevStat,
            total: prevStat.total + 1,
          },
        };
      });
    }

    if (isCorrectAnswer) {
      setCharacterMood("happy");
      if (soundEnabled) playSFX("/sounds/correct.mp3");

      if (reviewing || isReviewMode) {
        // 🔁 覚え直し中 or 復習モード中 → 不正解扱い＋スコア除外
        console.log("📘 復習または覚え直し中の正解 → 不正解としてカウント");
        const unit = currentQuestion.unit;
        setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
        setFirstMistakeAnswers((prev) => ({
          ...prev,
          [currentQuestion.id]: "(覚え直し正解)",
        }));
        setReviewAnsweredIds((prev) => new Set([...prev, currentQuestion.id]));
        setUnitStats((prev) => {
          const prevStat = prev[unit] || { wrong: 0, total: 0 };
          return {
            ...prev,
            [unit]: {
              wrong: prevStat.wrong + 1, // ← 不正解扱いとして加算
              total: prevStat.total + 1, // ← 出題数もカウント
            },
          };
        });
        setStreak(0); // ← 連続正解リセット
        setAddMessage("📘 覚え直し中はスコア対象外");
      } else {
        // ✅ 通常の正解処理
        setStreak((prev) => prev + 1);
        setUnitStats((prev) => {
          const prevStat = prev[unit] || { wrong: 0, total: 0 };
          return {
            ...prev,
            [unit]: { ...prevStat, total: prevStat.total + 1 },
          };
        });

        if (streak + 1 >= 20) {
          setAddMessage("🎉 20連続正解達成！すごすぎる！！");
        } else if (streak + 1 >= 15) {
          setAddMessage("🔥 15連続正解！神ってる！！");
        } else if (streak + 1 >= 10) {
          setAddMessage("✨ 10連続正解！その調子！");
        } else if (streak + 1 >= 5) {
          setAddMessage("👍 5連続正解！いいぞ！");
        } else {
          setAddMessage("");
        }
      }
    } else {
      setCharacterMood("sad");
      if (soundEnabled) playSFX("/sounds/wrong.mp3");

      if (!reviewing) {
        setStreak(0);
        setAddMessage("😅 もう一度がんばろう！");

        if (!mistakes[currentQuestion.id]) {
          setMistakes((prev) => ({ ...prev, [currentQuestion.id]: true }));
          setFirstMistakeAnswers((prev) => ({
            ...prev,
            [currentQuestion.id]: answer,
          }));

          setUnitStats((prev) => {
            const prevStat = prev[unit] || { wrong: 0, total: 0 };
            return {
              ...prev,
              [unit]: {
                ...prevStat,
                wrong: prevStat.wrong + 1,
                total: prevStat.total + 1,
              },
            };
          });
        }
      }
    }

    setSelectedChoice(answer);
    setIsCorrect(isCorrectAnswer);
    setShowFeedback(true);
    setTimerActive(false);
    setInputAnswer("");
    setHintLevel(0);
    setHintText("");
  };

  const handleNext = async () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setCharacterMood("neutral");

    if (isCorrect) {
      if (currentIndex + 1 < filteredQuestions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // ここから ↓↓↓ 修正
        if (reviewList.length > 0) {
          // 復習出題キューを保存して、モーダルを出す
          reviewQueueRef.current = [...reviewList];
          setShowReviewPrompt(true);
          return; // ← ここで一旦止める（開始はモーダルのボタンで）
        }
        // ↑↑↑ 修正 おわり

        // 復習なし通常終了
        setShowQuestions(false);
        setShowResult(true);
        setTimerActive(false);
        setTimeLeft(0);
        setIsReviewMode(false);
      }
      setShowFeedback(false);
    } else {
      if (soundEnabled) playSFX("/sounds/ganba.mp3");
      setShowFeedback(false);
    }

    setSelectedChoice(null);
    setTimeout(() => setInputDisabled(false), 300);
  };

  const startReview = async () => {
    // 1) iOS許可をユーザー操作中に取得
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
        console.log("[Audio] resumed in startReview (tap-safe)");
      } catch (e) {
        console.warn("[Audio] resume failed in startReview", e);
      }
    }

    // 2) 既存の問題BGMを安全停止し、復習BGMへ強制切替
    try {
      if (typeof stopQbgm === "function") stopQbgm(true);
    } catch (e) {
      console.warn("[Audio] stopQbgm failed", e);
    }
    try {
      await ensureLoop("/sounds/review.mp3", qbgmGain, "qbgm", true); // ← forceReload=true
      fadeInBGM(qbgmGain, 0.4, 2.0);
    } catch (e) {
      console.warn("[Audio] review BGM start failed", e);
    }

    // 3) 復習の出題状態をセット
    const reviewCopy = reviewQueueRef.current || [];
    setFilteredQuestions(reviewCopy);
    setCurrentIndex(0);
    setShowFeedback(false);
    setTimerActive(false);
    setShowResult(false);
    setReviewList([]);
    setIsReviewMode(true);
    setShowReviewPrompt(false);

    // 4) 出題SFX（ユーザー操作中なのでiOSでも確実に鳴る）
    if (soundEnabled) {
      playSFX("/sounds/deden.mp3"); // 1問目SE
    }
  };

  const startWordTest = () => {
    if (wordList.length === 0) {
      alert("単語帳が空です");
      return;
    }
    setRound(1);
    setTestIndex(0);
    setTestWord(wordList[0]);
    setWrongWords([]);
    setAnswer("");
    setShowWordTest(true);
  };

  const restartQuiz = () => {
    setCharacterMood("neutral");
    setCurrentIndex(0);
    setMistakes({});
    setFirstMistakeAnswers({});
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setInputAnswer("");
    setHintLevel(0);
    setHintText("");
    setTimerActive(false);
    setTimeLeft(0);

    // 🔽 同じ問題を最初から出す
    setFilteredQuestions([...initialQuestions]);
  };

  const hintPenalties = [2, 5, 10];

  const generateHint = () => {
    const answer = currentQuestion?.correct; // ← correct に修正
    if (!answer) return "";

    const words = answer.trim().split(/\s+/);
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

      setHintLevels((prev) => ({
        ...prev,
        [currentQuestion.id]: nextLevel,
      }));
    }
  };

  const handleAddToQuestionList = () => {
    if (!currentQuestion) return;

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
      explanation: getFeedbackText({
        currentQuestion,
        isCorrect,
        selectedChoice,
      }), // ←ここ！
    };

    setQuestionList((prev) => [...prev, questionItem]);
    setAddMessage("質問ボックスに保存しました！");

    setTimeout(() => setAddMessage(""), 3000);
  };

  const handleAddSpecificQuestionToList = (question, answer) => {
    if (!question) return;

    const isAlreadySaved = questionList.some((item) => item.id === question.id);
    if (isAlreadySaved) {
      setAddMessage("この質問はすでに質問ボックスに入っています。");
      return;
    }

    const questionItem = {
      id: question.id,
      question: question.question || question.prompt,
      answer: answer || "",
      correct: question.correct || question.correctAnswer,
      explanation: question.explanation,
    };

    setQuestionList((prev) => [...prev, questionItem]);
    setAddMessage("質問ボックスに保存しました！");

    setTimeout(() => setAddMessage(""), 3000);
  };

  const handleDeleteQuestion = (index) => {
    const newList = [...questionList];
    newList.splice(index, 1);
    setQuestionList(newList);
  };

  // ========== UI ==========
  // ✅ 覚え直し問題ID一覧
  const reviewIds = new Set(
    Array.isArray(reviewMistakes) ? reviewMistakes.map((q) => String(q.id)) : []
  );

  // ✅ 全体の出題数
  const totalQuestions = initialQuestionCount || filteredQuestions.length;

  // ✅ 不正解数（スコア計算では覚え直しも“不正解扱い”）
  const incorrectCount = Object.keys(mistakes || {}).length;

  // ✅ 正答数
  const correctCount = Math.max(0, totalQuestions - incorrectCount);

  // ✅ 正答率
  const correctRate =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // ✅ 不正解リスト（表示上は「覚え直し」と重複しないように除外）
  const incorrectQuestionsList = filteredQuestions.filter(
    (q) => mistakes[q.id] && !reviewIds.has(String(q.id))
  );

  // ✅ ヒントペナルティ
  const totalHintPenalty = Object.values(hintLevels || {})
    .map((level) =>
      level === 0 ? 0 : hintPenalties.slice(0, level).reduce((a, b) => a + b, 0)
    )
    .reduce((a, b) => a + b, 0);

  // ✅ 最終スコア
  const adjustedCorrectRate = Math.max(0, correctRate - totalHintPenalty);

  if (!showQuestions && !showResult && units.length === 0) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-pink-100 to-yellow-100 max-w-4xl mx-auto p-4">
      {!(useHandwriting && currentQuestion?.type === "input") && (
        <div className="flex justify-between items-center mb-4">
          <div className="fixed bottom-3 right-4 flex items-center gap-2 z-50 bg-white/80 backdrop-blur-sm px-3 py-2 rounded-full shadow-md">
            <span className="text-gray-700 font-bold">
              {userName ? `${userName} さん` : "ゲスト"}
            </span>
            {!showQuestions && !showResult && (
              <button
                onClick={() => {
                  const name = prompt("新しい名前を入力してください");
                  if (name && name.trim() !== "") {
                    handleSetUserName(name.trim());
                    localStorage.setItem("userName", name.trim());
                  }
                }}
                className="bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded-full shadow transition"
              >
                ユーザー変更
              </button>
            )}
          </div>
          {!showQuestions && !showResult && (
            <h1 className="text-2xl font-bold">
              英語ひっかけ問題 ～塾長からの挑戦状～
            </h1>
          )}
          <button
            onClick={() => playButtonSound(() => setShowQuestionModal(true))}
            className="bg-yellow-300 hover:bg-yellow-400 text-[#4A6572] px-4 py-2 rounded-full shadow transition"
          >
            📥 質問ボックス（{questionList.length}件）
          </button>
        </div>
      )}

      {/* スタート画面 */}
      {!showQuestions && !showResult && units.length > 0 && (
        <div className="max-w-2xl mx-auto bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-6 shadow">
          <h2 className="text-2xl font-bold text-[#4A6572] mb-4 text-center">
            単元を選んでください（緑=両方、青=選択、橙=記述）
          </h2>
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={() => playButtonSound(() => selectAllUnits())}
              className="bg-[#A7D5C0] text-[#4A6572] px-4 py-2 rounded-full shadow-sm hover:bg-[#92C8B2] transition"
            >
              全選択
            </button>
            <button
              onClick={() => playButtonSound(() => clearAllUnits())}
              className="bg-[#F8B195] text-white px-4 py-2 rounded-full shadow-sm hover:bg-[#F49A87] transition"
            >
              全解除
            </button>
          </div>

          {userName && (
            <div className="text-center text-lg font-bold text-[#4A6572] mb-2">
              👋 ようこそ、{userName} さん！
            </div>
          )}

          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {units.map((unit) => {
              const mode = unitModes[unit] || 0;
              let color = "bg-white border"; // 未選択

              if (mode === 1) color = "bg-green-400"; // 両方
              if (mode === 2) color = "bg-blue-400"; // 選択のみ
              if (mode === 3) color = "bg-orange-400"; // 記述のみ

              // 🎨 色分けロジック（割合によって文字色を決定）
              const stat = unitStats[unit];
              let textColor = "text-gray-800"; // デフォルト

              if (stat && stat.total > 0) {
                const rate = stat.wrong / stat.total;
                if (rate === 0) textColor = "text-gray-800";
                else if (rate <= 0.1) textColor = "text-green-300 font-bold";
                else if (rate <= 0.2) textColor = "text-yellow-300 font-bold";
                else if (rate <= 0.3) textColor = "text-orange-400 font-bold";
                else textColor = "text-red-500 font-bold";
              }

              // 🎯 ボタン本体の return はここ！
              return (
                <button
                  key={unit}
                  onClick={() => playButtonSound(() => toggleUnitMode(unit))}
                  className={`px-4 py-2 rounded-full shadow-sm transition ${color}`}
                >
                  <span className={textColor}>{unit}</span>
                </button>
              );
            })}
          </div>
          <h2 className="text-xl font-bold text-[#4A6572] mb-2 text-center">
            出題数を選んでください
          </h2>
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {[5, 10, 15, "all"].map((count) => (
              <button
                key={count}
                onClick={() => playButtonSound(() => setQuestionCount(count))}
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
          {/* サウンドON/OFFボタン */}
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setShowWordList(true)}
              className="bg-blue-400 hover:bg-blue-500 text-white px-4 py-2 rounded-full shadow transition"
            >
              📖 単語帳（{wordList.length}件）
            </button>

            <button
              onClick={async () => {
                // ✅ ON/OFF に関わらず、ボタンクリック時に必ず resume() を試みる
                if (audioCtx && audioCtx.state === "suspended") {
                  try {
                    await audioCtx.resume();
                    console.log("[Audio] resumed by sound button");
                  } catch (e) {
                    console.warn("[Audio] resume failed", e);
                  }
                }

                // ✅ soundEnabled の切り替え
                setSoundEnabled((prev) => !prev);
              }}
              className={`px-4 py-2 rounded-full shadow transition ${
                soundEnabled
                  ? "bg-green-400 text-white"
                  : "bg-gray-300 text-black"
              }`}
            >
              {soundEnabled ? "🔊 サウンドOFF" : "🔈 サウンドON"}
            </button>
          </div>

          <label className="text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={ocrEngine === "vision"}
              onChange={() =>
                setOcrEngine(ocrEngine === "vision" ? "tesseract" : "vision")
              }
              className="mr-1"
            />
            高精度OCR（Google Vision）を使う
          </label>

          <button
            onClick={() => {
              if (filtered.length === 0) {
                alert("選択した単元に問題がありません。");
                return;
              }
              initAudio();
              startQuiz();
            }}
            disabled={units.length === 0 || !questionCount}
            className={`rounded-full px-6 py-3 shadow transition mx-auto block font-bold
    ${
      units.length === 0 || !questionCount
        ? "bg-gray-400 text-white cursor-not-allowed"
        : "bg-red-500 hover:bg-red-600 text-white"
    }`}
          >
            🚀 開始
          </button>
        </div>
      )}

      {/* クイズ進行中 */}
      {showQuestions && !showResult && currentQuestion && (
        <div>
          <Character mood={characterMood} userName={userName} />

          {/* 🌟 連続正解カウンター表示 */}
          {streak > 0 && (
            <div className="text-center text-lg font-bold text-[#4A6572] mt-2">
              🌟 連続正解：{streak}問！
            </div>
          )}

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
                        onClick={() =>
                          playButtonSound(() => setShowAnswer(true))
                        }
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
                        onClick={() =>
                          playButtonSound(() => {
                            setShowAnswer(false);
                            setShowFeedback(false);
                          })
                        }
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

                {/* ✅ 正解/不正解で表示内容を切り替え */}
                <p className="text-gray-800 leading-relaxed">
                  {isCorrect
                    ? currentQuestion.explanation
                    : currentQuestion.incorrectExplanations?.[selectedChoice] ??
                      `正解は「${currentQuestion.correct}」。${currentQuestion.explanation}`}
                </p>

                {/* ✅ 音声も同じ内容を読み上げるよう統一 */}
                <button
                  onClick={() => {
                    const textToRead = isCorrect
                      ? currentQuestion.explanation
                      : currentQuestion.incorrectExplanations?.[
                          selectedChoice
                        ] ??
                        `正解は「${currentQuestion.correct}」。${currentQuestion.explanation}`;
                    speakExplanation(textToRead);
                  }}
                  className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
                >
                  🔊 解説を聞く
                </button>
              </motion.div>

              {/* 🔁 覚え直すボタン */}
              <button
                onClick={() => {
                  const current = filteredQuestions[currentIndex];

                  setReviewing(true); // ← 覚え直し中モードに切り替え

                  // ✅ 正答を2秒間だけ表示
                  setTemporaryAnswer(
                    Array.isArray(current.correct)
                      ? current.correct.join(" / ")
                      : current.correct ?? current.correctAnswer ?? ""
                  );
                  setShowAnswerTemporarily(true);

                  // ✅ この問題を覚え直しリストに追加
                  setReviewList((prev) => {
                    if (prev.find((q) => q.id === current.id)) return prev; // 重複防止
                    return [...prev, current];
                  });

                  // ✅ 2秒後に答えを伏せて再出題
                  setTimeout(() => {
                    setShowAnswerTemporarily(false);
                    setTemporaryAnswer("");
                    setShowFeedback(false);
                    setTimerActive(true);
                    setReviewing(false); // ← 再出題完了後に解除
                  }, 2000);
                }}
                className="bg-orange-400 hover:bg-orange-500 text-white px-4 py-2 rounded shadow ml-2"
              >
                🔁 覚え直す
              </button>

              <button
                onClick={() => playButtonSound(() => handleAddToQuestionList())}
                className="bg-yellow-400 hover:bg-yellow-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
              >
                後で先生に質問する
              </button>

              <button
                onClick={handleNext}
                disabled={isSpeaking} // ✅ 再生中は押せない
                className={`px-6 py-3 rounded-full shadow-md transition mt-4 text-white font-bold ${
                  isSpeaking
                    ? "bg-gray-400 cursor-not-allowed" // 🔒 再生中はグレーで無効
                    : "bg-pink-400 hover:bg-pink-500" // 🔓 通常時はピンクで有効
                }`}
              >
                {isSpeaking ? "🔈 解説を再生中..." : "次へ"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-[calc(100vh-80px)] bg-gradient-to-r from-pink-100 to-yellow-100">
              {/* === 上部：問題表示エリア（スクロール可） === */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* 🔥 応援メッセージ */}
                {addMessage && (
                  <div className="text-center text-xl font-bold text-[#E57373] mt-1">
                    {addMessage}
                  </div>
                )}

                {/* 🔹 問題番号 */}
                <h2 className="text-lg sm:text-xl font-bold mb-4">
                  第{currentIndex + 1}問 / 全{filteredQuestions.length}問
                </h2>

                {/* 🔹 タイマー */}
                <div
                  className={`text-base sm:text-lg font-bold mb-2 ${
                    timeLeft <= 5
                      ? "text-red-600 animate-pulse"
                      : "text-gray-800"
                  }`}
                >
                  残り時間: {timeLeft} 秒
                </div>

                {/* 🔹 時間バー */}
                <div className="w-full bg-gray-200 h-3 rounded mb-4">
                  <div
                    className={`h-3 rounded transition-all duration-1000 ${
                      timeLeft > 5 ? "bg-green-500" : "bg-red-500 animate-pulse"
                    }`}
                    style={{
                      width: `${maxTime > 0 ? (timeLeft / maxTime) * 100 : 0}%`,
                    }}
                  ></div>
                </div>

                {/* 🔹 時間切れ表示 */}
                {timeUp && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1.2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    className="text-3xl sm:text-4xl font-extrabold text-red-600 text-center my-4"
                  >
                    ⏰ 時間切れ！
                  </motion.div>
                )}

                {/* 🔹 問題文 */}
                <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-4 shadow mb-6 text-left max-w-2xl mx-auto">
                  <h2 className="text-base sm:text-lg font-bold mb-2 word-break-clean whitespace-pre-wrap max-w-prose mx-auto">
                    {currentQuestion.type === "multiple-choice" && (
                      <span>
                        {currentQuestion.question
                          .split(" ")
                          .map((word, idx) => (
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
                    {currentQuestion.type === "input" &&
                      currentQuestion.question}
                  </h2>
                </div>

                {/* ✅ 覚え直し時に一時的に答えを表示 */}
                {showAnswerTemporarily && (
                  <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[2000]">
                    <p className="text-white text-4xl sm:text-6xl font-extrabold text-center px-4 break-words leading-snug">
                      ✅ {temporaryAnswer}
                    </p>
                  </div>
                )}

                {/* === 💡ヒント＆🔁覚え直すボタン群（問題文に近接配置） === */}
                <div
                  className="w-full flex justify-center gap-3 
                -1 mb-1"
                >
                  {/* 💡ヒントボタン */}
                  <button
                    onClick={handleShowHint}
                    className="bg-yellow-400 hover:bg-yellow-500 text-white font-bold px-3 py-1.5 rounded-full shadow text-sm sm:text-base"
                  >
                    💡 ヒント
                  </button>

                  {/* 🔁覚え直すボタン */}
                  <button
                    onClick={() => {
                      const current = filteredQuestions[currentIndex];
                      const raw = Array.isArray(current.correct)
                        ? current.correct
                        : Array.isArray(current.correctAnswers)
                        ? current.correctAnswers
                        : current.correctAnswer ?? current.correct ?? "";

                      const correctText = Array.isArray(raw)
                        ? raw.join(" / ")
                        : raw;

                      setReviewing(true);
                      setTemporaryAnswer(correctText);
                      setShowAnswerTemporarily(true);

                      if (!mistakes[current.id]) {
                        setMistakes((prev) => ({
                          ...prev,
                          [current.id]: true,
                        }));
                        setFirstMistakeAnswers((prev) => ({
                          ...prev,
                          [current.id]: "(覚え直し選択)",
                        }));
                      }

                      setReviewList((prev) => {
                        if (prev.find((q) => q.id === current.id)) return prev;
                        return [...prev, current];
                      });

                      setReviewMistakes((prev) => {
                        if (prev.find((q) => q.id === current.id)) return prev;
                        return [...prev, current];
                      });

                      setTimeout(() => {
                        setShowAnswerTemporarily(false);
                        setTemporaryAnswer("");
                        setShowFeedback(false);
                        setTimerActive(true);
                        setReviewing(false);
                      }, 2000);
                    }}
                    className="bg-orange-400 hover:bg-orange-500 text-white font-bold px-3 py-1.5 rounded-full shadow text-sm sm:text-base"
                  >
                    🔁 覚え直す
                  </button>
                </div>

                {/* ヒントテキストの表示（もしすでに無ければ追加） */}
                {hintText && (
                  <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg shadow text-gray-800 text-center">
                    {hintText}
                  </div>
                )}

                {/* 🔹 選択肢ボタン */}
                {currentQuestion.type === "multiple-choice" && (
                  <div className="fixed bottom-20 left-0 w-full bg-white/95 backdrop-blur-sm p-3 border-t shadow-lg z-40 grid grid-cols-2 gap-2">
                    {shuffledChoices.map((choice, index) => (
                      <button
                        key={index}
                        onClick={() => handleAnswer(choice)}
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#4A6572] hover:bg-[#A7D5C0] transition"
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                )}

                {/* 🔹 単語タップ翻訳結果 */}
                {selectedWord && (
                  <div className="mt-4 p-3 bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg shadow">
                    <h3 className="text-base font-bold text-[#4A6572] mb-1">
                      選択した単語
                    </h3>
                    <p className="text-lg text-[#4A6572]">{selectedWord}</p>
                    <p className="text-gray-800">{wordMeaning}</p>
                  </div>
                )}
              </div>

              {/* === 下部：回答欄（固定表示） === */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm p-3 border-t shadow-lg z-50">
                {currentQuestion.type === "input" && renderInputSection()}
              </div>
            </div>
          )}
        </div>
      )}

      {showReviewPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-xl text-center">
            <h3 className="text-lg font-bold mb-3">
              📘 復習問題をもう一度出すよ！
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              解説を踏まえて、もう一度チャレンジ！
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={startReview} // ← ここで resume + BGM 切替 + 復習開始
                className="px-5 py-2 rounded-full bg-pink-500 hover:bg-pink-600 text-white font-bold"
              >
                復習を始める
              </button>
              <button
                onClick={() => {
                  setShowReviewPrompt(false);
                  setIsReviewMode(false);
                  setShowQuestions(false);
                  setShowResult(true);
                }}
                className="px-5 py-2 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                やめる
              </button>
            </div>
          </div>
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
                    {/* ← ここに新しい質問ボタンを追加 */}
                    <button
                      onClick={() =>
                        playButtonSound(() =>
                          handleAddSpecificQuestionToList(
                            q,
                            firstMistakeAnswers[q.id]
                          )
                        )
                      }
                      className="bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded-full shadow-md transition"
                    >
                      ❓ 後で先生に質問する
                    </button>
                  </p>
                </div>
              ))}
            </div>
          )}

          {reviewMistakes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-orange-600 mb-2">
                🔁 覚え直しリスト
              </h3>
              <ul className="space-y-3">
                {reviewMistakes.map((q) => (
                  <li
                    key={q.id}
                    className="bg-orange-50 border border-orange-200 p-3 rounded-lg shadow-sm"
                  >
                    <p className="font-semibold">{q.question}</p>
                    <p className="text-gray-700">
                      ✅ 正答：
                      {Array.isArray(q.correct)
                        ? q.correct.join(" / ")
                        : q.correct ?? q.correctAnswer ?? ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4">
            {" "}
            <button
              onClick={restartQuiz}
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
                onClick={() =>
                  playButtonSound(() => {
                    setQuestionList([]);
                    localStorage.removeItem("questionList");
                  })
                }
                className="bg-red-400 text-white px-4 py-2 rounded shadow hover:bg-red-500"
              >
                質問ボックスを全てクリア
              </button>
            </div>
          )}
        </div>
      )}

      {showWordList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-lg relative">
            {/* タイトル */}
            <h2 className="text-xl font-bold mb-4">📖 単語帳</h2>

            {/* ===== テスト画面 or 単語一覧 ===== */}
            {showWordTest ? (
              // ===== テスト画面 =====
              <div>
                <h2 className="text-xl font-bold mb-4">
                  {round === 1
                    ? "英→日テスト"
                    : round === 2
                    ? "日→英テスト"
                    : "復習テスト (英→日)"}{" "}
                  ({testIndex + 1}/
                  {round === 3 ? wrongWords.length : wordList.length})
                </h2>

                <p className="text-2xl mb-4">
                  👉{" "}
                  {round === 3
                    ? wrongWords[testIndex].word
                    : round === 1
                    ? testWord.word
                    : testWord.meaning}
                </p>

                {/* === 手書き入力欄 === */}
                <HandwritingPad
                  ocrEngine="vision" // もしくは "tesseract"
                  currentAnswer={answer}
                  onCharRecognized={(char) =>
                    setAnswer((prev) => (prev + char).trim())
                  }
                  onSpace={() => setAnswer((prev) => prev + " ")}
                  onClearAll={() => setAnswer("")}
                  onSubmitAnswer={() => {
                    // ✅ 正答と入力値を正規化して比較
                    const correctAnswer =
                      round === 1
                        ? testWord.meaning // 英→日
                        : round === 2
                        ? testWord.word // 日→英
                        : wrongWords[testIndex].meaning; // ✅ 復習は英→日固定

                    const userAnswer =
                      round === 1
                        ? normJa(answer)
                        : round === 2
                        ? normEn(answer)
                        : normJa(answer); // ✅ 復習は日本語で答える

                    const corr =
                      round === 1
                        ? normJa(correctAnswer)
                        : round === 2
                        ? normEn(correctAnswer)
                        : normJa(correctAnswer);

                    if (userAnswer === corr) {
                      alert("⭕ 正解！");
                    } else {
                      alert(`❌ 不正解。正解は「${correctAnswer}」`);
                      setWrongWords((prev) => [...prev, testWord]);
                    }

                    // === 次の問題に進む処理 ===
                    const nextIndex = testIndex + 1;

                    if (
                      nextIndex <
                      (round === 3 ? wrongWords.length : wordList.length)
                    ) {
                      setTestIndex(nextIndex);
                      if (round === 3) {
                        setTestWord(wrongWords[nextIndex]); // ← 復習モード用の更新
                      } else {
                        setTestWord(wordList[nextIndex]); // ← 英→日 or 日→英用
                      }
                    } else {
                      if (round === 1) {
                        // 英→日が終わったら日→英へ
                        setRound(2);
                        setTestIndex(0);
                        setTestWord(wordList[0]);
                      } else if (round === 2) {
                        // 日→英が終わったら復習へ
                        if (wrongWords.length > 0) {
                          setRound(3);
                          setTestIndex(0);
                          setTestWord(wrongWords[0]); // ← 復習モード最初の単語
                        } else {
                          alert("✅ テスト終了！");
                          setShowWordTest(false);
                        }
                      } else {
                        // 復習モードも終了
                        alert("✅ 復習テスト終了！");
                        setShowWordTest(false);
                      }
                    }
                    setAnswer("");
                  }}
                />

                {/* === 現在の入力を上部に表示（視覚的フィードバック） === */}
                <div className="text-center mt-4 text-lg">
                  🧩 現在の解答：{" "}
                  <span className="font-bold text-blue-700">
                    {answer || "(まだ入力なし)"}
                  </span>
                </div>
              </div>
            ) : (
              // ===== 単語一覧 =====
              <div>
                {wordList.length === 0 ? (
                  <p className="text-gray-600">
                    まだ単語が登録されていません。
                  </p>
                ) : (
                  <ul className="list-disc pl-6 mb-4">
                    {wordList.map((w, i) => (
                      <li
                        key={i}
                        className="flex justify-between items-center mb-2"
                      >
                        <span>
                          {w.word} ― {w.meaning}
                        </span>
                        <button
                          onClick={() =>
                            setWordList((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="ml-4 bg-red-400 hover:bg-red-500 text-white px-2 py-1 rounded"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={startWordTest}
                  className="bg-green-400 hover:bg-green-500 text-white px-4 py-2 rounded-full shadow transition"
                >
                  📝 単語テスト開始（英→日 → 日→英）
                </button>
              </div>
            )}

            {/* 閉じるボタン */}
            <button
              onClick={() => setShowWordList(false)}
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded mt-4"
            >
              閉じる
            </button>
          </div>
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
                      onClick={() =>
                        playButtonSound(() => handleDeleteQuestion(index))
                      }
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
                onClick={() =>
                  playButtonSound(() => setShowQuestionModal(false))
                }
                className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded shadow"
              >
                閉じる
              </button>
              {questionList.length > 0 && (
                <button
                  onClick={() =>
                    playButtonSound(() => {
                      setQuestionList([]);
                      localStorage.removeItem("questionList");
                      setShowQuestionModal(false);
                    })
                  }
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
