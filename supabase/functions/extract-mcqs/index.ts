// Phase 3: Extract MCQs from images & PDFs using Gemini Vision.
// - Detects answer markers
// - Generates structured high-yield explanations + textbook references
// - Optionally rewrites scenarios to avoid copyright (preserving concept/answer)
// - Auto-attaches open-license diagrams from Wikimedia Commons w/ source + license
// - Flags low-confidence rows AND questions needing a manual image
//
// Input: {
//   files: { name: string; mimeType: string; data: string /* base64 */ }[],
//   bankTitle: string,
//   subject?: string,
//   rewriteScenario?: boolean
// }
// Output: { bankId, count, flagged, uploadLogId }

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
  references?: string[]; // e.g. ["Gray's Anatomy — Cranial Nerves", "Snell — Cranial Nerves"]
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

const SYSTEM_PROMPT_BASE = `You are an expert medical educator processing MCQ documents (PDFs or photos).

CORE RULES — follow strictly:

1. Maintain the ORIGINAL question sequence. Set page_number per question if you can infer it.
2. Correct OCR errors silently — do NOT change medical meaning.
3. Detect and separate every MCQ. Do not merge or skip.

4. ANSWER MARKER DETECTION — for each question, look for indicators next to one or more options:
   - The word "Correct", "Ans", "Answer", "Key", "(✓)" beside an option
   - Tick marks: ✔ ✓ ☑ · Stars: * ★ ⭐
   - Bold or underlined option text
   - Highlighting (background colour)
   - Circle / box drawn around an option letter
   - Hand-drawn arrows pointing at an option
   Map each marker to the matching option id (a, b, c, d, e). Allow MULTIPLE correct answers if multiple markers exist.
   STRIP marker characters/words from the final option text — output only the clean option text.
   Set marker_type ∈ tick | star | bold | underline | highlight | circle | text | none | unknown.
   If NO marker found, correct_answers = [], marker_type = "none".

5. CONFIDENCE — set confidence_score 0..1:
   - 1.0 clear marker, clean OCR
   - 0.7 marker present but ambiguous
   - 0.4 OCR uncertain
   - 0.0 no marker
   < 0.6 will be flagged for human review.

6. EXPLANATION — MUST be structured and exam-oriented. Use this exact format with section headers:

Why correct:
<one or two precise sentences>

Why others are wrong:
- (a) <reason>
- (b) <reason>
…

Clinical relevance:
<one or two sentences max>

Memory aid (optional):
<a mnemonic or pearl, only if genuinely useful>

Keep total length tight (~120-220 words). No fluff. No diagram description.

7. REFERENCES — return as an array of strings in the "references" field. Only include sources that genuinely support the answer.
   Use ONLY: Gray's Anatomy, Snell's Clinical Neuroanatomy, Moore's Clinically Oriented Anatomy, Bailey & Love, Harrison's Principles of Internal Medicine, Robbins Pathology.
   Format each item as "<Book> — <chapter or topic>". Do NOT fabricate page numbers. Omit references entirely if none clearly apply.

8. DIAGRAM — ALWAYS provide image_query for EVERY question (regardless of subject). Set needs_image=true for every question and produce a precise English Wikimedia-style search term that best illustrates the concept (e.g. "cranial nerve foramina labeled", "ECG anterior STEMI", "nephron diagram labeled", "Streptococcus pneumoniae gram stain", "femoral triangle anatomy"). Prefer anatomy / histology / radiology / pathology / micrograph / ECG / labeled diagram terms. Do NOT describe the diagram in the explanation.

9. NEVER guess answers when there is no marker. Leave correct_answers empty.

Output via the submit_questions function. Be exhaustive — extract EVERY question visible.`;

const REWRITE_ADDENDUM = `

10. COPYRIGHT REWRITE MODE IS ENABLED.
   For every question, REWRITE the clinical scenario into an entirely original vignette:
   - Preserve concept, learning point, difficulty, and the correct answer(s)
   - Change patient age, gender (if possible), setting, presenting numbers, lab values, ethnicity, vocabulary
   - Do NOT reuse phrasing from the source — rewrite from scratch in clean exam-style English
   - Options may be re-ordered or re-worded but the correct option must remain the same medical entity
   - Keep stem length similar to source. No filler.
   This rule does NOT apply to pure factual MCQs without a clinical vignette — clean OCR only for those.`;

async function extractWithGemini(
  files: { mimeType: string; data: string }[],
  rewriteScenario: boolean
): Promise<ExtractedQuestion[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const systemPrompt = rewriteScenario
    ? SYSTEM_PROMPT_BASE + REWRITE_ADDENDUM
    : SYSTEM_PROMPT_BASE;

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: rewriteScenario
        ? "Extract every MCQ. Rewrite each clinical scenario originally per rule 10. Preserve concept and correct answer."
        : "Extract every MCQ from these documents. Detect answer markers carefully.",
    },
  ];
  for (const f of files) {
    const url = `data:${f.mimeType};base64,${f.data}`;
    content.push({ type: "image_url", image_url: { url } });
  }

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_questions",
          description: "Return all extracted MCQs with marker detection, structured explanations, and references.",
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
                    references: {
                      type: "array",
                      items: { type: "string" },
                      description: "Textbook references like \"Gray's Anatomy — Cranial Nerves\".",
                    },
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

interface WikimediaImage {
  url: string;
  descriptionUrl: string;
  license: string; // human-readable, e.g. "CC BY-SA 4.0", "Public domain"
  title: string;
}

const OPEN_LICENSE_REGEX = /(cc[\s-]?by(?:[\s-]?sa)?|creative ?commons|public ?domain|cc0|gfdl)/i;

