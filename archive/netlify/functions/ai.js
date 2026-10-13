// Archive. — Claude API 프록시
// POST /api/ai  { action: "analyze" | "explain" | "similar" | "exam", ...payload }
// 응답: { ok: true, data: {...} }  또는  { ok: false, error: "..." }

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

const BASE_SYSTEM = `당신은 대한민국 고등학교 교사이자 입시 전문가입니다.
- 모든 내용은 2022 개정 교육과정(고등학교 공통·일반·진로 선택 과목) 기준으로 작성합니다.
- 교육과정 밖의 개념이나 풀이법은 사용하지 않습니다.
- 수식은 LaTeX로 쓰고 인라인은 $...$, 블록은 $$...$$ 로 감쌉니다.
- 반드시 요청한 스키마의 JSON 객체 하나만 출력합니다. 설명 문장, 마크다운 코드블록, 주석을 JSON 밖에 쓰지 않습니다.
- 모든 문자열은 한국어로 작성합니다.`;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

// "data:image/jpeg;base64,...." → Claude image block
function imageBlock(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

function noteContext(n = {}) {
  return [
    `과목: ${n.subject || "미지정"}`,
    `개념 태그: ${n.concept_tag || "없음"}`,
    `틀린 이유: ${n.pattern || "없음"}`,
    `난이도(1~5): ${n.difficulty ?? "미지정"}`,
    `학생 메모: ${n.memo || "없음"}`,
  ].join("\n");
}

const PROMPTS = {
  analyze: (p) => ({
    maxTokens: 1024,
    text: `첨부한 사진은 고등학생이 틀린 문제입니다. 과목 힌트: ${p.subject || "없음"}
문제를 읽고 핵심 개념을 추출하세요.

스키마:
{
  "subject": "과목명 (예: 공통수학1, 통합과학1, 공통국어1 등 2022 개정 과목명)",
  "unit": "대단원 > 중단원",
  "concept_tags": ["핵심 개념 1~4개, 짧은 명사구"],
  "difficulty": 1~5 정수,
  "problem_summary": "문제 내용 한두 문장 요약"
}`,
  }),

  explain: (p) => ({
    maxTokens: 2048,
    text: `다음은 학생의 오답 기록입니다. ${p.image ? "첨부한 사진이 원래 문제입니다." : "사진이 없으므로 기록만 보고 해당 개념의 대표 문제를 기준으로 설명하세요."}

${noteContext(p.note)}

학생이 스스로 다시 풀 수 있도록 힌트 → 해설 → 정답 순서로 단계적으로 공개할 내용을 만드세요.
힌트는 정답을 직접 말하지 않고 출발점만 짚어 주세요. 해설은 학생의 "틀린 이유"를 고려해 주의할 점을 포함하세요.

스키마:
{
  "problem_summary": "문제 요약 (사진이 없으면 다루는 개념 요약)",
  "concepts": ["관련 개념"],
  "hint": "첫 번째 힌트",
  "hint2": "조금 더 구체적인 두 번째 힌트",
  "explanation": "단계별 풀이 해설 (줄바꿈은 \\n)",
  "answer": "최종 정답",
  "key_point": "다음에 같은 실수를 하지 않기 위한 한 줄 포인트"
}`,
  }),

  similar: (p) => ({
    maxTokens: 3000,
    text: `다음 오답과 같은 개념을 묻는 유사 문제 ${p.count || 3}개를 만드세요. ${p.image ? "첨부한 사진이 원래 문제입니다." : ""}
숫자·상황·묻는 방식을 바꾸고, 난이도는 원래 문제와 비슷하게 하되 마지막 문제는 한 단계 어렵게 하세요.
모두 5지선다형으로 만들고, 정답은 반드시 하나이며 계산이 맞는지 스스로 검산하세요.

${noteContext(p.note)}

스키마:
{
  "problems": [
    {
      "question": "문제 본문",
      "choices": ["①번 내용", "②번 내용", "③번 내용", "④번 내용", "⑤번 내용"],
      "answer": 0~4 정수 (choices 인덱스),
      "explanation": "간단한 풀이"
    }
  ]
}`,
  }),

  exam: (p) => {
    const notes = (p.notes || [])
      .slice(0, 30)
      .map(
        (n, i) =>
          `${i + 1}. [${n.subject}] 개념: ${n.concept_tag || "-"} / 틀린 이유: ${n.pattern || "-"} / 난이도 ${n.difficulty ?? "-"} / 다시 푼 횟수 ${n.attempt_count ?? 0}${n.memo ? ` / 메모: ${n.memo}` : ""}`
      )
      .join("\n");
    return {
      maxTokens: 4096,
      text: `학생의 오답 기록을 바탕으로 맞춤형 단원평가 시험지를 만드세요.
과목: ${p.subject || "전체"}

오답 기록:
${notes || "(기록 없음 — 해당 과목의 핵심 단원으로 출제)"}

규칙:
- 정확히 5문항, 모두 5지선다형.
- 자주 틀린 개념과 다시 푼 횟수가 적은 개념을 우선 출제.
- 난이도는 쉬운 문제부터 어려운 문제 순으로 배치.
- 2022 개정 교육과정 범위 안에서만 출제하고, 정답은 반드시 하나이며 검산할 것.

스키마:
{
  "title": "시험지 제목",
  "questions": [
    {
      "concept": "출제 개념",
      "question": "문제 본문",
      "choices": ["①", "②", "③", "④", "⑤"],
      "answer": 0~4 정수 (choices 인덱스),
      "explanation": "풀이"
    }
  ]
}`,
    };
  },
};

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST만 허용됩니다." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { ok: false, error: "ANTHROPIC_API_KEY 환경변수가 없습니다." });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "잘못된 요청 본문입니다." });
  }

  const build = PROMPTS[body.action];
  if (!build) return json(400, { ok: false, error: `알 수 없는 action: ${body.action}` });
  if (body.action === "analyze" && !body.image) {
    return json(400, { ok: false, error: "분석할 사진이 없습니다." });
  }

  const { text, maxTokens } = build(body);
  const content = [];
  const img = imageBlock(body.image);
  if (img) content.push(img);
  content.push({ type: "text", text });

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: BASE_SYSTEM,
        messages: [{ role: "user", content }],
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      return json(res.status, { ok: false, error: result?.error?.message || "Claude API 오류" });
    }

    const out = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return json(200, { ok: true, data: extractJson(out) });
  } catch (err) {
    return json(502, { ok: false, error: err.message || "AI 요청 실패" });
  }
};

export const config = { path: "/api/ai" };
