// Phase 2: Extract MCQs from images & PDFs using Gemini Vision.
// Detects answer markers (tick / star / bold / underline / highlight / circle / "Correct" text),
// auto-enriches with diagrams from Wikimedia, writes upload_logs, and flags low-confidence rows.
//
// Input: {
//   files: { name: string; mimeType: string; data: string /* base64 (no data:url prefix) */ }[],
//   bankTitle: string,
//   subject?: string
// }
// Output: { bankId: string, count: number, flagged: number, uploadLogId: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractedQuestion {
  stem: string;
  options: { id: string; text: string }[];
  correct_answers: string[];
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  reference?: string;
  page_number?: number;
  marker_type?:
    | "tick"
    | "star"
    | "bold"
    | "underline"
    | "highlight"
    | "circle"
    | "text"
    | "none"
    | "unknown";
  confidence_score?: number;
  needs_image?: boolean;
  image_query?: string;
}

const SYSTEM_PROMPT = `You are an expert medical educator processing MCQ documents (PDFs or photos).

CORE RULES — follow strictly:

1. Maintain the ORIGINAL question sequence. Set page_number for each question if you can infer it.
2. Correct OCR errors silently — do NOT change medical meaning.
3. Detect and separate every MCQ on every page. Do not merge or skip questions.

4. ANSWER MARKER DETECTION — for each question, look for indicators next to one or more options:
   - The word "Correct", "Ans", "Answer", "Key", "(✓)" written beside an option
   - Tick marks: ✔ ✓ ☑
   - Stars: * ★ ⭐
   - Bold or underlined text on an option
   - Highlighting (background color) on an option
   - Circle / box drawn around an option letter
   - Hand-drawn arrows pointing at an option
   Map each marker to the matching option id (a, b, c, d, e). Allow MULTIPLE correct answers if multiple markers exist.
   STRIP the marker characters/words from the final option text — output only the clean option text.
   Set marker_type to one of: tick | star | bold | underline | highlight | circle | text | none | unknown.
   If NO marker is found, set correct_answers = [], marker_type = "none".

5. CONFIDENCE — set confidence_score between 0 and 1:
   - 1.0 = clear marker, clean OCR
   - 0.7 = marker present but ambiguous (two markers, partial occlusion)
   - 0.4 = OCR uncertain or marker unclear
   - 0.0 = no marker found
   Anything below 0.6 will be flagged for human review.

6. EXPLANATION — short, high-yield only. Reference Gray's, Snell, Bailey & Love, Harrison's only when they add value.

7. DIAGRAM — if the question concept is best understood with an anatomy / histology / radiology / ECG image, set needs_image=true and image_query to a precise search term (e.g. "human heart anatomy labeled chambers"). Do NOT describe the diagram in the explanation.

8. NEVER guess answers when there is no marker. Just leave correct_answers empty.

Output via the submit_questions function. Be exhaustive — extract EVERY question visible.`;

