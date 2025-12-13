import { supabase } from "../../lib/supabaseClient";
// EnglishTrapQuestions.jsx - 手書き入力＋OCR採点＋記憶機能統合版
import DynamicSkyCanvasBackground from "@/src/components/DynamicSkyCanvasBackground";
import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SignatureCanvas from "react-signature-canvas";
import Tesseract from "tesseract.js";
import React from "react";
import { createPortal } from "react-dom";
import { logout } from "@/lib/logout";
import NextButtonPortal from "@/src/components/NextButtonPortal";
import { saveStudyLog } from "@/lib/saveStudyLog";

// ===== Audio Utility (iPhone対応版) =====
let audioCtx;
let bgmGain, qbgmGain, sfxGain;
let bgmSource = null,
  qbgmSource = null;
// ===== Audio Utility 共通変数 =====
let isBgmPlaying = false; // ✅ BGM多重再生防止フラグ
let isQbgmPlaying = false;
// ===== BGM多重再生防止のグローバルフラグ =====
let globalUnitBgmPlaying = false;
let lastBgmType = null;
let bgmInitLock = false;

function unlockAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      //console.log("[Audio] resumed on user gesture");
    });
  }
}

async function ensureAudioResume() {
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
    //console.log("[Audio] resumed before BGM play");
  }
}

// 最初のクリック/タップで必ず呼ぶ
document.body.addEventListener(
  "touchstart",
  () => {
    if (audioCtx?.state === "suspended") {
      audioCtx.resume();
    }
  },
  { once: true }
);

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
    sfxGain.gain.value = 0.7; // 効果音は常時オン
  }
}

function resetAudioState() {
  try {
    stopBgm(true);
    stopQbgm(true);
  } catch (e) {
    console.warn("[Audio] resetAudioState failed:", e);
  }

  bgmSource = null;
  qbgmSource = null;
  globalUnitBgmPlaying = false;
  lastBgmType = null;
  //console.log("[Audio] full resetAudioState() complete");
}

async function ensureLoop(src, gainNode, storeRefName, forceReload = false) {
  initAudio();

  // ✅ BGM の多重再生防止
  if (storeRefName === "bgm" && bgmSource && !forceReload) {
    //console.log("[ensureLoop] bgm already playing → skip");
    return;
  }

  if (storeRefName === "qbgm" && qbgmSource && !forceReload) {
    //console.log("[ensureLoop] qbgm already playing → skip");
    return;
  }

  // ✅ 強制リロード or 再生前に他の音を確実に止める
  try {
    // 🎯 再生する前に確実に既存のbgmを止める
    stopBgm(true);
    stopQbgm(true);
    bgmSource = null;
    qbgmSource = null;
    globalUnitBgmPlaying = false;
    //console.log("[ensureLoop] force cleared both bgm/qbgm before start");
  } catch (e) {
    console.warn("[ensureLoop] force stop error:", e);
  }

  // ✅ iOS安全：resumeが完了していることを保証
  if (audioCtx && audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
      //console.log("[ensureLoop] AudioContext resumed before start");
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
    //console.log(`[ensureLoop] started ${src} (${storeRefName})`);
  } catch (e) {
    console.warn("[ensureLoop] start failed:", e);
  }

  if (storeRefName === "bgm") bgmSource = source;
  if (storeRefName === "qbgm") qbgmSource = source;
}

// ✅ 非同期対応：停止完了を保証する
function stopBgm(force = false) {
  return new Promise((resolve) => {
    try {
      if (bgmSource) {
        bgmSource.stop(0);
        bgmSource = null;
        //console.log("[Audio] bgm stopped");
      } else if (force) {
        //console.log("[Audio] bgm already null");
        bgmSource = null;
      }
    } catch (e) {
      console.warn("[stopBgm] failed:", e);
    } finally {
      resolve();
    }
  });
}

function stopQbgm(force = false) {
  return new Promise((resolve) => {
    try {
      if (qbgmSource) {
        qbgmSource.stop(0);
        qbgmSource = null;
        //console.log("[Audio] qbgm stopped");
      } else if (force) {
        //console.log("[Audio] qbgm already null");
        qbgmSource = null;
      }
    } catch (e) {
      console.warn("[stopQbgm] failed:", e);
    } finally {
      resolve();
    }
  });
}

function fadeInBGM(gainNode, targetVolume = 0.2, duration = 2.0) {
  if (!audioCtx || !gainNode) return;

  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(0, now); // いったん0から
  gainNode.gain.linearRampToValueAtTime(targetVolume, now + duration);
}

// 🎵 BGM音量を一時的に絞る関数（フェード付き）
const fadeBGMVolume = async (targetVolume, duration = 500) => {
  if (!bgmGainRef.current) return;

  const bgmGain = bgmGainRef.current.gain;
  const startVol = bgmGain.value;
  const steps = 20;
  const stepTime = duration / steps;
  const delta = (targetVolume - startVol) / steps;

  for (let i = 0; i <= steps; i++) {
    bgmGain.value = startVol + delta * i;
    await new Promise((r) => setTimeout(r, stepTime));
  }
};

// 🎧 TTS開始時にBGMを絞り、終了後に戻す
const withBGMDucking = async (fn) => {
  // 現在の音量を記録
  const originalVol = bgmGainRef.current?.gain?.value ?? 1.0;

  try {
    // 🔉 フェードアウト（音量30％）
    await fadeBGMVolume(originalVol * 0.3, 600);

    // 🎙️ 音声再生関数を実行
    await fn();
  } finally {
    // 🔊 終了後にフェードイン
    await fadeBGMVolume(originalVol, 800);
  }
};

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

