import https from "https";

const GROQ_KEY = process.env.GROQ_API_KEY;

export function voiceEnabled(): boolean {
  return Boolean(GROQ_KEY);
}

function httpsGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("download timeout")));
    req.on("error", reject);
  });
}

/** Распознавание речи: Whisper large-v3 через Groq (бесплатный тариф). */
export async function transcribeVoice(fileUrl: string): Promise<string> {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");

  const audio = await httpsGetBuffer(fileUrl);
  const boundary = "----grambot" + Date.now().toString(36);

  const part = (name: string, value: string) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);

  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`
  );

  const body = Buffer.concat([
    part("model", "whisper-large-v3"),
    part("language", "ru"),
    part("response_format", "json"),
    fileHeader,
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.groq.com",
        path: "/openai/v1/audio/transcriptions",
        method: "POST",
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (json.text) resolve(String(json.text).trim());
            else reject(new Error(json.error?.message ?? "no text in response"));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("groq timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
