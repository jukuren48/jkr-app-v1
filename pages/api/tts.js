export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    text,
    lang = "en-US",
    voiceName = "en-US-Neural2-F",
    speakingRate = 1.0,
    pitch = 0,
  } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_TTS_API_KEY is missing");
    }

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: lang,
            name: voiceName,
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate,
            pitch,
          },
        }),
      }
    );

    const data = await response.json();

    if (!data.audioContent) {
      throw new Error(
        "Google TTS returned no audioContent: " + JSON.stringify(data)
      );
    }

    return res.status(200).json({ audioContent: data.audioContent });
  } catch (err) {
    console.error("🔴 TTS ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
