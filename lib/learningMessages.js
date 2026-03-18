export function getUnderstandingMessage(score) {
  const n = Number(score ?? 0);

  if (n >= 85) {
    return {
      short: "かなり理解できています",
      action: "次は定着を確認しましょう。",
    };
  }

  if (n >= 70) {
    return {
      short: "理解はかなり進んでいます",
      action: "あと少しで安定です。もう1回解いてみましょう。",
    };
  }

  if (n >= 50) {
    return {
      short: "理解は進んでいますが、まだ不安定です",
      action: "解説を見直してから自力で解けるか確認しましょう。",
    };
  }

  return {
    short: "まだ理解が十分ではありません",
    action: "解説を読んで、似た問題をもう一度解いてみましょう。",
  };
}

export function getRetentionMessage(score) {
  const n = Number(score ?? 0);

  if (n >= 80) {
    return {
      short: "しっかり定着しています",
      action: "このまま維持できています。",
    };
  }

  if (n >= 60) {
    return {
      short: "かなり定着しています",
      action: "忘れる前に軽く復習するとより安心です。",
    };
  }

  if (n >= 40) {
    return {
      short: "忘れかけています",
      action: "今が復習のチャンスです。",
    };
  }

  return {
    short: "定着がかなり弱くなっています",
    action: "最優先で復習しましょう。",
  };
}

export function getPriorityMessage(priority) {
  const n = Number(priority ?? 0);

  if (n >= 80) {
    return {
      short: "最優先で復習したい単元です",
      action: "今日のうちに取り組むのがおすすめです。",
    };
  }

  if (n >= 60) {
    return {
      short: "復習優先度が高めです",
      action: "時間があるうちに確認しておきましょう。",
    };
  }

  if (n >= 40) {
    return {
      short: "少し注意が必要です",
      action: "近いうちに1回見直すと安心です。",
    };
  }

  return {
    short: "今は安定しています",
    action: "他の弱い単元を先に進めて大丈夫です。",
  };
}

export function getCombinedLearningMessage({
  understandingScore,
  retentionScore,
  reviewPriority,
}) {
  const u = Number(understandingScore ?? 0);
  const r = Number(retentionScore ?? 0);
  const p = Number(reviewPriority ?? 0);

  if (u >= 80 && r >= 70) {
    return "しっかり身についています。この調子で次の単元へ進みましょう。";
  }

  if (u >= 70 && r < 70) {
    return "理解はできていますが、忘れかけています。今のうちに復習すると定着しやすいです。";
  }

  if (u < 50 && r < 50) {
    return "まだ自力で解ける状態ではありません。解説を読み、もう一度自分で解いてみましょう。";
  }

  if (p >= 80) {
    return "この問題は今とても大事です。最優先で復習しましょう。";
  }

  return "少し不安定です。あと1回自力で解けると安定しやすくなります。";
}
