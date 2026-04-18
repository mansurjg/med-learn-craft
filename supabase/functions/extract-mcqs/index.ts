// Extract MCQs from uploaded images/PDFs using Gemini Vision and enrich with images.
// Input: { images: string[] (data URLs or https URLs), bankTitle: string, subject?: string }
// Output: { bankId: string, count: number }

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
  needs_image?: boolean;
  image_query?: string;
}

const SYSTEM_PROMPT = `You are an expert medical educator. From the provided images of medical MCQs, extract every question with perfect formatting. Use proper medical terminology. For each question include: stem, 4-5 options labeled A-E, correct answer letter(s), a concise high-yield explanation, and difficulty (easy/medium/hard). If the question references anatomy, histology, radiology, ECG, pathology slide or any visual concept, set needs_image=true and provide a specific image_query (e.g. "human heart anatomy labeled chambers", "normal ECG sinus rhythm", "gram positive cocci microscopy"). Be exhaustive — extract ALL questions visible.`;

async function extractWithGemini(images: string[]): Promise<ExtractedQuestion[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: "Extract every MCQ from these images." },
  ];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: img } });
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
          description: "Return all extracted MCQs.",
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

// Wikimedia Commons image search — returns thumbnail URL or null
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const userId = userData.id as string;

    const { images, bankTitle, subject } = await req.json();
    if (!Array.isArray(images) || images.length === 0 || !bankTitle) {
      return new Response(
        JSON.stringify({ error: "Missing images or bankTitle" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Extracting MCQs from ${images.length} image(s) for user ${userId}`);
    const questions = await extractWithGemini(images);
    console.log(`Got ${questions.length} questions from Gemini`);

    // Enrich with images (Wikimedia)
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

    // Insert via admin client
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const bankResp = await fetch(`${supabaseUrl}/rest/v1/question_banks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        owner_id: userId,
        title: bankTitle,
        subject: subject ?? null,
      }),
    });
    if (!bankResp.ok) {
      const t = await bankResp.text();
      throw new Error(`bank insert: ${t}`);
    }
    const [bank] = await bankResp.json();

    const rows = questions.map((q, i) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const isTF =
        opts.length === 2 &&
        opts.every((o) =>
          ["true", "false"].includes(String(o.text ?? "").trim().toLowerCase())
        );
      return {
        bank_id: bank.id,
        position: i + 1,
        stem: q.stem,
        type: isTF ? "TRUE_FALSE" : "SBA",
        options: q.options,
        correct_answers: q.correct_answers,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        reference: q.reference ?? null,
        image_url:
          (q as unknown as { _image_url?: string })._image_url ?? null,
        image_caption:
          (q as unknown as { _image_caption?: string })._image_caption ?? null,
      };
    });

    const qResp = await fetch(`${supabaseUrl}/rest/v1/questions`, {
      method: "POST",
      headers,
      body: JSON.stringify(rows),
    });
    if (!qResp.ok) {
      const t = await qResp.text();
      throw new Error(`questions insert: ${t}`);
    }

    return new Response(
      JSON.stringify({ bankId: bank.id, count: rows.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("extract-mcqs error:", msg);
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