async function extractWithGemini(
  files: { mimeType: string; data: string }[]
): Promise<ExtractedQuestion[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: "Extract every MCQ from these documents. Detect answer markers carefully.",
    },
  ];
  for (const f of files) {
    // Gemini accepts data URLs for both images and application/pdf
    const url = `data:${f.mimeType};base64,${f.data}`;
    content.push({ type: "image_url", image_url: { url } });
  }

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_questions",
          description: "Return all extracted MCQs with marker detection.",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    stem: { type: "string" },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          text: { type: "string" },
                        },
                        required: ["id", "text"],
                      },
                    },
                    correct_answers: {
                      type: "array",
                      items: { type: "string" },
                    },
                    explanation: { type: "string" },
                    difficulty: {
                      type: "string",
                      enum: ["easy", "medium", "hard"],
                    },
                    reference: { type: "string" },
                    page_number: { type: "integer" },
                    marker_type: {
                      type: "string",
                      enum: [
                        "tick",
                        "star",
                        "bold",
                        "underline",
                        "highlight",
                        "circle",
                        "text",
                        "none",
                        "unknown",
                      ],
                    },
                    confidence_score: { type: "number" },
                    needs_image: { type: "boolean" },
                    image_query: { type: "string" },
                  },
                  required: ["stem", "options", "correct_answers"],
                },
              },
            },
            required: ["questions"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_questions" } },
  };

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429) throw new Error("RATE_LIMIT");
    if (resp.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error(`AI gateway: ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call returned by model");
  const args = JSON.parse(toolCall.function.arguments);
  return args.questions as ExtractedQuestion[];
}

async function searchWikimedia(query: string): Promise<string | null> {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
    url.searchParams.set("gsrlimit", "1");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "800");
    url.searchParams.set("origin", "*");

    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": "MedAI-ExamEngine/1.0" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const first = Object.values(pages)[0] as {
      imageinfo?: { thumburl?: string; url?: string }[];
    };
    return first?.imageinfo?.[0]?.thumburl ?? first?.imageinfo?.[0]?.url ?? null;
  } catch (_) {
    return null;
  }
}

const CONFIDENCE_THRESHOLD = 0.6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  let uploadLogId: string | null = null;
  let userId: string | null = null;

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authHeader },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userData = await userResp.json();
    userId = userData.id as string;

    const payload = await req.json();
    // Backwards compat: accept either { files: [...] } or legacy { images: [dataUrl,...] }
    let files: { name: string; mimeType: string; data: string }[] = [];
    if (Array.isArray(payload.files)) {
      files = payload.files;
    } else if (Array.isArray(payload.images)) {
      files = payload.images.map((url: string, i: number) => {
        const m = url.match(/^data:([^;]+);base64,(.+)$/);
        return {
          name: `image-${i + 1}`,
          mimeType: m?.[1] ?? "image/png",
          data: m?.[2] ?? "",
        };
      });
    }
    const bankTitle = payload.bankTitle as string;
    const subject = (payload.subject as string | undefined) ?? null;

    if (files.length === 0 || !bankTitle) {
      return new Response(
        JSON.stringify({ error: "Missing files or bankTitle" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (files.length > 20) {
      return new Response(
        JSON.stringify({ error: "Maximum 20 files per upload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create upload log row up-front
    const fileNames = files.map((f) => f.name).join(", ").slice(0, 500);
    const fileTypes = Array.from(new Set(files.map((f) => f.mimeType))).join(", ");
    const logResp = await fetch(`${supabaseUrl}/rest/v1/upload_logs`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        uploader_id: userId,
        file_name: fileNames,
        file_type: fileTypes,
        page_count: files.length,
        processing_status: "extracting",
      }),
    });
    if (logResp.ok) {
      const [row] = await logResp.json();
      uploadLogId = row?.id ?? null;
    }

    console.log(
      `extract-mcqs: ${files.length} file(s) for ${userId} (${fileTypes})`
    );

    const questions = await extractWithGemini(files);
    console.log(`extract-mcqs: got ${questions.length} questions`);

    // Update log: enrichment phase
    if (uploadLogId) {
      await fetch(
        `${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`,
        {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({ processing_status: "enriching" }),
        }
      );
    }

    // Enrich with diagrams
    for (const q of questions) {
      if (q.needs_image && q.image_query) {
        const url = await searchWikimedia(q.image_query);
        if (url) {
          (q as unknown as { _image_url: string })._image_url = url;
          (q as unknown as { _image_caption: string })._image_caption =
            q.image_query;
        }
      }
    }

    // Create the bank
    const bankResp = await fetch(`${supabaseUrl}/rest/v1/question_banks`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        owner_id: userId,
        title: bankTitle,
        subject,
      }),
    });
    if (!bankResp.ok) {
      const t = await bankResp.text();
      throw new Error(`bank insert: ${t}`);
    }
    const [bank] = await bankResp.json();

    // Build rows with classification + flagging
    const sourceFile = fileNames.length > 200 ? `${files.length} files` : fileNames;
    let flagged = 0;

    const rows = questions.map((q, i) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const isTF =
        opts.length === 2 &&
        opts.every((o) =>
          ["true", "false"]
            .includes(String(o.text ?? "").trim().toLowerCase())
        );

      const conf =
        typeof q.confidence_score === "number"
          ? Math.max(0, Math.min(1, q.confidence_score))
          : (q.correct_answers?.length ?? 0) > 0
            ? 0.7
            : 0;
      const noAnswer = !q.correct_answers || q.correct_answers.length === 0;
      const needsReview = conf < CONFIDENCE_THRESHOLD || noAnswer;
      if (needsReview) flagged++;

      return {
        bank_id: bank.id,
        position: i + 1,
        stem: q.stem,
        type: isTF ? "TRUE_FALSE" : "SBA",
        options: q.options,
        correct_answers: q.correct_answers ?? [],
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        reference: q.reference ?? null,
        image_url:
          (q as unknown as { _image_url?: string })._image_url ?? null,
        image_caption:
          (q as unknown as { _image_caption?: string })._image_caption ?? null,
        source_file: sourceFile,
        page_number: q.page_number ?? null,
        marker_type: q.marker_type ?? (noAnswer ? "none" : "unknown"),
        confidence_score: conf,
        needs_review: needsReview,
      };
    });

    if (rows.length > 0) {
      const qResp = await fetch(`${supabaseUrl}/rest/v1/questions`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(rows),
      });
      if (!qResp.ok) {
        const t = await qResp.text();
        throw new Error(`questions insert: ${t}`);
      }
    }

    // Mark log as completed
    if (uploadLogId) {
      await fetch(
        `${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`,
        {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({
            bank_id: bank.id,
            question_count: rows.length,
            flagged_count: flagged,
            processing_status: "completed",
          }),
        }
      );
    }

    return new Response(
      JSON.stringify({
        bankId: bank.id,
        count: rows.length,
        flagged,
        uploadLogId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("extract-mcqs error:", msg);

    if (uploadLogId) {
      await fetch(
        `${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`,
        {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({
            processing_status: "failed",
            error_message: msg.slice(0, 500),
          }),
        }
      ).catch(() => {});
    }

    let status = 500;
    let userMessage = msg;
    if (msg === "RATE_LIMIT") {
      status = 429;
      userMessage = "Rate limit reached. Please try again in a minute.";
    } else if (msg === "PAYMENT_REQUIRED") {
      status = 402;
      userMessage =
        "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage.";
    }
    return new Response(JSON.stringify({ error: userMessage }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
