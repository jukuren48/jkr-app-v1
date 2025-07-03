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
    // ✅ ここで環境変数からサービスアカウントJSONを復元
    const serviceAccountJSON = JSON.parse(
      Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64,
        "base64"
      ).toString("utf8")
    );

    // ✅ 認証情報を直接渡す
    const client = new textToSpeech.TextToSpeechClient({
      credentials: {
        client_email: serviceAccountJSON.client_email,
        private_key: serviceAccountJSON.private_key,
      },
    });

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

    console.log("==== Google TTS Response ====");
    console.log("AudioContent exists?", !!response.audioContent);
    console.log(
      "AudioContent length:",
      response.audioContent ? response.audioContent.length : "NULL"
    );

    let audioContentString = "";

    if (Buffer.isBuffer(response.audioContent)) {
      audioContentString = response.audioContent.toString("base64");
    } else if (typeof response.audioContent === "string") {
      audioContentString = response.audioContent;
    } else {
      console.error(
        "Google TTS returned unknown audioContent format",
        typeof response.audioContent
      );
      return res.status(500).json({ error: "Invalid audio content format" });
    }

    // ここで空白・改行を除去
    audioContentString = audioContentString.replace(/\s+/g, "");

    console.log("AudioContent length:", audioContentString.length);

    res.status(200).json({
      audioContent: audioContentString,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
}
