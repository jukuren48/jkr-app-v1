console.log(
  "Vercel ENV VAR CHECK:",
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 ? "SET" : "UNDEFINED"
);

import textToSpeech from "@google-cloud/text-to-speech";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    // ✅ 環境変数からBase64をデコードしてフルのサービスアカウントJSONを復元
    const credentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64;
    if (!credentialsBase64) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 is not set");
    }

    const credentialsJson = JSON.parse(
      Buffer.from(credentialsBase64, "base64").toString("utf8")
    );

    // ✅ フルJSONをそのまま渡す
    const client = new textToSpeech.TextToSpeechClient({
      credentials: credentialsJson,
    });

    const request = {
      input: { text },
      voice: {
        languageCode: "ja-JP",
        ssmlGender: "FEMALE",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.3,
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      console.error("No audio content in response");
      return res.status(500).json({ error: "No audio content returned" });
    }

    // ✅ 音声をBase64文字列に変換
    const audioContentString = Buffer.from(response.audioContent).toString(
      "base64"
    );

    res.status(200).json({
      audioContent: audioContentString,
    });
  } catch (error) {
    console.error("TTS API ERROR:", error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
}