// Wikimedia Commons API: search files, return first OPEN-licensed result with metadata.
async function searchWikimedia(query: string): Promise<WikimediaImage | null> {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
    url.searchParams.set("gsrlimit", "5");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|extmetadata");
    url.searchParams.set("iiurlwidth", "900");
    url.searchParams.set("iiextmetadatafilter", "LicenseShortName|License|UsageTerms");
    url.searchParams.set("origin", "*");

    const resp = await fetch(url.toString(), {
      headers: { "User-Agent": "MedAI-ExamEngine/1.0 (https://med-learn-craft.lovable.app)" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    type Page = {
      title?: string;
      imageinfo?: {
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        descriptionshorturl?: string;
        extmetadata?: {
          LicenseShortName?: { value?: string };
          License?: { value?: string };
          UsageTerms?: { value?: string };
        };
      }[];
    };

    const candidates = Object.values(pages) as Page[];
    for (const p of candidates) {
      const info = p.imageinfo?.[0];
      if (!info) continue;
      const license =
        info.extmetadata?.LicenseShortName?.value ||
        info.extmetadata?.License?.value ||
        info.extmetadata?.UsageTerms?.value ||
        "";
      if (!OPEN_LICENSE_REGEX.test(license)) continue;
      const fileUrl = info.thumburl || info.url;
      if (!fileUrl) continue;
      return {
        url: fileUrl,
        descriptionUrl:
          info.descriptionurl || info.descriptionshorturl || "https://commons.wikimedia.org",
        license: license.trim(),
        title: (p.title || "").replace(/^File:/, ""),
      };
    }
    return null;
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
    const rewriteScenario = Boolean(payload.rewriteScenario);

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
      `extract-mcqs: ${files.length} file(s) for ${userId} (${fileTypes}) rewrite=${rewriteScenario}`
    );

    const questions = await extractWithGemini(files, rewriteScenario);
    console.log(`extract-mcqs: got ${questions.length} questions`);

    if (uploadLogId) {
      await fetch(`${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({ processing_status: "enriching" }),
      });
    }

    // Enrich EVERY question with an open-license diagram. Search runs for all
    // questions regardless of the rewrite toggle. If no open-licensed image is
    // found, mark needs_image=true so admins can attach manually.
    const imageJobs = questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => {
        // Force-enable image search for every question; fall back to stem keywords
        // when the model didn't supply image_query.
        if (!q.image_query || !q.image_query.trim()) {
          q.image_query = (q.stem || "").replace(/\s+/g, " ").trim().slice(0, 120);
        }
        q.needs_image = true;
        return Boolean(q.image_query);
      });
    await Promise.all(
      imageJobs.map(async ({ q }) => {
        const found = await searchWikimedia(q.image_query!);
        if (found) {
          (q as unknown as { _image: WikimediaImage })._image = found;
        }
      })
    );

    const bankResp = await fetch(`${supabaseUrl}/rest/v1/question_banks`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ owner_id: userId, title: bankTitle, subject }),
    });
    if (!bankResp.ok) throw new Error(`bank insert: ${await bankResp.text()}`);
    const [bank] = await bankResp.json();

    const sourceFile = fileNames.length > 200 ? `${files.length} files` : fileNames;
    let flagged = 0;

    const rows = questions.map((q, i) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const isTF =
        opts.length === 2 &&
        opts.every((o) =>
          ["true", "false"].includes(String(o.text ?? "").trim().toLowerCase())
        );

      const conf =
        typeof q.confidence_score === "number"
          ? Math.max(0, Math.min(1, q.confidence_score))
          : (q.correct_answers?.length ?? 0) > 0
            ? 0.7
            : 0;
      const noAnswer = !q.correct_answers || q.correct_answers.length === 0;
      // Flag if low confidence OR no answer OR an image was needed but not found
      const img = (q as unknown as { _image?: WikimediaImage })._image;
      const needsManualImage = Boolean(q.needs_image && !img);
      const needsReview = conf < CONFIDENCE_THRESHOLD || noAnswer || needsManualImage;
      if (needsReview) flagged++;

      // Caption embeds source + license so we don't need a schema migration
      const caption = img
        ? `${img.title || q.image_query} — Source: Wikimedia Commons (${img.license}) · ${img.descriptionUrl}`
        : null;

      // Reference: join AI-supplied references with newlines
      const referenceText =
        q.references && q.references.length > 0
          ? q.references.filter(Boolean).join("\n")
          : null;

      // Tags: mark questions that need a manual image so admins can find them
      const tags: string[] = [];
      if (needsManualImage) tags.push("needs-image");
      if (rewriteScenario) tags.push("rewritten");

      return {
        bank_id: bank.id,
        position: i + 1,
        stem: q.stem,
        type: isTF ? "TRUE_FALSE" : "SBA",
        options: q.options,
        correct_answers: q.correct_answers ?? [],
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        reference: referenceText,
        image_url: img?.url ?? null,
        image_caption: caption,
        source_file: sourceFile,
        page_number: q.page_number ?? null,
        marker_type: q.marker_type ?? (noAnswer ? "none" : "unknown"),
        confidence_score: conf,
        needs_review: needsReview,
        tags: tags.length ? tags : null,
      };
    });

    if (rows.length > 0) {
      const qResp = await fetch(`${supabaseUrl}/rest/v1/questions`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(rows),
      });
      if (!qResp.ok) throw new Error(`questions insert: ${await qResp.text()}`);
    }

    if (uploadLogId) {
      await fetch(`${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          bank_id: bank.id,
          question_count: rows.length,
          flagged_count: flagged,
          processing_status: "completed",
        }),
      });
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
      await fetch(`${supabaseUrl}/rest/v1/upload_logs?id=eq.${uploadLogId}`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          processing_status: "failed",
          error_message: msg.slice(0, 500),
        }),
      }).catch(() => {});
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
