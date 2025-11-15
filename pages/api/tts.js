import textToSpeech from "@google-cloud/text-to-speech";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, ssml, lang, voiceName, speakingRate, pitch } = req.body;

  if (!text && !ssml) {
    return res.status(400).json({ error: "Missing text or ssml" });
  }

  try {
    const credentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64;
    if (!credentialsBase64)
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 is not set");

    const credentialsJson = JSON.parse(
      Buffer.from(credentialsBase64, "base64").toString("utf8")
    );

    const client = new textToSpeech.TextToSpeechClient({
      credentials: credentialsJson,
    });

    // ✅ 正確な声と性別マッピング
    const genderMap = {
      "en-US-Neural2-A": "MALE",
      "en-US-Neural2-B": "MALE",
      "en-US-Neural2-C": "FEMALE",
      "en-US-Neural2-D": "MALE",
      "en-US-Neural2-E": "FEMALE",
      "en-US-Neural2-F": "FEMALE",
      "en-US-Neural2-G": "MALE",
      "en-US-Neural2-H": "FEMALE",
      "en-US-Neural2-I": "MALE",
      "en-US-Neural2-J": "MALE",
      "ja-JP-Neural2-B": "FEMALE",
      "ja-JP-Neural2-C": "MALE",
    };

    const detectedGender =
      genderMap[voiceName] || "SSML_VOICE_GENDER_UNSPECIFIED";

    // ✅ リクエスト構築（性別は安全にfallback）
    const voiceConfig = {
      languageCode: lang || "en-US",
      name: voiceName || "en-US-Neural2-F",
    };
    if (detectedGender !== "SSML_VOICE_GENDER_UNSPECIFIED") {
      voiceConfig.ssmlGender = detectedGender;
    }

    const request = {
      input: ssml ? { ssml } : { text },
      voice: voiceConfig,
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: speakingRate || 1.0,
        pitch: pitch || 0.0,
      },
    };

    const [response] = await client.synthesizeSpeech(request);
    if (!response.audioContent) throw new Error("No audio content returned");

    const audioContentString = Buffer.from(response.audioContent).toString(
      "base64"
    );

    res.status(200).json({ audioContent: audioContentString });
  } catch (error) {
    console.error("🟥 TTS API ERROR:", error);
    if (error.details)
      console.error("🟨 details:", JSON.stringify(error.details));
    if (error.response && error.response.data)
      console.error("🟦 response:", JSON.stringify(error.response.data));

    res.status(500).json({
      error: error.message || "TTS synthesis failed",
    });
  }
}
