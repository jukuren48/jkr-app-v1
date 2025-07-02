// pages/api/tts.js

import textToSpeech from "@google-cloud/text-to-speech";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    // Google認証ファイルのパスを指定
    const keyFile = path.join(
      process.cwd(),
      "texttospeechapp-464703-9ac89bfa4b57.json"
    );

    // クライアントを初期化
    const client = new textToSpeech.TextToSpeechClient({
      keyFilename: keyFile,
    });

    // 音声合成リクエスト
    const request = {
      input: { text },
      voice: {
        languageCode: "ja-JP",
        ssmlGender: "FEMALE",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.95,
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    res.status(200).json({
      audioContent: response.audioContent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
}