// 🎲 配列をシャッフルする汎用関数（そのままでOK）
function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const UnitButton = React.memo(({ unit, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-lg border ${
      selected ? "bg-blue-400 text-white" : "bg-gray-100 text-gray-700"
    }`}
  >
    {unit}
  </button>
));

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
  target,
  ocrEngine,
  lowSpecMode,
  onCharRecognized,
  onSpace,
  onClearAll,
  onUpload,
  onSubmitAnswer,
  currentAnswer,
  currentQuestion,
  handleAnswer,
  compact = false,
}) {
  const sigCanvas = useRef(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizedChar, setRecognizedChar] = useState("");
  const [strokes, setStrokes] = useState([]);

  // 🖊 書いた履歴
  const handleEndStroke = () => {
    if (sigCanvas.current) setStrokes(sigCanvas.current.toData());
  };

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

  // 🔍 認識
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
        text = json.text || "";
      } else {
        const result = await Tesseract.recognize(dataURL, "eng+jpn", {
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR,
        });
        text = result.data.text;
      }

      const cleaned = text.trim().replace(/[\u0000-\u001F]/g, "");
      setRecognizedChar(cleaned);
    } catch {
      alert("認識に失敗しました");
    }
    setRecognizing(false);
  };

  // ============================================================
  //              ◎ compact（単語入力用）右下パッド
  // ============================================================
  if (compact) {
    return (
      <div
        className="
    fixed bottom-2 right-2
    bg-white border border-gray-300 rounded-xl shadow-xl
    w-[90vw] max-w-[650px]
    h-[250px]   /* ← ここを小さめにする */
    z-[9000]
    flex flex-col relative
  "
      >
        {/* ✖ 閉じるボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // イベントバブリング防止
            if (onClose) onClose(); // ★ 正しい閉じ方
          }}
          className="absolute -top-3 -right-3 bg-gray-700 text-white w-7 h-7 rounded-full shadow"
        >
          ×
        </button>

        {/* ラベル */}
        <div
          className="absolute top-2 left-2 bg-white/90 px-3 py-1 rounded-lg shadow 
            text-sm font-bold text-[#4A6572]"
        >
          {currentQuestion?.label ||
            (target === "word" ? "✍️ 英単語を入力" : "✍️ 意味（日本語）を入力")}
        </div>

        {/* 現在入力 */}
        <div className="text-center text-base font-bold text-[#4A6572] mt-10 mb-1">
          {currentAnswer || "（まだ入力なし）"}
        </div>

        {/* 認識結果 */}
        <div className="text-center text-sm text-gray-500 mb-1">
          {recognizing
            ? "🔍 認識中..."
            : recognizedChar
            ? `認識結果：${recognizedChar}`
            : "（書いて認識ボタンを押してください）"}
        </div>

        {/* キャンバス */}
        <div className="flex-1 mb-2 px-3">
          <SignatureCanvas
            ref={sigCanvas}
            penColor="black"
            minWidth={2}
            maxWidth={3}
            throttle={lowSpecMode ? 12 : 5}
            backgroundColor="#ffffff"
            canvasProps={{
              className:
                "border-2 border-gray-300 rounded-xl bg-white w-full h-full",
            }}
            onEnd={handleEndStroke}
          />
        </div>

        {/* ボタン */}
        <div className="flex justify-between items-center text-sm px-3 pb-2">
          <button
            onClick={clearCanvas}
            className="px-2 py-1 bg-gray-300 rounded"
          >
            🧽
          </button>
          <button
            onClick={handleUndoLastStroke}
            className="px-2 py-1 bg-orange-400 text-white rounded"
          >
            ⌫
          </button>
          <button
            onClick={recognizeChar}
            className="px-3 py-1 bg-blue-500 text-white rounded"
          >
            認識
          </button>
          <button
            disabled={!recognizedChar} // ← ★認識されるまで押せない
            onClick={() => {
              if (!recognizedChar) return;
              onUpload && onUpload(recognizedChar);
              clearCanvas();
              setRecognizedChar("");
            }}
            className={`
    px-3 py-1 rounded 
    ${
      recognizedChar
        ? "bg-green-500 text-white"
        : "bg-gray-300 text-gray-400 cursor-not-allowed"
    }
  `}
          >
            ⬆
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  //              ◎ 通常の大きいパッド（問題用）
  // ============================================================
  return (
    <div className="w-full flex flex-col items-center">
      {/* ▼ 現在の解答 */}
      <p className="text-gray-700 text-lg font-mono mb-2">
        🧾 現在の解答：
        <span className="font-bold text-[#4A6572]">{currentAnswer}</span>
      </p>

      {/* ▼ 認識結果 */}
      <div className="text-center text-base font-mono mb-1">
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

      {/* ▼ キャンバス */}
      <SignatureCanvas
        ref={sigCanvas}
        penColor="black"
        minWidth={2}
        maxWidth={3}
        throttle={lowSpecMode ? 12 : 5}
        backgroundColor="#ffffff"
        canvasProps={{
          className:
            "border-2 border-gray-300 rounded-xl bg-white w-full h-[120px] mb-2",
        }}
        onEnd={handleEndStroke}
      />

      {/* ▼ ボタン群 */}
      <div className="flex gap-2 mt-1">
        <button onClick={clearCanvas} className="px-2 py-1 bg-gray-300 rounded">
          🧽
        </button>

        <button
          onClick={handleUndoLastStroke}
          className="px-2 py-1 bg-orange-400 text-white rounded"
        >
          ⌫
        </button>

        <button
          onClick={recognizeChar}
          className="px-3 py-1 bg-blue-500 text-white rounded"
        >
          認識
        </button>

        <button
          disabled={!recognizedChar} // ← ★認識されるまで押せない
          onClick={() => {
            if (!recognizedChar) return;

            const newAnswer = (currentAnswer || "") + recognizedChar;

            // ▼ 親コンポーネントへ入力文字追加
            onCharRecognized && onCharRecognized(recognizedChar);

            // ▼ ↓↓↓ 現行ロジックに準拠した判定 ↓↓↓
            if (currentQuestion) {
              const raw = Array.isArray(currentQuestion.correct)
                ? currentQuestion.correct
                : Array.isArray(currentQuestion.correctAnswers)
                ? currentQuestion.correctAnswers
                : currentQuestion.correctAnswer ??
                  currentQuestion.correct ??
                  "";

              const corrects = expandCorrects(raw);
              const userNorm = normEn(newAnswer);

              const isPerfectMatch = corrects.some(
                (c) => normEn(c) === userNorm
              );

              if (isPerfectMatch) {
                handleAnswer && handleAnswer(newAnswer); // ★完全一致時だけ正解扱い！
              }
            }
            // ↑↑↑ 現行判定ロジック維持 ↑↑↑

            clearCanvas();
            setRecognizedChar("");
          }}
          className={`
    px-3 py-1 rounded 
    ${
      recognizedChar
        ? "bg-green-500 text-white"
        : "bg-gray-300 text-gray-400 cursor-not-allowed"
    }
  `}
        >
          ⬆
        </button>

        <button
          onClick={onSpace}
          className="px-3 py-1 bg-yellow-400 text-white rounded"
        >
          ␣
        </button>

        <button
          onClick={onClearAll}
          className="px-3 py-1 bg-red-400 text-white rounded"
        >
          🧹
        </button>

        <button
          disabled={!currentAnswer || currentAnswer.trim() === ""}
          onClick={() => handleAnswer(currentAnswer)}
          className={`
    px-3 py-1 rounded-lg font-bold
    ${
      currentAnswer && currentAnswer.trim() !== ""
        ? "bg-purple-600 hover:bg-purple-700 text-white shadow"
        : "bg-gray-300 text-gray-400 cursor-not-allowed"
    }
  `}
        >
          判定
        </button>
      </div>
    </div>
  );
}

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
    .replace(/[.,!?;:~～]+$/g, "") // 末尾の句読点を削除
    .replace(/\s+/g, " ");

const normJa = (s = "") =>
  s
    .trim()
    .replace(/[。／！？、・（）()\[\]「」『』【】～]+$/g, "") // 末尾の記号を削除
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
  const [unitModes, setUnitModes] = useState({});

  // 効果音 ON/OFF（← これを state 群の先頭付近に）
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("soundEnabled") === "true";
    }
    return false; // 初期状態は OFF
  });

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

  // 🎵 単元選択画面BGMの再生状態
  const [unitBgmPlaying, setUnitBgmPlaying] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);

  // Supabase のユーザー情報
  const [supabaseUser, setSupabaseUser] = useState(null);

  // Supabase から現在のログインユーザーを取得
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSupabaseUser(data?.user || null);
    });
  }, []);

  // Supabase の user_metadata.name を取得
  const supabaseUserName = supabaseUser?.user_metadata?.name;

  // 統合されたユーザー名（最優先は Supabase → fallbackで localStorage → 最後に "あなた"）
  const userName =
    supabaseUserName ||
    (typeof window !== "undefined" && localStorage.getItem("userName")) ||
    "あなた";

  // ✍️ 手書き入力モード（記憶機能付き）
  const [useHandwriting, setUseHandwriting] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("useHandwriting");
      return saved ? JSON.parse(saved) : true; // 初期値は手書きON
    }
    return true;
  });

  // ✔ OCRエンジンをVision固定（state不要）
  const ocrEngine = "vision";

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ocrEngine", ocrEngine);
    }
  }, [ocrEngine]);

  // 🎯 出題形式（複数選択対応）
  const [selectedFormats, setSelectedFormats] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedFormats");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [lowSpecMode, setLowSpecMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("lowSpecMode");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("lowSpecMode", JSON.stringify(lowSpecMode));
    }
  }, [lowSpecMode]);

  // 🎚 軽量モード時は BGM / qBGM を確実に減音
  useEffect(() => {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    // bgmGain の音量制御
    if (bgmGain) {
      bgmGain.gain.cancelScheduledValues(now);
      bgmGain.gain.linearRampToValueAtTime(
        lowSpecMode ? 0.05 : bgmVol / 100,
        now + 1.0
      );
    }

    // qbgmGain の音量制御（問題画面BGM）
    if (qbgmGain) {
      qbgmGain.gain.cancelScheduledValues(now);
      qbgmGain.gain.linearRampToValueAtTime(
        lowSpecMode ? 0.05 : bgmVol / 100,
        now + 1.0
      );
    }
  }, [lowSpecMode, bgmVol, bgmGain, qbgmGain]);

  // ★ alert の代わりに使う小さなポップアップ
  const [popupMessage, setPopupMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const showPopupMessage = (msg) => {
    setPopupMessage(msg);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 1800); // 1.8秒で自動消滅
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [isCustomWordMode, setIsCustomWordMode] = useState(false);
  const [showHandwritingFor, setShowHandwritingFor] = useState(null);
  const [questionCount, setQuestionCount] = useState(null);
  const [questionPlayCount, setQuestionPlayCount] = useState(0);
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [mistakes, setMistakes] = useState({});
  const [initialQuestions, setInitialQuestions] = useState([]);
  const [firstMistakeAnswers, setFirstMistakeAnswers] = useState({});
  const [characterMood, setCharacterMood] = useState("neutral");
  const [inputAnswer, setInputAnswer] = useState("");
  const [lastLength, setLastLength] = useState(0);
  const [selectedWord, setSelectedWord] = useState(null);
  const [wordMeaning, setWordMeaning] = useState("");
  const [reviewList, setReviewList] = useState([]); // 「覚え直す」対象を保存
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false); // 復習開始モーダル表示フラグ
  // 🧠 復習モードで回答済みの問題ID一覧を保持
  const [reviewAnsweredIds, setReviewAnsweredIds] = useState(new Set());
  const reviewQueueRef = useRef([]); // 復習出題キューを保持（alert排除で安全に受け渡し）
  // ✅ 覚え直し（復習）中フラグ
  const [reviewing, setReviewing] = useState(false);
  const [reviewMistakes, setReviewMistakes] = useState([]);
  const [showAnswerTemporarily, setShowAnswerTemporarily] = useState(false);
  const [temporaryAnswer, setTemporaryAnswer] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [hintText, setHintText] = useState("");
  const [hintLevels, setHintLevels] = useState({});
  const [showAnswer, setShowAnswer] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  // 選択肢を一度だけシャッフルして保持
  const [shuffledChoices, setShuffledChoices] = useState([]);

  // 🔽 追加: タイマー state
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [maxTime, setMaxTime] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [countPlayedForQuestion, setCountPlayedForQuestion] = useState({});

  // 単語帳（英単語と意味を保存）
  // 📘 単語テスト専用の複数選択
  const [customWords, setCustomWords] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  // ✅ Supabase一本化した単語帳
  const [originalWords, setOriginalWords] = useState([]);
  const [suggestedMeaning, setSuggestedMeaning] = useState("");
  const [wordList, setWordList] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("wordList");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [toastMessage, setToastMessage] = useState("");
  // ✏️ 編集用ステート
  const [editingWord, setEditingWord] = useState(null); // { word, meaning }
  const [editWord, setEditWord] = useState("");
  const [editMeaning, setEditMeaning] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);

  const [closeHandwritingForce, setCloseHandwritingForce] = useState(false);
  // ★ アップロードを無視するフラグ（永続する）
  const ignoreNextUpload = useRef(false);

  const [showWordFolder, setShowWordFolder] = useState(false);
  const [showWordList, setShowWordList] = useState(false);
  const [showWordTest, setShowWordTest] = useState(false);
  const [showCustomWordInput, setShowCustomWordInput] = useState(false);
  const [tempCustomWord, setTempCustomWord] = useState("");
  const [tempCustomMeaning, setTempCustomMeaning] = useState("");
  const [showOriginalFolder, setShowOriginalFolder] = useState(false);
  const [showOriginalList, setShowOriginalList] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testWord, setTestWord] = useState(null);
  const [answer, setAnswer] = useState("");
  const [wrongWords, setWrongWords] = useState([]);
  const [round, setRound] = useState(1); // 1 = 英→日, 2 = 日→英
  const [lastLengthTest, setLastLengthTest] = useState(0);

  // 単元ごとの間違い回数を記録
  const [unitStats, setUnitStats] = useState({});

  // 連続正解カウンター
  const [streak, setStreak] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("streak") || 0);
    }
    return 0;
  });

  // 単語テスト開始フラグ
  const [startWordQuizFlag, setStartWordQuizFlag] = useState(false);

  // filteredQuestions がセットされ、フラグが ON のときにテスト開始
  useEffect(() => {
    if (!startWordQuizFlag) return;
    if (!filteredQuestions || filteredQuestions.length === 0) return;

    // 🎯 ここで skipFiltering モードで開始
    startQuiz({
      skipFiltering: true,
      directQuestions: filteredQuestions,
    });

    // フラグを戻す
    setStartWordQuizFlag(false);
  }, [startWordQuizFlag, filteredQuestions]);

  // 🧩 My単語を既存問題形式へ変換
  const generateOriginalQuestions = () => {
    return originalWords.map((item) => ({
      id: `custom-${item.id}`,
      unit: "単語テストMy単語",
      question: `「${item.meaning}」を英語で書きなさい。`,
      choices: [],
      correct: item.word,
      explanation: `「${item.meaning}」は英語で ${item.word} です。`,
      incorrectExplanations: {},
      format: "単語・熟語",
      type: "input",
    }));
  };

  const decideMeaning = () => {
    if (!suggestedMeaning) return;

    // ① 日本語訳を meaning にセット
    setTempCustomMeaning(suggestedMeaning);

    // ② 候補ポップアップを閉じる
    setSuggestedMeaning("");

    // ③ 手書きパッドを閉じる（意味入力完了）
    setShowHandwritingFor(null);
  };

  const fetchMeaning = async (word) => {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
      );
      const json = await res.json();

      if (!Array.isArray(json)) return "";
      const defs = json[0]?.meanings?.[0]?.definitions;
      if (!defs?.length) return "";

      return defs[0].definition;
    } catch (e) {
      return "";
    }
  };

  const handleSetUserName = async (newName) => {
    // 空白チェック
    if (!newName || newName.trim() === "") return;

    const name = newName.trim();

    // Supabase の user_metadata を更新
    const { error } = await supabase.auth.updateUser({
      data: { name },
    });

    if (error) {
      alert("名前の更新に失敗しました");
      return;
    }

    // 🔰 互換性のため localStorage にも保存（後で廃止予定）
    localStorage.setItem("userName", name);

    // streakリセット（あなたの仕様）
    setStreak(0);
    localStorage.setItem("streak", "0");

    // 🔥 旧仕様への互換（後でSupabase保存に切り替える）
    const savedStats = localStorage.getItem(`unitStats_${name}`);
    setUnitStats(savedStats ? JSON.parse(savedStats) : {});

    alert("名前を更新しました！");
  };

  const handleChangeUserName = () => {
    const name = prompt("新しい名前を入力してください");
    if (name && name.trim() !== "") {
      handleSetUserName(name.trim());
    }
  };

  function log(message) {
    //console.log(message); // PC用にも出す
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

  // 効果音付きボタンハンドラ
  const playButtonSound = (callback) => {
    if (soundEnabled) {
      playSFX("/sounds/botan.mp3");
    }
    if (callback) callback();
  };

  // 参照（GainやBuffer保持）
  const masterGainRef = useRef(null);
  const sfxGainRef = useRef(null);
  const bgmGainRef = useRef(null);

  // 🎧 現在の音声を全停止するための参照
  const currentAudioRef = useRef([]);
  // 🛑 すべての再生中音声を停止（単一対応・安全版）
  const stopAllAudio = () => {
    try {
      if (!currentAudioRef.current) return;

      // 旧式（配列対応）の場合にも安全に動くようフォールバック
      if (Array.isArray(currentAudioRef.current)) {
        currentAudioRef.current.forEach((audio) => {
          if (audio && typeof audio.pause === "function") {
            audio.pause();
            audio.currentTime = 0;
          }
        });
      } else {
        // ✅ 新構造：単一Audioオブジェクト
        const audio = currentAudioRef.current;
        if (audio && typeof audio.pause === "function") {
          audio.pause();
          audio.currentTime = 0;
        }
      }

      currentAudioRef.current = null;
    } catch (err) {
      console.warn("⚠️ stopAllAudio() でエラー:", err);
    }
  };

  const handleFormatChange = async (newFormat) => {
    // UI 更新
    setSelectedFormats((prev) => {
      // トグル動作：すでにある → 消す / ない → 追加
      const updated = prev.includes(newFormat)
        ? prev.filter((f) => f !== newFormat)
        : [...prev, newFormat];

      // 🔥 Supabase 保存
      saveSelectedFormatsToSupabase(updated);

      return updated;
    });
  };

  // ⭐ Supabase：単元の設定を保存
  const updateUnitSetting = async (unit, mode) => {
    if (!supabaseUser) return;

    const is_selected = mode !== 0;

    const { error } = await supabase.from("user_unit_settings").upsert(
      {
        user_id: supabaseUser.id,
        unit,
        mode,
        is_selected,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,unit" }
    );

    if (error) {
      console.error("Supabase 単元設定保存エラー:", error);
    } else {
      console.log(`🔵 単元設定保存完了: ${unit} → mode=${mode}`);
    }
  };

  const updateAllUnitSettings = async (modesObject) => {
    if (!supabaseUser) return;

    const rows = Object.entries(modesObject).map(([unit, mode]) => ({
      user_id: supabaseUser.id,
      unit,
      mode,
      is_selected: mode !== 0,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from("user_unit_settings")
      .upsert(rows, { onConflict: "user_id,unit" });

    if (error) {
      console.error("❌ 全単元設定保存エラー:", error);
    } else {
      console.log("🟢 全単元設定保存完了", rows.length);
    }
  };

  const toggleUnitMode = (unit) => {
    setUnitModes((prev) => {
      const current = prev[unit] || 0;
      const next = (current + 1) % 4; // 0→1→2→3→0…

      // 🔥 Supabaseに保存
      updateUnitSetting(unit, next);

      return { ...prev, [unit]: next };
    });
  };

  // ✅ 見やすさUP＋低負荷の最適化版
  const renderUnitButton = (unit, displayNameOverride) => {
    const displayName = displayNameOverride || unit;
    const mode = unitModes[unit] || 0;

    // ======== 背景カラー ========
    let bgClass =
      "bg-white border border-gray-300 text-gray-800 hover:bg-gray-100";
    if (mode === 1)
      bgClass =
        "bg-gradient-to-b from-green-300 to-green-500 text-white border-green-500 shadow-md hover:scale-[1.02]";
    else if (mode === 2)
      bgClass =
        "bg-gradient-to-b from-blue-300 to-blue-500 text-white border-blue-500 shadow-md hover:scale-[1.02]";
    else if (mode === 3)
      bgClass =
        "bg-gradient-to-b from-orange-300 to-orange-500 text-white border-orange-500 shadow-md hover:scale-[1.02]";

    // ======== 正答率バッジ ========
    const stat = unitStats[unit];
    let badgeColor = "bg-gray-300";
    let ratePercent = null;

    if (stat && stat.total > 0) {
      ratePercent = Math.round(((stat.total - stat.wrong) / stat.total) * 100);
      const wrongRate = stat.wrong / stat.total;

      if (wrongRate === 0) badgeColor = "bg-emerald-600";
      else if (wrongRate <= 0.1) badgeColor = "bg-emerald-400";
      else if (wrongRate <= 0.2) badgeColor = "bg-yellow-400";
      else if (wrongRate <= 0.3) badgeColor = "bg-orange-400";
      else badgeColor = "bg-red-500";
    }

    // ======== mode ラベル ========
    const modeLabel =
      mode === 1 ? "両方" : mode === 2 ? "４択" : mode === 3 ? "記述" : "";

    return (
      <motion.button
        key={unit}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        onClick={() => playButtonSound(() => toggleUnitMode(unit))}
        className={`relative w-full h-[72px] sm:h-[80px] rounded-2xl font-bold shadow 
        border border-transparent overflow-hidden flex items-center justify-center
        backdrop-blur-sm ${bgClass}`}
        style={{ transformOrigin: "center center" }}
      >
        {/* === 単元名（可変フォント） === */}
        <span
          className="relative z-10 block text-center leading-tight"
          style={{
            fontSize:
              displayName.length >= 8
                ? "11px"
                : displayName.length >= 6
                ? "13px"
                : "15px",
          }}
        >
          {displayName}
        </span>

        {/* === 正答率バッジ（右上） === */}
        {ratePercent !== null && (
          <span
            className={`
            absolute top-1 right-1 text-[10px] text-white 
            px-1.5 py-[2px] rounded-full shadow-sm ${badgeColor}
          `}
          >
            {ratePercent}%
          </span>
        )}

        {/* === mode ラベル（左下へ移動 / 認識性UP） === */}
        {modeLabel && (
          <span
            className="
            absolute bottom-[3px] left-[3px]
            text-[11px] text-white/95 font-semibold 
            px-[4px] py-[1px] rounded-md 
            bg-black/25 backdrop-blur-sm shadow-sm
          "
          >
            {modeLabel}
          </span>
        )}

        {/* === 選択状態（mode>0）だけ下線を表示 === */}
        {mode > 0 && (
          <div
            className="
            absolute bottom-0 left-1/2 -translate-x-1/2
            w-[60%] h-[3px] rounded-full
            bg-gradient-to-r from-sky-400 to-emerald-400 opacity-90
          "
          />
        )}
      </motion.button>
    );
  };

  // ===============================
  // 📘 単語テスト専用ボタン
  // ===============================
  const renderWordTestButton = (unitName, label) => {
    const isSelected = unitModes[unitName] === 1;

    return (
      <button
        key={unitName}
        onClick={async () => {
          const newMode = isSelected ? 0 : 1;

          // UI即時反映
          setUnitModes({
            ...unitModes,
            [unitName]: newMode,
          });

          // Supabase 保存
          await updateUnitSetting(unitName, newMode);
        }}
        className={`
        col-span-2 sm:col-span-1
        rounded-xl py-2 font-bold shadow-md transition
        ${
          isSelected
            ? "bg-blue-500 text-white"
            : "bg-white text-[#4A6572] border border-gray-300 hover:bg-gray-100"
        }
      `}
      >
        {label}
      </button>
    );
  };

  const currentQuestion = filteredQuestions?.[currentIndex] ?? null;

  // 入力式にしたい format をここで定義（必要に応じて追加OK）
  const INPUT_FORMATS = ["単語・熟語", "英作文"];

  // currentQuestion が null の瞬間に備えて安全に取り出す
  const q = currentQuestion ?? null;
  const qFormat = q?.format ?? "";

  // フラグ化（q がなければ両方 false に）
  const isInputFormat = q ? INPUT_FORMATS.includes(qFormat) : false;
  const isChoiceFormat = q ? !isInputFormat : false;

  const startedRef = useRef(false);

  const loadOriginalWordsFromSupabase = async () => {
    if (!supabaseUser) return;

    const { data, error } = await supabase
      .from("original_words")
      .select("id, word, meaning, created_at")
      .eq("user_id", supabaseUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("original_words 読み込みエラー:", error);
      return;
    }

    setOriginalWords(data || []);

    setCustomWords(data || []);
  };

  const loadUserSettings = async () => {
    const { data, error } = await supabase
      .from("user_settings")
      .select("formats") // ←ここ重要（formats）
      .eq("user_id", supabaseUser.id)
      .single();

    if (!error && data?.formats) {
      try {
        const parsed = JSON.parse(data.formats); // ←配列に戻す
        setSelectedFormats(parsed);

        // localStorage も更新しておくと安定します
        localStorage.setItem("selectedFormats", JSON.stringify(parsed));
      } catch (e) {
        console.error("形式設定（formats）の JSON parse 失敗:", e);
      }
    }
  };

  const unitModesLoadedRef = useRef(false);

  useEffect(() => {
    if (!supabaseUser) return;
    loadUserSettings();
  }, [supabaseUser]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      console.log("現在のログイン中UID:", data?.user?.id);
    });
  }, []);

  useEffect(() => {
    if (!supabaseUser) return;
    loadOriginalWordsFromSupabase();
  }, [supabaseUser]);

  // 🔥 ログイン完了後に Supabase から unitModes + unitStats を読み込む
  useEffect(() => {
    if (!supabaseUser) return; // ← ログイン前は絶対に読まない

    const loadFromSupabase = async () => {
      const user_id = supabaseUser.id;

      // ② unit_stats（= correct, wrong, total）
      const { data: statRows, error: statError } = await supabase
        .from("unit_stats")
        .select("unit, correct, wrong, total")
        .eq("user_id", user_id);

      if (statError) {
        console.error("Supabase stats 読み込みエラー:", statError);
      } else {
        const stats = {};
        statRows?.forEach((row) => {
          stats[row.unit] = {
            wrong: row.wrong ?? 0,
            total: row.total ?? 0,
          };
        });

        setUnitStats(stats); // ← バッジ反映！
      }
    };

    loadFromSupabase();
  }, [supabaseUser]);

  // ★ unitModes を Supabase（user_unit_settings）から復元
  useEffect(() => {
    if (!supabaseUser) return;

    const loadUnitModes = async () => {
      const { data, error } = await supabase
        .from("user_unit_settings") // ★ unit_stats ではなくこちら
        .select("unit, mode")
        .eq("user_id", supabaseUser.id);

      if (error) {
        console.error("Unit modes load error:", error);
        return;
      }

      const modes = {};

      data?.forEach((row) => {
        modes[row.unit] = row.mode ?? 0;
      });

      // ★ 単語テストが未登録なら OFF で補完
      wordTestUnits.forEach((unit) => {
        if (!(unit in modes)) {
          modes[unit] = 0;
        }
      });

      setUnitModes(modes);
      console.log("Unit modes Loaded (grammar + word):", modes);
    };

    loadUnitModes();
  }, [supabaseUser]);

  // 🧭 問題画面が表示された瞬間にトップへスクロール
  useEffect(() => {
    if (showQuestions && !showResult) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [showQuestions, showResult]);

  useEffect(() => {
    localStorage.setItem("useHandwriting", JSON.stringify(useHandwriting));
  }, [useHandwriting]);

  // 🎯 出題形式を localStorage に保存
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedFormats", JSON.stringify(selectedFormats));
    }
  }, [selectedFormats]);

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
        // ① まずは通常の問題
        let merged = data;

        // ② originalWords がある場合は統合
        if (originalWords.length > 0) {
          const originalQuestions = generateOriginalQuestions();

          merged = [
            ...merged.filter((q) => !q.id?.startsWith("custom-")), // 重複対策
            ...originalQuestions,
          ];
        }

        // ③ 合体後に setQuestions
        setQuestions(merged);

        // ④ 合体後のデータから単元一覧を作る
        const uniqueUnits = [...new Set(merged.map((q) => q.unit))];
        setUnits(uniqueUnits);
      });
  }, [originalWords]);
  // 🔥 originalWords が変わったら再読み込みされるように依存に追加

  // 🔰 二重実行防止フラグ
  const unitStatsLoadedRef = useRef(false);

  useEffect(() => {
    if (!supabaseUser || units.length === 0) return;

    // 🔒 すでにロード済みなら 2 回目を完全スキップ！
    if (unitStatsLoadedRef.current) {
      console.log("⏭ unitStats の 2 回目読み込みをスキップ");
      return;
    }
    unitStatsLoadedRef.current = true;

    const fetchStats = async () => {
      const { data, error } = await supabase
        .from("unit_stats")
        .select("unit, correct, wrong, total, streak")
        .eq("user_id", supabaseUser.id);

      if (error) {
        console.error("Supabase stats 読み込みエラー:", error);
        return;
      }

      const stats = {};
      units.forEach((u) => {
        stats[u] = { correct: 0, wrong: 0, total: 0, streak: 0 };
      });

      data.forEach((row) => {
        stats[row.unit] = {
          correct: row.correct ?? 0,
          wrong: row.wrong ?? 0,
          total: row.total ?? row.correct + row.wrong,
          streak: row.streak ?? 0,
        };
      });

      setUnitStats(stats);
      console.log("🔵 unitStats を Supabase から復元:", stats);
    };

    fetchStats();
  }, [supabaseUser, units]);

  useEffect(() => {
    // ✅ 出題が開始され、最初のリスニング問題になった瞬間だけ再生
    if (
      showQuestions &&
      !showResult && // ← 🚀 出題開始フラグ（あなたのコード内の変数に合わせてください）
      currentQuestion &&
      currentQuestion.format === "リスニング" //&&
      //currentIndex === 0 // 最初の問題だけ
    ) {
      //console.log("🎧 自動再生開始:", currentQuestion.unit);
      speakConversation(currentQuestion.audioText);
    }
  }, [
    showQuestions,
    showResult,
    currentQuestion,
    currentIndex,
    questionPlayCount,
  ]);

  const renderInputSection = () => (
    <div className="flex flex-col gap-2 mt-2 items-center">
      {/* === 通常の問題用 手書きパッド === */}
      {useHandwriting ? (
        <HandwritingPad
          compact={false} // ← これで通常パッドとして動く！
          ocrEngine="vision"
          lowSpecMode={lowSpecMode}
          /* ★ 認識文字を通常入力欄へ追加 */
          onCharRecognized={(char) => {
            setInputAnswer((prev) => prev + char);
          }}
          /* ★ 通常モードでは onUpload を使わない */
          onUpload={null}
          onClearAll={() => setInputAnswer("")}
          onSpace={() => setInputAnswer((prev) => prev + " ")}
          /* ★ 採点機能に必要 */
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
            className="border px-3 py-1 rounded w-full"
          />
        </>
      )}
    </div>
  );

  // 🎧 SSML対応のテキスト整形関数
  const cleanTextForSpeech = (input, lang) => {
    let text = input;

    // 共通の記号除去
    text = text.replace(/[“”"(){}[\]<>]/g, "");
    text = text.replace(/[–—]/g, "-");

    if (lang.startsWith("ja")) {
      // ✅ 日本語側：英単語をできるだけ残さない
      text = text.replace(/[A-Za-z'"!]/g, " ");
      text = text.replace(/[\/／：:]/g, "、");
    } else {
      // ✅ 英語側：' は残す、他の記号は削る
      text = text.replace(/[\/：:]/g, " ");
    }

    text = text.replace(/\s{2,}/g, " ").trim();

    // ✅ SSML化
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return `<speak>${text}</speak>`;
  };

  // 🔊 単語だけを発音する関数（Google TTS）
  const playSoundFor = (word) => {
    if (!word) return;

    try {
      const utter = new SpeechSynthesisUtterance(word);
      utter.lang = "en-US";
      utter.rate = 0.9; // 少しゆっくりで聞きやすい
      utter.pitch = 1.0;

      window.speechSynthesis.cancel(); // 前の発音を止める
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error("発音エラー:", e);
    }
  };

  // 🎙️ 日本語＋英語ミックスTTS（自然発音＋不要記号除去・安定再生）
  const speakExplanation = async (text) => {
    if (!text || typeof text !== "string" || text.trim() === "") return;

    // 🧹 読み上げに不要な記号を除去・置換（日本語／英語共通前処理）
    const sanitizeForTTS = (input) => {
      return input
        .replace(/[\/：:]/g, " ") // スラッシュ・コロン → 空白
        .replace(/[（）\(\)\[\]]/g, "、") // カッコ → 「、」
        .replace(/[’"“”]/g, "") // 引用符削除
        .replace(/[,.!?／]/g, " ") // ← 🆕 カンマ・ピリオド・疑問符・スラッシュ除去
        .replace(/\s+/g, " ") // 連続空白まとめ
        .trim();
    };

    // 言語セグメント分割
    const segments =
      text.match(/([A-Za-z][A-Za-z'’\-\s]*[A-Za-z]|[^A-Za-z]+)/g) || [];

    let buffer = "";
    let bufferIsEnglish = null;

    for (const seg of segments) {
      const isEnglish = /[A-Za-z]/.test(seg);

      if (bufferIsEnglish === null) {
        buffer = seg;
        bufferIsEnglish = isEnglish;
        continue;
      }

      if (bufferIsEnglish === isEnglish) {
        buffer += seg;
      } else {
        await playAndWait(sanitizeForTTS(buffer.trim()), bufferIsEnglish);
        buffer = seg;
        bufferIsEnglish = isEnglish;
      }
    }

    if (buffer)
      await playAndWait(sanitizeForTTS(buffer.trim()), bufferIsEnglish);
  };

  // 🎧 再生補助関数：生成→再生完了まで完全同期
  const playAndWait = async (text, isEnglish) => {
    if (!text) return;
    const lang = isEnglish ? "en-US" : "ja-JP";
    const voiceName = isEnglish ? "en-US-Neural2-F" : "ja-JP-Neural2-B";
    const speakingRate = isEnglish ? 0.9 : 1.05;
    const pitch = isEnglish ? 4.0 : 0.0;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        lang,
        voiceName,
        speakingRate,
        pitch,
      }),
    });

    if (!res.ok) throw new Error("TTS API error");
    const data = await res.json();
    const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
      /\s+/g,
      ""
    )}`;

    stopAllAudio(); // 🎯 再生直前でのみ停止を呼ぶ
    const audio = new Audio(audioSrc);
    audio.volume = masterVol / 100;
    currentAudioRef.current = audio;

    await new Promise((resolve) => {
      audio.onended = resolve;
      audio.play().catch(resolve);
    });
  };

  // 🔊 各言語ブロックをTTSで自然再生
  const playSegmentMixed = async (text, isEnglish) => {
    const clean = text.trim();
    if (!clean) return;

    // 言語別音声設定
    const lang = isEnglish ? "en-US" : "ja-JP";
    const voiceName = isEnglish ? "en-US-Neural2-F" : "ja-JP-Neural2-B";
    const speakingRate = isEnglish ? 0.92 : 1.05;
    const pitch = isEnglish ? 3.5 : 0.0;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          lang,
          voiceName,
          speakingRate,
          pitch,
        }),
      });

      if (!res.ok) throw new Error("TTS API error");

      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      audio.volume = masterVol / 100;
      currentAudioRef.current.push(audio);

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.play().catch(resolve);
      });
    } catch (err) {
      console.error("🎧 ミックスTTS再生エラー:", err);
    }

    // 🔹 セグメント間の間隔を短くして滑らかに
    await new Promise((r) => setTimeout(r, isEnglish ? 50 : 100));
  };

  const roleVoiceMap = {
    adult_male: "en-US-Neural2-D", // 標準的な落ち着いた男性声（先生・父親向け）
    adult_female: "en-US-Neural2-E", // 標準的な女性声（母親・先生・ナレーター女性）

    boy1: "en-US-Neural2-J", // 少し高めで若々しい男子生徒
    boy2: "en-US-Neural2-H", // 明るめ・元気系の男子生徒（boy1より軽やか）

    girl1: "en-US-Neural2-F", // 明るい中音の女子生徒
    girl2: "en-US-Neural2-C", // 落ち着いたトーンの女子生徒

    narrator: "en-US-Neural2-I", // ゆったりナレーター声（柔らかめ）
  };

  const getVoiceConfigForLine = (line) => {
    let role = line.role || "girl1";

    if (!line.role && line.speaker) {
      if (line.speaker === "A") role = "girl1";
      else if (line.speaker === "B") role = "boy1";
      else if (line.speaker === "C") role = "adult_female";
    }

    const voiceName = roleVoiceMap[role] || "en-US-Neural2-F";
    const isFemale = ["adult_female", "girl1", "girl2", "narrator"].includes(
      role
    );
    const isChild = ["boy1", "boy2", "girl1", "girl2"].includes(role);

    let pitch = 0.0;
    if (isChild && !isFemale) pitch = 3.0; // 少年 → 少し高め
    else if (role === "boy2") pitch = -2.0; // 少年２ → 低め
    else if (isFemale) pitch = 4.0;

    const speakingRate = isChild ? 1.05 : 0.95;

    return { voiceName, speakingRate, pitch };
  };

  const speakConversation = async (audioText) => {
    stopAllAudio();
    if (!Array.isArray(audioText)) return;

    stopAllAudio();

    const buffers = [];

    // 🎧 新しい問題開始時にキャッシュをクリア
    if (window.cachedListeningAudio) {
      //console.log("🧹 古いキャッシュをクリア");
      window.cachedListeningAudio = [];
    }

    // === normalize 関数（安全版）===
    const normalize = (str = "") =>
      String(str)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();

    try {
      for (const line of audioText) {
        const { voiceName, speakingRate, pitch } = getVoiceConfigForLine(line);

        // ✅ スピーカーラベル（A:, B:, C:）を削除してクリーンなテキストに
        const lineClean = line.text.replace(/^[A-Z][0-9]?:\s*./, "").trim();

        //console.log("🎤 send:", { text: lineClean, voiceName });

        const body = {
          text: lineClean,
          lang: "en-US",
          voiceName,
          speakingRate,
          pitch,
        };

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("TTS API error");

        const data = await res.json();
        const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
          /\s+/g,
          ""
        )}`;
        const audio = new Audio(audioSrc);
        audio.volume = masterVol / 100;

        buffers.push(audio);

        // 🧠 キャッシュ保存（前方一致検索用に正規化テキストも保存）
        if (!window.cachedListeningAudio) window.cachedListeningAudio = [];
        window.cachedListeningAudio.push({
          text: normalize(lineClean),
          src: audioSrc,
        });
      }

      //console.log("🎧 キャッシュ総数:", buffers.length);

      // 2️⃣ 少し待ってから連続再生（BGMや効果音と被らないように）
      setTimeout(async () => {
        for (const audio of buffers) {
          await new Promise((resolve) => {
            audio.onended = resolve;
            audio.play().catch(resolve);
          });
          await new Promise((r) => setTimeout(r, 100)); // 次の文まで0.1秒間隔
        }
        //console.log("✅ 会話再生完了");
      }, 1500);
    } catch (err) {
      console.error("🟥 TTS再生エラー:", err);
    }
  };

  // 🎧 英語専用の高品質TTS（明るくゆっくりした女性声）
  const speakEnglishAnswer = async (text) => {
    // ---- 安全チェック ----
    if (!text) return;

    // 配列やオブジェクトなら最初の要素やプロパティを取り出す
    if (Array.isArray(text)) text = text[0];
    if (typeof text === "object") text = text.text ?? "";

    // 最後に必ず文字列化しておく
    text = String(text);

    if (text.trim() === "") return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          lang: "en-US",
          voiceName: "en-US-Neural2-F", // 💡明るい女性の声
          speakingRate: 0.9, // ゆっくりめで聞き取りやすく
          pitch: 6.0, // 高めトーン
        }),
      });

      if (!res.ok) throw new Error("TTS API error");
      const data = await res.json();

      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      audio.volume = masterVol / 100;
      await audio.play();
      //console.log("[Audio] English pronunciation played:", text);
    } catch (err) {
      console.error("英語TTS再生エラー:", err);
    }
  };

  const preloadConversationAudio = async (audioText) => {
    const buffers = [];
    for (const line of audioText) {
      const voiceName =
        line.speaker === "A" ? "en-US-Neural2-F" : "en-US-Neural2-D";

      const body = {
        text: line.text,
        lang: "en-US",
        voiceName,
        speakingRate: 0.95,
        pitch: line.speaker === "A" ? 6.0 : 0.0,
      };

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("TTS API error");
      const data = await res.json();
      const audioSrc = `data:audio/mp3;base64,${data.audioContent.replace(
        /\s+/g,
        ""
      )}`;
      const audio = new Audio(audioSrc);
      audio.volume = masterVol / 100;
      buffers.push(audio);
    }
    return buffers;
  };

  const playConversationAudio = async (buffers) => {
    for (const audio of buffers) {
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.play().catch(resolve);
      });
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  // 🎧 リスニング用ミックス再生関数（改良版：配列対応＋重複停止＋安定制御）
  const playExplanation = async (textToRead) => {
    if (!textToRead || textToRead.trim() === "") return;

    // 🛑 すべての音声を停止（配列対応）
    if (Array.isArray(currentAudioRef.current)) {
      currentAudioRef.current.forEach((audio) => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (e) {}
      });
      currentAudioRef.current = [];
    } else if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause?.();
        currentAudioRef.current.currentTime = 0;
      } catch (e) {}
      currentAudioRef.current = [];
    }

    setIsSpeaking(true);
    let cancelled = false;

    // 🧩 外部から停止可能にする
    window.stopExplanationPlayback = () => {
      cancelled = true;
      if (Array.isArray(currentAudioRef.current)) {
        currentAudioRef.current.forEach((a) => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch (e) {}
        });
      }
      currentAudioRef.current = [];
      setIsSpeaking(false);
    };

    try {
      if (
        currentQuestion.format === "リスニング" &&
        window.cachedListeningAudio?.length
      ) {
        //console.log("🎧 ミックス再生開始（スクリプト＋日本語TTS）");

        const scriptMatch = textToRead.match(/スクリプト：(.+?)(（.+）|$)/);
        const scriptText = scriptMatch ? scriptMatch[1].trim() : "";
        const jpPart = scriptMatch && scriptMatch[2] ? scriptMatch[2] : "";
        const restPart = textToRead.replace(scriptMatch?.[0] || "", "");

        // === 1️⃣ 英文スクリプト（キャッシュ再生） ===
        if (scriptText && !cancelled) {
          const lines = scriptText
            .split(/(?=[A-Z]:)/)
            .map((l) => l.trim())
            .filter(Boolean);

          for (const line of lines) {
            if (cancelled) break;

            const lineClean = line.replace(/^[A-Z][0-9]?:\s*/, "").trim();

            const normalize = (str) =>
              str
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
                .trim();

            const lineNorm = normalize(lineClean);
            const cached = window.cachedListeningAudio.find((a) =>
              normalize(a.text).includes(lineNorm.slice(0, 8))
            );

            if (cached) {
              //console.log("🎧 キャッシュ再生:", cached.text);
              const audio = new Audio(cached.src);
              audio.volume = masterVol / 100;

              // 🧹 前の音声を止める
              if (Array.isArray(currentAudioRef.current)) {
                currentAudioRef.current.forEach((a) => {
                  try {
                    a.pause();
                    a.currentTime = 0;
                  } catch (e) {}
                });
              }
              currentAudioRef.current = [audio];

              await new Promise((resolve) => {
                audio.onended = resolve;
                audio.play().catch(resolve);
              });
            } else {
              console.warn("⚠️ キャッシュ未検出 → 英文TTS:", lineClean);
              await speakExplanation(lineClean);
            }

            await new Promise((r) => setTimeout(r, 120));
          }
        }

        // === 2️⃣ 日本語訳＋解説部分 ===
        if (!cancelled) {
          const jpFull = `${jpPart} ${restPart}`.trim();
          if (jpFull) await speakExplanation(jpFull);
        }
      } else {
        // 通常問題
        await speakExplanation(textToRead);
      }
    } catch (err) {
      console.error("音声再生エラー:", err);
    } finally {
      setIsSpeaking(false);
      //console.log("✅ ミックス再生完了");
    }
  };

  const handleWordClick = async (word) => {
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

      const meaning = normJa(data.translation);

      setWordMeaning(meaning);

      // ✅ ここから変更：単語帳はSupabaseに一本化！
      await saveOriginalWordToSupabase(cleanWord, meaning);
    } catch (err) {
      console.error(err);
      setWordMeaning("意味を取得できませんでした");
    }
  };

  const selectAllUnits = async () => {
    const updatedModes = {};

    // すべての unit を ON（文法＋単語テスト含む）
    questions.forEach((q) => {
      updatedModes[q.unit] = 1;
    });

    setUnitModes(updatedModes);

    // Supabase に一括保存
    await updateAllUnitSettings(updatedModes);
  };

  const clearAllUnits = async () => {
    const clearedModes = {};

    questions.forEach((q) => {
      clearedModes[q.unit] = 0;
    });

    setUnitModes(clearedModes);

    await updateAllUnitSettings(clearedModes);
  };

  const wordTestUnits = Array.from(
    new Set(
      questions.map((q) => q.unit).filter((unit) => unit.includes("単語テスト"))
    )
  );

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

  // ===============================
  // 📘 単語テスト専用スタート関数
  // ===============================
  const startWordQuiz = () => {
    // ① 単語テスト単元が1つもONになっていない
    const activeWordUnits = questions.filter(
      (q) => q.unit.includes("単語テスト") && unitModes[q.unit] === 1
    );

    if (activeWordUnits.length === 0) {
      alert("単語テストの単元を1つ以上選んでください。");
      return;
    }

    // ② 出題形式が未選択
    if (!selectedFormats || selectedFormats.length === 0) {
      alert(
        "出題形式を1つ以上選んでください。（単語テストなら「単語・熟語」を選んでください）"
      );
      return;
    }

    // ③ 単語テスト ＆ 出題形式 でフィルタ
    const wordQuestions = questions.filter((q) => {
      const isWordUnit =
        q.unit.includes("単語テスト") && unitModes[q.unit] === 1;

      const inFormat = selectedFormats.includes(q.format || "単語・熟語");

      return isWordUnit && inFormat;
    });

    if (wordQuestions.length === 0) {
      alert("選択した単語単元と出題形式に合う問題がありません。");
      return;
    }

    // ④ シャッフル＆出題数制御
    const shuffled = shuffleArray(wordQuestions);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);

    if (limited.length === 0) {
      alert("出題できる問題がありません。");
      return;
    }

    // ⑤ 出題開始セット
    setInitialQuestionCount(limited.length);
    setCharacterMood("neutral");
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
    setIsReviewMode(false);
    setReviewList([]);
    setReviewMistakes([]);
    setAddMessage("");
    setHintLevels({});
    setHintText("");
    setHintLevel(0);
  };

  // ✅ クイズ開始処理（複数形式×複数単元対応）
  // 📌 修正版 startQuiz（My単語テスト時は絞り込みをスキップ）
  const startQuiz = (options = {}) => {
    const {
      skipFiltering = false, // ★ 単語GO・My単語GO 用
      directQuestions = null, // ★ 直接問題リストを渡す
    } = options;

    // ================================
    // ★ ① skipFiltering（単語GO / My単語GO）
    // ================================
    if (skipFiltering) {
      const qs = directQuestions;

      if (!qs || qs.length === 0) {
        alert("出題できる問題がありません。");
        return;
      }

      const limited = questionCount === "all" ? qs : qs.slice(0, questionCount);

      setInitialQuestionCount(limited.length);
      setCharacterMood("neutral");
      setFilteredQuestions(limited);
      setInitialQuestions(limited);
      setCurrentIndex(0);
      setShowQuestions(true);
      setShowResult(false);
      setShowFeedback(false);
      setSelectedChoice(null);
      setMistakes({});
      setIsReviewMode(false);
      setReviewList([]);
      setReviewMistakes([]);
      setAddMessage("");
      setHintLevels({});
      setHintText("");
      setHintLevel(0);

      return; // ⭐完全に終了（通常ルートに入らない！）
    }

    // ================================
    // ★② 通常（文法＋単語混合）スタート
    // ================================

    // 単語単元も文法単元も unitModes が 1〜3 なら混合可能
    const activeUnits = Object.keys(unitModes).filter(
      (u) => unitModes[u] !== 0
    );

    if (activeUnits.length === 0) {
      alert("単元を1つ以上選んでください。");
      return;
    }

    if (typeof stopBgm === "function") stopBgm(true);
    globalUnitBgmPlaying = false;
    setUnitBgmPlaying(false);
    lastBgmType = null;

    const filtered = questions.filter((q) => {
      const unitSelected = activeUnits.includes(q.unit);
      const formatSelected = selectedFormats.includes(q.format || "単語・熟語");

      if (!unitSelected || !formatSelected) return false;

      const mode = unitModes[q.unit] || 0;
      if (mode === 1) return true;
      if (mode === 2) return q.type === "multiple-choice";
      if (mode === 3) return q.type === "input";

      return false;
    });

    if (filtered.length === 0) {
      alert("選択した単元に合う問題がありません。");
      return;
    }

    const shuffled = shuffleArray(filtered);
    const limited =
      questionCount === "all" ? shuffled : shuffled.slice(0, questionCount);

    setInitialQuestionCount(limited.length);
    setCharacterMood("neutral");
    setFilteredQuestions(limited);
    setInitialQuestions(limited);
    setCurrentIndex(0);
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
    setIsReviewMode(false);
    setReviewList([]);
    setReviewMistakes([]);
    setAddMessage("");
    setHintLevels({});
    setHintText("");
    setHintLevel(0);
  };

  // 切り替えは音量制御のみ
  useEffect(() => {
    if (!showQuestions && !showResult) {
      // 単元選択画面
      if (soundEnabled) {
        (async () => {
          try {
            if (audioCtx?.state === "suspended") {
              await audioCtx.resume();
              //console.log("[Audio] resumed in unit select");
            }
            if (bgmGain) {
              bgmGain.gain.value = 0.2;
            }
          } catch (e) {
            console.warn("[Audio] resume failed in unit select", e);
          }
        })();
      }
    }
  }, [showQuestions, showResult, soundEnabled]);

  // 🪄 BGM制御（重複再生防止・iOS対応）
  const firstLoadRef = useRef(true);

  useEffect(() => {
    // 🧹 ページロード時に古い音を止める
    window.addEventListener("beforeunload", () => {
      try {
        stopQbgm(true);
        stopBgm(true);
        if (audioCtx) {
          audioCtx.close();
          //console.log("[Audio] audioCtx closed on unload");
        }
      } catch (e) {
        console.warn("[Audio] unload cleanup failed:", e);
      }
    });
  }, []);

  useEffect(() => {
    const applyBGM = async () => {
      //console.log(
      // `[AudioDebug] applyBGM() triggered: ${Date.now()} state=${lastBgmType}`
      //);

      initAudio();

      // 🧹 iOS再ロード時・Fast Refresh対策
      if (
        audioCtx &&
        audioCtx.state === "running" &&
        showQuestions &&
        bgmSource
      ) {
        //console.log("[Audio] cleanup residual BGM before question start");
        resetAudioState();
      }

      // === 🔇 サウンドOFF時 ===
      if (!soundEnabled) {
        //stopQbgm(true);
        //stopBgm(true);

        if (audioCtx && audioCtx.state === "running") {
          try {
            await audioCtx.suspend();
            //console.log("[Audio] audioCtx suspended (sound OFF)");
          } catch (e) {
            console.warn("[Audio] suspend failed:", e);
          }
        }
        stopQbgm(true);
        stopBgm(true);
        //bgmGain.gain.value = 0;
        //qbgmGain.gain.value = 0;
        globalUnitBgmPlaying = false;
        setUnitBgmPlaying(false);
        lastBgmType = null;
        return;
      }

      await ensureAudioResume();

      // === 🎯 問題画面 ===
      if (showQuestions) {
        // まず旧BGM（単元選択用）を確実に停止
        if (bgmSource) {
          stopBgm(true);
          bgmSource = null;
          globalUnitBgmPlaying = false;
          setUnitBgmPlaying(false);
          //console.log("[Audio] stopped bgm before question start");
        }

        // すでに qbgm が再生中なら skip
        if (qbgmSource && lastBgmType === "question") return;

        stopQbgm(true);
        await ensureLoop("/sounds/qbgm.mp3", qbgmGain, "qbgm", true);
        fadeInBGM(qbgmGain, 0.2, 2.0);
        lastBgmType = "question";
        //console.log("[Audio] qbgm started for question");
        return;
      }

      // === 🏁 結果画面 ===
      if (showResult) {
        fadeInBGM(qbgmGain, 0, 1.0);
        setTimeout(() => stopQbgm(true), 1200);
        lastBgmType = "result";
        //console.log("[Audio] result → stop qbgm");
        return;
      }

      // === 🏫 単元選択画面 ===
      if (!showQuestions && !showResult) {
        // 🚫 BGMがすでに存在または再生中なら完全スキップ
        // 🚫 二重起動防止ロック
        if (
          bgmInitLock ||
          bgmSource ||
          globalUnitBgmPlaying ||
          lastBgmType === "unit"
        ) {
          //console.log("[Audio] bgm already active or locked → skip start");
        } else {
          bgmInitLock = true;
          try {
            stopQbgm(true); // 念のため他BGM停止

            await ensureLoop("/sounds/bgm.mp3", bgmGain, "bgm");
            fadeInBGM(bgmGain, 0.2, 2.0);

            globalUnitBgmPlaying = true;
            setUnitBgmPlaying(true);
            lastBgmType = "unit";

            //console.log("[Audio] bgm started (unit select)");
          } catch (e) {
            console.warn("[Audio] bgm start failed:", e);
          } finally {
            // 🕒 500ms後にロック解除（再レンダー安全対策）
            setTimeout(() => {
              bgmInitLock = false;
            }, 500);
          }
        }

        // 🔊 初回ロードで「選択してください」再生（重複防止済み）
        if (firstLoadRef.current) {
          firstLoadRef.current = false;
          playSFX("/sounds/sentaku.mp3");
        }

        return;
      }
    };

    applyBGM();

    // ✅ クリーンアップ（不要な音残留防止）
    return () => {
      if (showQuestions || showResult) return;
      resetAudioState();
      stopQbgm(true);
      stopBgm(true);
      bgmSource = null;
      qbgmSource = null;
      globalUnitBgmPlaying = false;
      setUnitBgmPlaying(false);
      lastBgmType = null;
      //console.log("[Audio] cleanup complete");
    };
  }, [soundEnabled, showQuestions, showResult]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().then(() => {
          //console.log("[Audio] resumed on first gesture");
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
        //console.log(`[LOAD] ${userName} の unitStats を復元しました`);
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
      limit = 60; // 記述問題
    } else if (
      currentQuestion.type === "listening-choice" ||
      currentQuestion.type === "multiple-choice"
    ) {
      if (
        currentQuestion.type === "listening-choice" ||
        (currentQuestion.unit && currentQuestion.unit.includes("読解"))
      ) {
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

  // ✅ 解説の自動読み上げ（リスニング対応＋英日ミックス＋正誤制御＋BGMダッキング＋停止保護）
  useEffect(() => {
    // 🚫 前提条件
    if (!showFeedback || !currentQuestion) return;

    // 🎯 不正解時のみ自動再生
    if (isCorrect) return;

    // 再生前にすべての音声を停止
    stopAllAudio();

    // 🎵 BGM音量をフェードで調整する共通関数
    const fadeBGMVolume = async (targetVolume, duration = 500) => {
      if (!bgmGainRef.current) return;
      const gainNode = bgmGainRef.current.gain;
      const startVol = gainNode.value;
      const steps = 20;
      const stepTime = duration / steps;
      const delta = (targetVolume - startVol) / steps;

      for (let i = 0; i <= steps; i++) {
        gainNode.value = startVol + delta * i;
        await new Promise((r) => setTimeout(r, stepTime));
      }
    };

    // 🎧 音声中にBGMを下げ、終了後に戻す高階関数
    const withBGMDucking = async (fn) => {
      const gainNode = bgmGainRef.current?.gain;
      if (!gainNode) {
        await fn();
        return;
      }

      const originalVol = gainNode.value;
      try {
        // 🔉 BGMを30%にフェードダウン
        await fadeBGMVolume(originalVol * 0.3, 600);
        await fn(); // 音声再生
      } finally {
        // 🔊 元の音量へフェードアップ
        await fadeBGMVolume(originalVol, 800);
      }
    };

    // 再生対象テキストを抽出
    const textToRead =
      currentQuestion.incorrectExplanations?.[selectedChoice] ??
      `正解は「${currentQuestion.correct}」。${
        currentQuestion.explanation || ""
      }`;

    if (!textToRead || textToRead.trim() === "") return;

    // 🎧 再生をBGMダッキング付きで実行
    (async () => {
      try {
        await withBGMDucking(async () => {
          if (currentQuestion.format === "リスニング") {
            //console.log("🎧 [AUTO] リスニング解説再生");
            await playExplanation(textToRead);
          } else {
            //console.log("🎧 [AUTO] 通常解説TTS再生");
            await speakExplanation(textToRead);
          }
        });
      } catch (e) {
        console.warn("⚠️ 自動解説再生中にエラー:", e);
      }
    })();
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
      //console.log("⏰ 時間切れ → 自動で不正解扱い");
      handleAnswer("(時間切れ)"); // ← 不正解扱い

      // 表示関連
      setShowFeedback(true);
      setIsCorrect(false);
      setShowAnswer(true);
      setSelectedChoice("（時間切れ）");
      setTimeUp(false);

      // 🟥 ここから追加
      // ★ 時間切れ問題を復習リストへ追加
      setReviewList((prev) => {
        if (prev.find((q) => q.id === currentQuestion.id)) return prev;
        return [...prev, currentQuestion];
      });
      // 🟥 追加ここまで

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

  // ✅ BGMを安全に停止する関数（多重再生防止）
  function stopBgm(immediate = false) {
    try {
      if (bgmSource) {
        const now = audioCtx.currentTime;
        if (immediate) {
          bgmSource.stop(0);
          //console.log("[Audio] bgm stopped immediately");
        } else {
          // 🎚 フェードアウト → 完全停止
          const gain = bgmGain?.gain;
          if (gain) {
            gain.cancelScheduledValues(now);
            gain.setValueAtTime(gain.value, now);
            gain.linearRampToValueAtTime(0, now + 1.0);
          }
          setTimeout(() => {
            try {
              bgmSource.stop(0);
              //console.log("[Audio] bgm stopped after fade");
            } catch (e) {
              console.warn("[Audio] bgm stop failed:", e);
            }
          }, 1000);
        }

        // ✅ 完全破棄
        bgmSource.disconnect();
        bgmSource = null;
        globalUnitBgmPlaying = false;
        lastBgmType = null;
      } else {
        //console.log("[Audio] no bgmSource to stop");
      }
    } catch (e) {
      console.warn("[Audio] stopBgm() error:", e);
    }
  }

  // 🎯 問題切り替え時に毎回選択肢をシャッフル
  useEffect(() => {
    if (filteredQuestions.length === 0) return;

    const question = filteredQuestions[currentIndex];
    if (!question?.choices) return;

    // ✅ 問題ID＋インデックスが変わるたびに強制シャッフル
    const randomized = shuffleArray(question.choices);
    setShuffledChoices(randomized);
  }, [filteredQuestions, currentIndex]);

  useEffect(() => {
    //console.log("unitStats 更新:", unitStats);
  }, [unitStats]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("unitStats", JSON.stringify(unitStats));
    }
  }, [unitStats]);

  useEffect(() => {
    //console.log("=== 単元ごとのwrongカウント ===", unitStats);
    units.forEach((u) => {
      //console.log("ボタン描画対象:", u, "→", unitStats[u]?.wrong);
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

  const shouldBlinkRemember =
    !showFeedback && !timeUp && timeLeft <= Math.floor(maxTime * (2 / 3));

  const handleAnswer = async (answer) => {
    const currentQuestion = filteredQuestions[currentIndex];
    let isCorrectAnswer = false;

    if (
      currentQuestion.type === "multiple-choice" ||
      currentQuestion.type === "listening-choice"
    ) {
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
        //console.log("📘 復習または覚え直し中の正解 → 不正解としてカウント");
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

        // ✨★追加★✨ 不正解問題を復習リストへ追加
        setReviewList((prev) => {
          if (prev.find((q) => q.id === currentQuestion.id)) return prev;
          return [...prev, currentQuestion];
        });

        // 既存の不正解処理
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

    // ====== ⭐ Supabase 保存のために必要な値を準備 ======
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isTimeout = timeLeft <= 0; // ★時間切れ判定（あなたのアプリ準拠）
    const answerTime = maxTime - timeLeft; // ★経過時間（例：30秒 - 残り時間）
    const didReview = reviewing || isReviewMode;
    const isSuspicious = answerTime < 800; // ★AA判定（あなたの基準に合わせて調整可）

    // ====== ⭐ Supabase に学習ログを保存 ======
    await saveStudyLog({
      user_id: user.id,
      unit: currentQuestion.unit,
      question_id: currentQuestion.id,
      is_correct: isCorrectAnswer,
      is_timeout: isTimeout,
      answer_time: answerTime,
      did_review: didReview,
      is_suspicious: isSuspicious,
    });
  };

  const handleNext = async () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setCharacterMood("neutral");

    if (isCorrect) {
      if (currentIndex + 1 < filteredQuestions.length) {
        // 次の問題へ
        setCurrentIndex(currentIndex + 1);
      } else {
        // -------------------------------
        // ★ 集計開始 → ローディング表示
        // -------------------------------
        setLoadingResult(true);

        // ★ 保存処理は裏で並列実行（UX向上）
        saveStatsToSupabase(); // await を付けない！

        // -------------------------------
        // ほんの少しだけ待ってから画面遷移
        // -------------------------------
        setTimeout(() => {
          // 復習がある場合
          if (reviewList.length > 0) {
            reviewQueueRef.current = [...reviewList];
            setShowReviewPrompt(true);
            setLoadingResult(false);
            return;
          }

          // 結果画面へ
          setShowQuestions(false);
          setShowResult(true);
          setTimerActive(false);
          setTimeLeft(0);
          setIsReviewMode(false);

          // ローディング解除
          setLoadingResult(false);
        }, 300); // ← 0.3秒で十分にスムーズ
      }

      setShowFeedback(false);
    } else {
      // 不正解
      if (soundEnabled) playSFX("/sounds/ganba.mp3");
      setShowFeedback(false);
      setQuestionPlayCount((prev) => prev + 1);
    }

    setSelectedChoice(null);
    setTimeout(() => setInputDisabled(false), 300);
  };

  const startReview = async () => {
    // 1) iOS許可をユーザー操作中に取得
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn("[Audio] resume failed in startReview", e);
      }
    }

    // ▼▼▼ 2) サウンドOFFなら、BGMは一切再生しない ▼▼▼
    if (!soundEnabled) {
      // すべてのBGMを停止
      try {
        if (typeof stopBgm === "function") stopBgm(true);
        if (typeof stopQbgm === "function") stopQbgm(true);
      } catch (e) {
        console.warn("[Audio] stopQbgm failed", e);
      }

      // 復習状態だけセットして終了
      const reviewCopy = reviewQueueRef.current || [];
      setFilteredQuestions(reviewCopy);
      setCurrentIndex(0);
      setShowFeedback(false);
      setTimerActive(false);
      setShowResult(false);
      setReviewList([]);
      setIsReviewMode(true);
      setShowReviewPrompt(false);
      return; // ← BGM再生は完全スキップ
    }
    // ▲▲▲ BGMなしモードはここでリターン ▲▲▲

    // ▼▼▼ 3) サウンドON時のみBGM切替 ▼▼▼
    try {
      if (typeof stopBgm === "function") stopBgm(true);
      if (typeof stopQbgm === "function") stopQbgm(true);
    } catch (e) {
      console.warn("[Audio] stopQbgm failed", e);
    }

    try {
      await ensureLoop("/sounds/review.mp3", qbgmGain, "qbgm", true);
      fadeInBGM(qbgmGain, 0.2, 2.0);
    } catch (e) {
      console.warn("[Audio] review BGM start failed", e);
    }

    // ▼▼▼ 4) 復習の出題状態セット ▼▼▼
    const reviewCopy = reviewQueueRef.current || [];
    setFilteredQuestions(reviewCopy);
    setCurrentIndex(0);
    setShowFeedback(false);
    setTimerActive(false);
    setShowResult(false);
    setReviewList([]);
    setIsReviewMode(true);
    setShowReviewPrompt(false);

    // ▼▼▼ 5) 出題SE（ONのときだけ） ▼▼▼
    if (soundEnabled) {
      playSFX("/sounds/deden.mp3");
      setQuestionPlayCount((prev) => prev + 1);
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

  const startOriginalQuiz = (originalQs) => {
    if (originalQs.length === 0) {
      alert("My単語がありません。");
      return;
    }

    // 🎯 単元など一切見ずにそのまま出題
    const shuffled = shuffleArray(originalQs);

    setFilteredQuestions(shuffled);
    setInitialQuestions(shuffled);

    setInitialQuestionCount(shuffled.length);
    setCharacterMood("neutral");
    setCurrentIndex(0);
    setShowQuestions(true);
    setShowResult(false);
    setShowFeedback(false);
    setSelectedChoice(null);
    setMistakes({});
    setIsReviewMode(false);
    setReviewList([]);
    setReviewMistakes([]);
    setAddMessage("");
    setHintLevels({});
    setHintText("");
    setHintLevel(0);
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

  const saveOriginalWordToSupabase = async (word, meaning) => {
    if (!supabaseUser) return;

    const payload = {
      user_id: supabaseUser.id,
      word,
      meaning,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("original_words")
      .upsert(payload, { onConflict: "user_id,word" })
      .select();

    if (error) {
      console.error("My単語保存エラー:", error);
      return;
    }

    // ✅ UIも即反映（重複はUI側でもガード）
    setOriginalWords((prev) => {
      if (prev.some((x) => x.word === word)) return prev;
      return [payload, ...prev];
    });

    console.log(`✅ original_wordsへ保存: ${word}=${meaning}`);

    setToastMessage(`📘「${word}」を単語帳に追加しました！`);
    setTimeout(() => setToastMessage(""), 2000); // 2秒で自動消滅
  };

  // ⭐ 出題形式を Supabase に保存する（配列 → JSON）
  const saveSelectedFormatsToSupabase = async (updatedFormats) => {
    if (!supabaseUser) return;

    // 保存用 JSON 文字列
    const json = JSON.stringify(updatedFormats);

    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: supabaseUser.id,
        formats: json,
        updated: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("形式設定の保存エラー:", error);
    } else {
      console.log("形式設定を保存完了:", updatedFormats);
    }
  };

  // ⭐ Supabase：単元成績を保存する
  const saveStatsToSupabase = async () => {
    if (!supabaseUser) return;

    const user_id = supabaseUser.id;
    const tasks = [];

    for (const [unit, stat] of Object.entries(unitStats)) {
      const wrong = Number(stat?.wrong ?? 0);
      const total = Number(stat?.total ?? 0);
      const correct = Math.max(0, total - wrong);
      const mode = Number(unitModes[unit] ?? 0);
      const streak = Number(stat?.streak ?? 0);

      const task = supabase.from("unit_stats").upsert(
        {
          user_id,
          unit,
          mode,
          correct,
          wrong,
          total,
          streak,
        },
        { onConflict: "user_id,unit" }
      );

      tasks.push(task);
    }

    // ★ すべて同時に実行 → 超高速化
    const results = await Promise.all(tasks);

    results.forEach((res, idx) => {
      if (res.error) {
        console.error("Supabase 保存エラー:", res.error);
      } else {
        console.log("保存OK:", Object.keys(unitStats)[idx]);
      }
    });
  };

  const updateOriginalWord = async () => {
    if (!supabaseUser || !editingWord) return;

    try {
      const { error } = await supabase
        .from("original_words")
        .update({
          word: editWord,
          meaning: editMeaning,
        })
        .eq("id", editingWord.id) // ← id で更新（最重要）
        .eq("user_id", supabaseUser.id); // ← ログインユーザー以外の編集防止

      if (error) throw error;

      // 🔥 UIに即反映
      setOriginalWords((prev) =>
        prev.map((item) =>
          item.id === editingWord.id
            ? { ...item, word: editWord, meaning: editMeaning }
            : item
        )
      );

      setShowEditModal(false);

      // 🔔 トースト
      setToastMessage(`✏️ ${editWord} を更新しました！`);
      setTimeout(() => setToastMessage(""), 2000);
    } catch (err) {
      console.error("update error:", err);
      alert("更新できませんでした");
    }
  };

  const deleteOriginalWord = async (id) => {
    if (!supabaseUser) return;

    const { error } = await supabase
      .from("original_words")
      .delete()
      .eq("id", id) // ← ★ ここが最重要（id で削除）
      .eq("user_id", supabaseUser.id);

    if (error) {
      console.error("削除エラー:", error);
      alert("削除できませんでした");
      return;
    }

    // UIから即削除
    setOriginalWords((prev) => prev.filter((w) => w.id !== id));

    // トースト表示（任意）
    setToastMessage("🗑️ 単語を削除しました");
    setTimeout(() => setToastMessage(""), 1500);
  };

  const baseWhiteButton = `
  border border-white/70 
  bg-white/85 
  shadow-[0_1px_4px_rgba(0,0,0,0.1)]
  backdrop-blur-sm
`;

  const disabledStart =
    !questionCount ||
    selectedFormats.length === 0 ||
    !Object.keys(unitModes).some((u) => unitModes[u] !== 0);

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

  // 🔍 英単語 → 日本語訳を取得する関数（必ず return の上に配置すること！）
  const fetchJapaneseMeaning = async (word) => {
    try {
      const res = await fetch(
        `/api/translate?word=${encodeURIComponent(word)}`
      );

      if (!res.ok) throw new Error("Translation failed");

      const data = await res.json();

      // 日本語訳を返す
      return data.translation || "（意味を取得できませんでした）";
    } catch (e) {
      console.error("Translation error:", e);
      return "（意味を取得できませんでした）";
    }
  };

  if (!showQuestions && !showResult && units.length === 0 && !currentQuestion) {
    return <div className="p-8 text-lg">読み込み中です...</div>;
  }

  return (
    <>
      <DynamicSkyCanvasBackground lowSpecMode={lowSpecMode} />
      <div className="min-h-screen flex flex-col items-center bg-transparent relative z-10">
        {/* ✍️ 手書きパッド（最前面化） */}
        {showHandwritingFor &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              {/* ▼ 手書きパッド全体（中央少し下） */}
              <div
                className="
          pointer-events-auto
          w-full max-w-[480px]
          translate-y-[120px]    /* ← ここで下にズラす */
        "
              >
                <HandwritingPad
                  compact
                  target={showHandwritingFor}
                  ocrEngine="vision"
                  lowSpecMode={lowSpecMode}
                  currentAnswer={
                    showHandwritingFor === "word"
                      ? tempCustomWord
                      : tempCustomMeaning
                  }
                  onCharRecognized={(char) => {
                    if (showHandwritingFor === "word") {
                      setTempCustomWord((p) => (p || "") + char);
                    } else {
                      setTempCustomMeaning((p) => (p || "") + char);
                    }
                  }}
                  onUpload={async (text) => {
                    // ★ 閉じるボタンによる呼び出しの場合、完全スルー
                    if (ignoreNextUpload.current) {
                      ignoreNextUpload.current = false; // ← 一度だけ無視
                      return; // ← 意味取得を発動させない
                    }

                    if (showHandwritingFor === "word") {
                      setTempCustomWord(text || "");

                      const meaning = await fetchJapaneseMeaning(text || "");
                      setSuggestedMeaning(meaning);

                      setShowHandwritingFor("meaning");
                    } else {
                      setTempCustomMeaning(text || "");
                      setSuggestedMeaning("");
                      setShowHandwritingFor(null);
                    }
                  }}
                  onClearAll={() => {
                    if (showHandwritingFor === "word") setTempCustomWord("");
                    else setTempCustomMeaning("");
                  }}
                  onSpace={() => {
                    if (showHandwritingFor === "word")
                      setTempCustomWord((p) => (p || "") + " ");
                    else setTempCustomMeaning((p) => (p || "") + " ");
                  }}
                  onClose={() => {
                    ignoreNextUpload.current = true; // ← 次のアップロードを無視
                    setSuggestedMeaning(""); // 候補を消す
                    setShowHandwritingFor(null); // パッドを閉じる
                  }}
                />

                {/* ▼ 新しい候補UI（パッドの上に表示） */}
                {suggestedMeaning && (
                  <div className="absolute -top-20 left-1/2 -translate-x-1/2 bg-white p-3 shadow-xl rounded-lg z-[10000] w-[90%]">
                    <p className="font-bold">{suggestedMeaning}</p>

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          setTempCustomMeaning(suggestedMeaning);
                          setSuggestedMeaning("");
                          setShowHandwritingFor(null);
                        }}
                        className="px-3 py-1 bg-green-500 text-white rounded"
                      >
                        この意味で決定する
                      </button>

                      <button
                        onClick={() => setSuggestedMeaning("")}
                        className="px-3 py-1 bg-gray-300 rounded"
                      >
                        閉じる
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}

        {/* ★ ここにハンバーガーメニューを置くのが正解！ */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 bg-white/90 backdrop-blur-md rounded-lg shadow-md border"
          >
            ☰
          </button>
        </div>

        {/* ▼ ハンバーガーメニュー（右上固定） */}
        <div className="absolute top-4 right-4 z-[200]">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-3 bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-300 hover:bg-gray-100 transition"
          >
            {/* 三本線アイコン */}
            <span className="text-2xl">☰</span>
          </button>

          {/* ▼ 開いたときのメニュー */}
          {menuOpen && (
            <div className="mt-2 w-48 bg-white/95 backdrop-blur-md shadow-xl border border-gray-200 rounded-xl p-3 space-y-3">
              {/* 質問BOX */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  playButtonSound(() => setShowQuestionModal(true));
                }}
                className="w-full text-left bg-yellow-300 hover:bg-yellow-400 text-[#4A6572] px-3 py-2 rounded-lg font-semibold shadow transition"
              >
                📥 質問ボックス（{questionList.length}件）
              </button>

              {/* ユーザー変更 */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleChangeUserName();
                }}
                className="w-full text-left bg-blue-400 hover:bg-blue-500 text-white px-3 py-2 rounded-lg font-semibold shadow"
              >
                👤 現在のユーザーから変更：{userName}
              </button>

              {/* ログアウト */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout(); // ← これで LogoutButton.jsx と同じ動作！
                }}
                className="w-full text-left bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg font-semibold shadow transition"
              >
                🚪 ログアウト
              </button>
            </div>
          )}
        </div>

        {loadingResult && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
            <div className="bg-white/90 px-6 py-4 rounded-xl shadow-xl text-xl font-bold text-[#4A6572] animate-pulse">
              結果を集計中です…
            </div>
          </div>
        )}

        {/* 🌟 トップ画面（塾∞練デザイン統一版・フル幅対応） */}
        {!showQuestions && !showResult && units.length > 0 && (
          <>
            {/* 🏷️ タイトル：背景の上に直接乗せる層 */}
            <header
              className="
    fixed top-4 left-0 right-0 
    flex flex-col sm:flex-row items-center justify-center 
    text-center gap-2 sm:gap-4 
    z-[2] bg-transparent backdrop-blur-none
  "
            >
              <div className="flex flex-col items-center sm:items-start bg-transparent">
                <motion.h1
                  className={`text-3xl sm:text-5xl font-extrabold tracking-wide bg-clip-text text-transparent ${
                    lowSpecMode
                      ? "bg-gradient-to-r from-[#FFD56B] to-[#AACCFF] text-[#333] drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                      : "bg-gradient-to-r from-[#FFD56B] via-[#1CC5A3] to-[#AACCFF] drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]"
                  }`}
                  animate={
                    lowSpecMode
                      ? {} // 軽量モード時はアニメ停止
                      : { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }
                  }
                  transition={
                    lowSpecMode
                      ? {}
                      : {
                          backgroundPosition: {
                            duration: 12,
                            repeat: Infinity,
                            ease: "linear",
                          },
                        }
                  }
                  style={{ zIndex: 10 }} // 💡 最前面固定
                >
                  Let'sエンタメ英語
                </motion.h1>

                <p className="text-white/85 font-semibold text-sm sm:text-base mt-1 drop-shadow-sm">
                  ～ 楽しく身につく英語トレーニング ～
                </p>
                <p className="text-yellow-300 font-extrabold text-xl mt-2 drop-shadow-[0_0_5px_rgba(255,255,255,1)]">
                  {userName}、Let's try!
                </p>
              </div>
            </header>

            {/* 🧩 メインUI：問題形式・単元ボタンなど（背景より上の層） */}
            <div className="relative min-h-screen overflow-hidden z-0 flex flex-col items-center pt-24 bg-transparent">
              {/* ここに今までの main / 出題形式タブ / 単元グリッド / スタートボタン / フッター をそのまま置く */}
              <main
                className={`w-full p-4 sm:p-6 rounded-2xl border z-10 pointer-events-auto transition-all duration-300 ${
                  lowSpecMode
                    ? "bg-white border-gray-200" // ⚡️軽量モード（影・ぼかしOFF）
                    : "bg-white/60 backdrop-blur-md shadow-[inset_0_0_15px_rgba(255,255,255,0.5)] border-white/30"
                }`}
              >
                {/* === ガイド吹き出し（軽量） === */}
                {!lowSpecMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="
      mx-auto mb-4
      flex items-center gap-3
      bg-white/85 border border-white/60
      shadow-[0_2px_6px_rgba(0,0,0,0.08)]
      rounded-2xl px-4 py-2
      w-fit
    "
                  >
                    <div className="text-3xl">🧑‍🏫</div>
                    <p className="text-sm text-[#4A6572] font-semibold whitespace-nowrap">
                      まずは出題形式を選ぼう！ 複数選んでも OK だよ！
                    </p>
                  </motion.div>
                )}

                {/* 低スペックモード時：アニメなし＋軽量版 */}
                {lowSpecMode && (
                  <div
                    className="
      mx-auto mb-4
      flex items-center gap-3
      bg-white/80 border border-white/40
      shadow-sm rounded-2xl px-4 py-2 w-fit
    "
                  >
                    <div className="text-3xl">🧑‍🏫</div>
                    <p className="text-sm text-[#4A6572] font-semibold whitespace-nowrap">
                      まずは出題形式を選ぼう！
                    </p>
                  </div>
                )}

                {/* === 出題形式カード群 === */}
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  {[
                    { label: "単語・熟語", icon: "📘" },
                    { label: "適語補充", icon: "✏️" },
                    { label: "適文補充", icon: "🧩" },
                    { label: "整序問題", icon: "🪄" },
                    { label: "英作文", icon: "📝" },
                    { label: "長文読解", icon: "📖" },
                    { label: "リスニング", icon: "🎧" },
                  ].map(({ label, icon }) => {
                    const isSelected = selectedFormats.includes(label);

                    return (
                      <button
                        key={label}
                        onClick={() =>
                          playButtonSound(() => {
                            setSelectedFormats((prev) => {
                              const updated = prev.includes(label)
                                ? prev.filter((f) => f !== label)
                                : [...prev, label];

                              saveSelectedFormatsToSupabase(updated);
                              localStorage.setItem(
                                "selectedFormats",
                                JSON.stringify(updated)
                              );

                              return updated;
                            });
                          })
                        }
                        className={`
    relative flex flex-col items-center justify-center
    w-[110px] h-[95px]
    rounded-2xl border
    transition-all duration-150
    ${
      isSelected
        ? "bg-white text-[#1f3b57] border-teal-300 shadow-lg scale-[1.04]"
        : "bg-white/80 text-[#4A6572] border-white/60 hover:bg-white"
    }
  `}
                      >
                        {/* アイコン */}
                        <div className="text-3xl mb-1">{icon}</div>

                        {/* ラベル */}
                        <span className="text-xs font-bold text-center leading-tight">
                          {label}
                        </span>

                        {/* 選択中の「光るアンダーライン」 */}
                        {isSelected && (
                          <div
                            className="
        absolute bottom-1 left-1/2 -translate-x-1/2
        w-[60%] h-[4px]
        rounded-full
        bg-gradient-to-r from-sky-400 to-emerald-400
        opacity-90
      "
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <motion.h2
                  key={selectedFormats.join(",")}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-center text-lg font-bold text-[#4A6572] mb-3 drop-shadow-sm"
                >
                  📘{" "}
                  {selectedFormats.length > 0
                    ? `${selectedFormats.join("・")} の形式で出題するよ！`
                    : "出題形式を選んでください"}
                </motion.h2>

                {/* === 出題数セレクター === */}
                <h2 className="text-lg font-bold text-center mb-3 text-[#4A6572] drop-shadow-sm">
                  🧮 出題数を選ぼう！
                </h2>

                <div className="flex gap-3 flex-wrap justify-center mb-4">
                  {[5, 10, 15, "all"].map((count) => {
                    const isSelected = questionCount === count;

                    return (
                      <button
                        key={count}
                        onClick={() =>
                          playButtonSound(() => setQuestionCount(count))
                        }
                        className={`
          relative
          w-[70px] h-[48px]
          flex items-center justify-center
          rounded-xl border
          text-sm font-bold
          transition-all duration-150
          shadow-[0_1px_4px_rgba(0,0,0,0.08)]
          bg-white/85 text-[#4A6572] border-white/70
          hover:bg-white

          ${
            isSelected
              ? `
            text-[#1f3b57]
            border-teal-300
            scale-[1.06]
            shadow-[0_2px_6px_rgba(0,0,0,0.15)]
          `
              : ""
          }
        `}
                      >
                        {count === "all" ? "すべて" : `${count}問`}

                        {/* 選択中だけ光る下線 */}
                        {isSelected && (
                          <div
                            className="
              absolute bottom-1 left-1/2 -translate-x-1/2
              w-[60%] h-[3px]
              rounded-full
              bg-gradient-to-r from-sky-400 to-emerald-400
            "
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* === 単元グリッド === */}
                <div className="w-full px-2 sm:px-4">
                  {/* === 全選択・全解除 === */}
                  <div className="flex justify-center gap-3 mb-4">
                    <button
                      onClick={() => playButtonSound(selectAllUnits)}
                      className="bg-green-400 hover:bg-green-500 text-white px-4 py-1.5 rounded-full shadow text-sm transition"
                    >
                      全選択
                    </button>
                    <button
                      onClick={() => playButtonSound(clearAllUnits)}
                      className="bg-red-400 hover:bg-red-500 text-white px-4 py-1.5 rounded-full shadow text-sm transition"
                    >
                      全解除
                    </button>
                  </div>

                  {/* === 単元ボタン群 === */}
                  <div
                    className="
            grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 
            gap-[6px] sm:gap-2 lg:gap-3 
            w-full mb-8
          "
                  >
                    {/* === 📁 単語を覚える・テストする（軽量アコーディオン） === */}
                    <button
                      onClick={() =>
                        playButtonSound(() => setShowWordFolder((p) => !p))
                      }
                      className="
    col-span-4 sm:col-span-5
    w-full py-2 px-4 rounded-xl
    bg-[#ffe89b]
    border border-[#e6b72c]
    shadow-sm hover:shadow-md
    flex items-center justify-between
    transition-all font-bold text-[#6a4a09]
  "
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📘</span>
                        <span>単語を覚える・テストする</span>
                      </div>
                      <span className="text-xl">
                        {showWordFolder ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* === 展開部（超軽量アニメ） === */}
                    {/* === 📘 単語テストフォルダ === */}
                    <AnimatePresence>
                      {showWordFolder && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="
        col-span-4 sm:col-span-5 
        bg-white/70 backdrop-blur-lg
        rounded-2xl shadow-xl border border-white/40
        p-4 mt-2
      "
                        >
                          {/* タイトル */}
                          <div className="text-center font-bold text-[#35516e] text-sm mb-3">
                            📘 Part を選んでください（複数選択OK）
                          </div>

                          {/* 単語Partグリッド（3列） */}
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            {Array.from(
                              new Set(
                                questions
                                  .map((q) => q.unit)
                                  .filter((u) => u.includes("単語テスト"))
                              )
                            ).map((unit) => {
                              const name = unit
                                .replace("単語テスト", "")
                                .trim();
                              const isSelected = (unitModes[unit] ?? 0) !== 0;

                              return (
                                <button
                                  key={unit}
                                  onClick={() => {
                                    const newMode = isSelected ? 0 : 1;

                                    // ✅ ① React state を即時更新（見た目が変わる）
                                    setUnitModes((prev) => ({
                                      ...prev,
                                      [unit]: newMode,
                                    }));

                                    // ✅ ② Supabase に保存
                                    updateUnitSetting(unit, newMode);
                                  }}
                                  className={`
          flex flex-col items-center justify-center
          px-2 py-3 rounded-xl text-xs font-bold
          transition-all border shadow-sm
          ${
            isSelected
              ? "bg-gradient-to-br from-blue-300 to-blue-500 text-white border-blue-500 scale-[1.04]"
              : "bg-white text-[#35516e] border-gray-300 hover:bg-gray-100"
          }
        `}
                                >
                                  <div className="text-lg mb-1">📖</div>
                                  {name}
                                </button>
                              );
                            })}
                          </div>

                          {/* GOボタン */}
                          <div className="flex justify-center">
                            <button
                              disabled={
                                !questionCount ||
                                !Object.keys(unitModes).some(
                                  (u) =>
                                    u.includes("単語テスト") &&
                                    unitModes[u] !== 0
                                )
                              }
                              onClick={() => {
                                if (!questionCount) {
                                  showPopupMessage("出題数を選んでね！");
                                  return;
                                }

                                const qs = questions.filter(
                                  (q) =>
                                    q.unit.includes("単語テスト") &&
                                    unitModes[q.unit] !== 0
                                );

                                startQuiz({
                                  skipFiltering: true,
                                  directQuestions: qs,
                                });

                                setShowWordFolder(false);
                              }}
                              className={`
  px-6 py-3 rounded-full font-bold text-white shadow-lg transition
  ${
    questionCount &&
    Object.keys(unitModes).some(
      (u) => u.includes("単語テスト") && unitModes[u] !== 0
    )
      ? "bg-pink-500 hover:bg-pink-600"
      : "bg-gray-300 text-gray-500 cursor-not-allowed"
  }
`}
                            >
                              🚀 GO！
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* === 📗 My単語帳（軽量アコーディオン） === */}
                    <button
                      onClick={() =>
                        playButtonSound(() => setShowOriginalFolder((p) => !p))
                      }
                      className="
    col-span-4 sm:col-span-5
    w-full py-2 px-4 rounded-xl
    bg-[#d4f7d4]
    border border-[#7bc47b]
    shadow-sm hover:shadow-md
    flex items-center justify-between
    transition-all font-bold text-[#2f4f2f]
  "
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📗</span>
                        <span>My単語帳で勉強する・テストする</span>
                      </div>
                      <span className="text-xl">
                        {showOriginalFolder ? "▲" : "▼"}
                      </span>
                    </button>

                    <AnimatePresence>
                      {showOriginalFolder && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="
        col-span-4 sm:col-span-5
        bg-white/70 backdrop-blur-lg
        rounded-2xl shadow-xl border border-white/40
        p-4 mt-2
      "
                        >
                          {/* タイトル */}
                          <div className="text-center font-bold text-[#2d4a22] text-sm mb-4">
                            📗 My単語帳で勉強しよう！
                          </div>

                          {/* 3つの操作ボタン（追加 / 一覧 / 編集） */}
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            {/* 追加 */}
                            <button
                              onClick={() => {
                                setShowCustomWordInput(true);
                                setShowOriginalFolder(false);
                              }}
                              className="
            flex flex-col items-center justify-center 
            px-2 py-3 rounded-xl text-xs font-bold
            bg-white text-[#2d4a22] border border-gray-300
            hover:bg-gray-100 shadow-sm
          "
                            >
                              <div className="text-lg mb-1">✍️</div>
                              追加
                            </button>

                            {/* 一覧 / 編集 */}
                            <button
                              onClick={() => {
                                setShowOriginalList(true);
                                setShowOriginalFolder(false);
                              }}
                              className="
            flex flex-col items-center justify-center 
            px-2 py-3 rounded-xl text-xs font-bold
            bg-white text-[#2d4a22] border border-gray-300
            hover:bg-gray-100 shadow-sm
          "
                            >
                              <div className="text-lg mb-1">📄</div>
                              一覧・編集
                            </button>

                            {/* 削除機能（※必要なら） */}
                            <button
                              onClick={() => {
                                setShowOriginalList(true); // 削除は一覧画面で可能
                                setShowOriginalFolder(false);
                              }}
                              className="
            flex flex-col items-center justify-center 
            px-2 py-3 rounded-xl text-xs font-bold
            bg-white text-[#2d4a22] border border-gray-300
            hover:bg-gray-100 shadow-sm
          "
                            >
                              <div className="text-lg mb-1">🗑️</div>
                              削除
                            </button>
                          </div>

                          {/* === My単語テストボタン === */}
                          <div className="flex justify-center">
                            <button
                              onClick={() => {
                                const originalQs = questions.filter(
                                  (q) => q.unit === "単語テストMy単語"
                                );

                                playButtonSound(() => {
                                  setShowOriginalFolder(false);
                                  initAudio();
                                  startOriginalQuiz(originalQs); // ←専用関数
                                });
                              }}
                              className="
            px-6 py-3 rounded-full font-bold text-white
            bg-gradient-to-r from-green-400 to-green-500
            shadow-lg hover:opacity-90 transition
          "
                            >
                              📝 My単語テスト
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* === その他の単元 === */}
                    {Array.from(
                      new Set(
                        questions
                          .map((q) => q.unit)
                          .filter((unit) => !unit.includes("単語テスト"))
                      )
                    ).map((unit) => renderUnitButton(unit))}
                  </div>
                </div>

                {/* === 単語帳・サウンド設定 === */}
                <div className="text-center space-y-4">
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button
                      onClick={async () => {
                        if (audioCtx && audioCtx.state === "suspended") {
                          try {
                            await audioCtx.resume();
                          } catch (e) {
                            console.warn("[Audio] resume failed", e);
                          }
                        }
                        setSoundEnabled((prev) => !prev);
                      }}
                      className={`px-4 py-2 rounded-full shadow transition text-sm font-semibold ${
                        soundEnabled
                          ? "bg-green-400 text-white"
                          : "bg-gray-300 text-gray-800"
                      }`}
                    >
                      {soundEnabled ? "🔊 サウンドOFF" : "🔈 サウンドON"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center gap-2 bg-gray-50 p-2 rounded-lg border">
                  <input
                    type="checkbox"
                    id="lowSpecModeToggle"
                    checked={lowSpecMode}
                    onChange={() => setLowSpecMode(!lowSpecMode)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <label
                    htmlFor="lowSpecModeToggle"
                    className="text-sm text-gray-800 font-semibold select-none"
                  >
                    ⚙️ 軽量モード（アニメ・シャドウOFF）
                  </label>
                </div>

                {/* === スタートボタン === */}
                <button
                  onClick={() => {
                    if (disabledStart) return;

                    initAudio();
                    startQuiz();
                  }}
                  disabled={disabledStart}
                  className={`relative mt-10 rounded-full px-10 py-3 font-bold mx-auto block text-lg
    transition-all duration-300 active:scale-95

    ${
      disabledStart
        ? "bg-gray-400 text-white cursor-not-allowed opacity-70"
        : "bg-gradient-to-r from-pink-500 to-orange-500 text-white hover:opacity-90 shadow-lg gentle-pulse cursor-pointer"
    }
  `}
                >
                  🚀 スタート！
                </button>

                {/* 🔔 注意ポップアップ（alert の代わり） */}
                {showPopup && (
                  <div
                    className="
      fixed top-5 left-1/2 -translate-x-1/2
      bg-black/70 text-white px-5 py-2
      rounded-full shadow-lg text-sm z-[9999]
      animate-fadeInOut
    "
                  >
                    {popupMessage}
                  </div>
                )}
              </main>

              {/* 🦶 フッター */}
              <footer className="text-center text-xs text-gray-400 mt-8 mb-4 z-10 bg-transparent">
                © 塾∞練 JUKUREN — Learning Without Limits
              </footer>
            </div>
          </>
        )}

        {/* クイズ進行中 */}
        {showQuestions && !showResult && currentQuestion && (
          <>
            {/* 上：問題・タイマーなど */}
            <div className="w-full flex justify-center">
              <div className="w-full max-w-[900px] px-4 sm:px-6 md:px-8 flex flex-col items-center pb-[300px]">
                {/* ← 👆 pb-[220px] は下の手書きパッド分の余白 */}

                <Character mood={characterMood} userName={userName} />

                {/* 🌟 連続正解カウンター */}
                {streak > 0 && (
                  <div className="text-center text-lg font-bold text-[#4A6572] mt-2">
                    🌟 連続正解：{streak}問！
                  </div>
                )}

                {/* === formatごとの分岐 === */}
                {showFeedback ? (
                  /* ✅ 解答結果画面（既存部分はほぼ変更なし） */
                  <div
                    className={`p-4 rounded-lg shadow-md mb-4 overflow-y-auto max-h-[calc(100vh-260px)] pb-[220px] z-[7000] relative ${
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

                    {/* ✅ 正誤メッセージ */}
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

                    {/* ✅ あなたの答え・解説など（既存） */}
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
                        {isCorrect
                          ? currentQuestion.explanation
                          : currentQuestion.incorrectExplanations?.[
                              selectedChoice
                            ] ??
                            `正解は「${currentQuestion.correct}」。${currentQuestion.explanation}`}
                      </p>

                      {/* 🔊 音声ボタン */}
                      <button
                        onClick={() => {
                          let textToRead;
                          if (isCorrect) {
                            // ✅ 正解時も日本語イントロを追加
                            textToRead = `正解です。「${currentQuestion.correct}」。${currentQuestion.explanation}`;
                          } else {
                            textToRead =
                              currentQuestion.incorrectExplanations?.[
                                selectedChoice
                              ] ??
                              `正解は「${currentQuestion.correct}」。${currentQuestion.explanation}`;
                          }

                          playExplanation(textToRead);
                        }}
                        className="bg-blue-500 text-white px-4 py-2 rounded mt-2"
                      >
                        🔊 解説を聞く
                      </button>
                      <button
                        onClick={() => {
                          if (window.stopExplanationPlayback) {
                            window.stopExplanationPlayback(); // ✅ 状態も確実にリセット
                            //console.log("🛑 解説停止 & 状態リセット");
                          }
                        }}
                        className="bg-red-500 text-white px-4 py-2 rounded"
                      >
                        ⏹ 停止
                      </button>
                    </motion.div>

                    {/* 🔁 覚え直す・質問する・次へ */}
                    <button
                      onClick={() => {
                        const current = filteredQuestions[currentIndex];
                        setReviewing(true);
                        setTemporaryAnswer(
                          Array.isArray(current.correct)
                            ? current.correct.join(" / ")
                            : current.correct ?? ""
                        );
                        setShowAnswerTemporarily(true);
                        // 🎙️ 英語TTSで正答をネイティブ発音
                        if (soundEnabled && current?.correct) {
                          // 複数解答対応（/区切りなら最初のものを読む）
                          const englishText = Array.isArray(current.correct)
                            ? current.correct[0]
                            : String(current.correct).split("/")[0].trim();
                          speakEnglishAnswer(englishText);
                        }
                        setReviewList((prev) => {
                          if (prev.find((q) => q.id === current.id))
                            return prev;
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
                      className={`
    bg-orange-400 hover:bg-orange-500 text-white px-3 py-1.5 
    rounded-full shadow text-sm sm:text-base font-bold
    ${shouldBlinkRemember ? "blink-reminder" : ""}
  `}
                    >
                      🔁 覚え直す
                    </button>

                    <button
                      onClick={() =>
                        playButtonSound(() => handleAddToQuestionList())
                      }
                      className="bg-yellow-400 hover:bg-yellow-500 text-white px-6 py-3 rounded-full shadow-md transition mt-4"
                    >
                      後で先生に質問する
                    </button>

                    {/* 🔁 次へボタン（解説画面専用 — iOSでも押せる前面固定） */}
                    <div
                      className="
    fixed bottom-0 left-0
    w-full flex justify-center
    bg-white/95 backdrop-blur-sm
    py-3
    z-[9999]     /* ← 手書きパッドより上＆全部の前でOK！ */
    shadow-[0_-4px_12px_rgba(0,0,0,0.18)]
  "
                    >
                      {/* === 🔥 解説中限定：右下固定 Next ボタン === */}
                      {showFeedback && (
                        <NextButtonPortal
                          onClick={handleNext}
                          disabled={isSpeaking}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  /* ✅ 出題画面（ここがformat対応の重要部分） */

                  <div className="flex flex-col w-full bg-white/80 backdrop-blur-md rounded-xl shadow-md p-4 sm:p-6 mb-8">
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
                          timeLeft > 5
                            ? "bg-green-500"
                            : "bg-red-500 animate-pulse"
                        }`}
                        style={{
                          width: `${
                            maxTime > 0 ? (timeLeft / maxTime) * 100 : 0
                          }%`,
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

                    <div className="bg-[#F9F9F9] border border-[#E0E0E0] rounded-xl p-4 shadow mb-6 text-left">
                      <h2 className="text-base sm:text-lg font-bold mb-2 whitespace-pre-wrap break-words">
                        {isChoiceFormat ? (
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
                        ) : (
                          // 手入力問題はそのまま表示
                          currentQuestion.question
                        )}
                      </h2>
                    </div>

                    {/* ✅ 覚え直し時に一時的に答えを表示（変更なし） */}
                    {showAnswerTemporarily && (
                      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[2000]">
                        <p className="text-white text-4xl sm:text-6xl font-extrabold text-center px-4 break-words leading-snug">
                          ✅ {temporaryAnswer}
                        </p>
                      </div>
                    )}

                    {/* === 💡ヒント＆🔁覚え直すボタン群（変更なし） === */}
                    <div className="w-full flex justify-center gap-3 -1 mb-1">
                      {/* 💡ヒントボタン */}
                      <button
                        onClick={handleShowHint}
                        className="bg-yellow-400 hover:bg-yellow-500 text-white font-bold px-3 py-1.5 rounded-full shadow text-sm sm:text-base"
                      >
                        💡 ヒント
                      </button>

                      {/* 🔁覚え直すボタン（中身・ロジックそのまま） */}
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
                          // 🎙️ 英語TTSで正答をネイティブ発音
                          if (soundEnabled && current?.correct) {
                            // 複数解答対応（/区切りなら最初のものを読む）
                            const englishText = Array.isArray(current.correct)
                              ? current.correct[0]
                              : String(current.correct).split("/")[0].trim();
                            speakEnglishAnswer(englishText);
                          }

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
                            if (prev.find((q) => q.id === current.id))
                              return prev;
                            return [...prev, current];
                          });

                          setReviewMistakes((prev) => {
                            if (prev.find((q) => q.id === current.id))
                              return prev;
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
                        className={`
    bg-orange-400 hover:bg-orange-500 text-white px-3 py-1.5 
    rounded-full shadow text-sm sm:text-base font-bold
    ${shouldBlinkRemember ? "blink-reminder" : ""}
  `}
                      >
                        🔁 覚え直す
                      </button>
                    </div>

                    {/* ヒントテキスト（変更なし） */}
                    {hintText && (
                      <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg shadow text-gray-800 text-center">
                        {hintText}
                      </div>
                    )}

                    {/* 🔹 選択肢ボタン */}
                    {/* 🔄 ここを format 判定に変更：単語・熟語以外（=4択）だけ表示 */}
                    {currentQuestion.type === "multiple-choice" && (
                      <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 mt-2">
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
                    {/* 🎧 リスニング問題 */}
                    {currentQuestion.format === "リスニング" &&
                      currentQuestion.type === "listening-choice" && (
                        <div className="text-center mb-4">
                          <button
                            onClick={() => {
                              // ✅ 再生回数制限（最大2回）
                              if (!currentQuestion.playCount)
                                currentQuestion.playCount = 0;
                              if (currentQuestion.playCount >= 2) {
                                alert("この音声は2回までしか再生できません。");
                                return;
                              }
                              currentQuestion.playCount++;
                              speakConversation(currentQuestion.audioText);
                            }}
                            className="bg-blue-400 hover:bg-blue-500 text-white px-6 py-3 rounded-full shadow transition"
                          >
                            🔊 音声を再生（{currentQuestion.playCount ?? 0}/2）
                          </button>
                          <p className="text-sm text-gray-600 mt-2">
                            （2回まで再生できます）
                          </p>

                          {/* 選択肢ボタン */}
                          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 mt-4">
                            {currentQuestion.choices.map((choice, index) => (
                              <button
                                key={index}
                                onClick={() => handleAnswer(choice)}
                                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#4A6572] hover:bg-[#A7D5C0] transition"
                              >
                                {choice}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* 🔹 単語タップ翻訳結果（改善版） */}
                    {selectedWord && (
                      <div className="mt-4 p-3 bg-[#F9F9F9] border border-[#E0E0E0] rounded-lg shadow">
                        <h3 className="text-base font-bold text-[#4A6572] mb-1">
                          選択した単語
                        </h3>

                        <p className="text-lg font-semibold text-[#4A6572]">
                          {selectedWord}
                        </p>

                        <p className="text-gray-800 mb-2">{wordMeaning}</p>

                        <div className="flex gap-2 mt-2">
                          {/* 発音ボタン */}
                          <button
                            onClick={() => playSoundFor(selectedWord)}
                            className="px-3 py-1 bg-blue-400 hover:bg-blue-500 text-white rounded-full shadow"
                          >
                            🔊 発音
                          </button>

                          {/* 単語帳追加ボタン */}
                          <button
                            onClick={() => {
                              if (!selectedWord || !wordMeaning) return;
                              saveOriginalWordToSupabase(
                                selectedWord,
                                wordMeaning
                              );
                            }}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-full shadow"
                          >
                            ＋ 単語帳に入れる
                          </button>

                          {/* 閉じる */}
                          <button
                            onClick={() => {
                              setSelectedWord(null);
                              setWordMeaning("");
                            }}
                            className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-full shadow"
                          >
                            閉じる
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {console.log("=== DEBUG PAD ===", {
              showQuestions,
              showResult,
              type: currentQuestion?.type,
              format: currentQuestion?.format,
              useHandwriting,
            })}

            {/* 下：問題解答用の手書きパッド（compact版とは完全に別物） */}
            {showQuestions &&
              !showFeedback &&
              !showResult &&
              currentQuestion.type !== "multiple-choice" &&
              (currentQuestion.type?.trim() === "input" ||
                currentQuestion.format === "単語・熟語") &&
              !showHandwritingFor && ( // ← ★ compact表示中は通常パッドを出さない
                <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-sm border-t shadow-lg z-[60]">
                  <div className="max-w-[900px] mx-auto px-4 sm:px-6 md:px-8 py-3">
                    {renderInputSection()}
                  </div>
                </div>
              )}
          </>
        )}

        {showReviewPrompt && (
          <div className="fixed inset-0 z-[9000] bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-xl text-center relative z-[9001]">
              <h3 className="text-lg font-bold mb-3">
                📘 復習問題をもう一度出すよ！
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                解説を踏まえて、もう一度チャレンジ！
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={startReview}
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

        {showCustomWordInput && (
          <div className="fixed inset-0 z-[7000] bg-black/30 flex items-start justify-center pt-10">
            <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-xl">
              <h2 className="text-xl font-bold mb-4">
                {editingId ? "✏️ 単語を編集" : "✍️ My単語を追加"}
              </h2>

              {/* 英単語入力 */}
              <div className="mb-3">
                <label className="font-semibold">英単語：</label>
                <input
                  type="text"
                  value={tempCustomWord}
                  onChange={(e) => setTempCustomWord(e.target.value)}
                  className="border p-2 w-full rounded"
                  placeholder="例: apple"
                />
                <button
                  onClick={() => setShowHandwritingFor("word")}
                  className="mt-2 bg-gray-200 px-3 py-1 rounded shadow text-sm"
                >
                  ✍️ 手書きで入力する
                </button>
              </div>

              {/* 意味入力 */}
              <div className="mb-3">
                <label className="font-semibold">意味：</label>
                <input
                  type="text"
                  value={tempCustomMeaning}
                  onChange={(e) => setTempCustomMeaning(e.target.value)}
                  className="border p-2 w-full rounded"
                  placeholder="例: りんご"
                />
                <button
                  onClick={() => setShowHandwritingFor("meaning")}
                  className="mt-2 bg-gray-200 px-3 py-1 rounded shadow text-sm"
                >
                  ✍️ 手書きで入力する
                </button>
              </div>

              {/* 保存ボタン */}
              <button
                className="bg-blue-500 text-white p-2 rounded w-full mt-3"
                onClick={async () => {
                  const word = tempCustomWord.trim();
                  const meaning = tempCustomMeaning.trim();

                  if (!word || !meaning) return;
                  if (!supabaseUser) return alert("ログインしてください");

                  if (editingId) {
                    // ------------------------------
                    // ✏️ 編集モード：Supabase 更新
                    // ------------------------------
                    const { error } = await supabase
                      .from("original_words")
                      .update({
                        word,
                        meaning,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", editingId)
                      .eq("user_id", supabaseUser.id);

                    if (error) {
                      console.error("更新エラー:", error);
                      return alert("更新できませんでした");
                    }

                    // UI 即反映
                    setOriginalWords((prev) =>
                      prev.map((item) =>
                        item.id === editingId
                          ? { ...item, word, meaning }
                          : item
                      )
                    );

                    // リセット
                    setEditingId(null);
                    setTempCustomWord("");
                    setTempCustomMeaning("");
                    setShowCustomWordInput(false);
                    setSuggestedMeaning("");
                    setShowHandwritingFor(null);

                    // トースト
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 1500);
                  } else {
                    // ------------------------------
                    // ✨ 新規追加：Supabase に保存
                    // ------------------------------
                    const { data, error } = await supabase
                      .from("original_words")
                      .upsert(
                        {
                          user_id: supabaseUser.id,
                          word,
                          meaning,
                          created_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id,word" }
                      )
                      .select();

                    if (error) {
                      console.error("追加エラー:", error);
                      return alert("保存できませんでした");
                    }

                    // Supabase の戻り値の id を反映
                    const saved = data?.[0];

                    // UI即反映（重複は避ける）
                    setOriginalWords((prev) => {
                      if (prev.some((x) => x.word === word)) return prev;
                      return [saved, ...prev];
                    });

                    // 入力リセット
                    setTempCustomWord("");
                    setTempCustomMeaning("");
                    setSuggestedMeaning("");
                    setShowHandwritingFor(null);

                    // トースト
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 1500);
                  }
                }}
              >
                保存する
              </button>

              {/* 戻るボタン */}
              <button
                className="bg-gray-500 text-white p-2 rounded w-full mt-3"
                onClick={() => {
                  setShowCustomWordInput(false);
                  setEditingId(null);
                  setShowHandwritingFor(null); // ← ★手書きパッドも閉じる
                  setSuggestedMeaning(""); // ← ★候補も消す（安全）
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}

        {showOriginalList && (
          <div className="fixed inset-0 bg-black/40 z-[2000] flex items-center justify-center">
            <div className="bg-white rounded-2xl p-6 w-[90%] max-w-[500px] shadow-xl">
              <h2 className="text-xl font-bold mb-4 text-[#123a6b]">
                📘 登録単語一覧
              </h2>

              {originalWords.length === 0 ? (
                <p className="text-gray-600">まだ単語が登録されていません。</p>
              ) : (
                <ul className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {originalWords.map((item) => (
                    <li
                      key={item.id} // ← ★ 必ず id を使う
                      className="bg-gray-50 p-3 rounded-xl shadow flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold text-lg">{item.word}</p>
                        <p className="text-gray-600">{item.meaning}</p>
                      </div>

                      <div className="flex gap-2">
                        {/*  ✏️ 編集 */}
                        <button
                          onClick={() => {
                            setEditingWord(item); // ★ item をそのまま保存（id を保持）
                            setEditWord(item.word);
                            setEditMeaning(item.meaning);
                            setShowEditModal(true);
                          }}
                          className="bg-yellow-400 px-3 py-2 rounded"
                        >
                          ✏️
                        </button>

                        {/* 🗑️ Supabase 削除 */}
                        <button
                          onClick={() => deleteOriginalWord(item.id)} // ← ★ ここを id にする！
                          className="bg-red-400 text-white px-3 py-2 rounded"
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => setShowOriginalList(false)}
                className="mt-4 bg-gray-500 text-white py-2 rounded w-full"
              >
                閉じる
              </button>
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
              <h2 className="text-3xl font-bold text-[#4A6572] mb-4">
                結果発表
              </h2>
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
                <h3 className="text-xl font-bold mb-2">
                  不正解だった問題と解説
                </h3>
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
              <h2 className="text-xl font-bold mb-4 text-center">
                質問ボックス
              </h2>

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
        {showSaveToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg z-[5000] animate-fade">
            ✔ 保存しました！
          </div>
        )}
        {toastMessage && (
          <div
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 
                  bg-black text-white px-4 py-2 rounded-lg shadow-lg
                  text-sm z-[5000] opacity-90"
          >
            {toastMessage}
          </div>
        )}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/40 z-[3000] flex items-center justify-center">
            <div className="bg-white p-6 rounded-xl w-[90%] max-w-[450px] shadow-xl">
              <h2 className="text-xl font-bold mb-3">✏️ 単語を編集</h2>

              <label className="block mb-2 font-semibold">単語</label>
              <input
                type="text"
                value={editWord}
                onChange={(e) => setEditWord(e.target.value)}
                className="border w-full p-2 rounded mb-4"
              />

              <label className="block mb-2 font-semibold">意味</label>
              <input
                type="text"
                value={editMeaning}
                onChange={(e) => setEditMeaning(e.target.value)}
                className="border w-full p-2 rounded mb-4"
              />

              <div className="flex justify-between">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-400 text-white rounded-lg"
                >
                  キャンセル
                </button>

                <button
                  onClick={updateOriginalWord}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
