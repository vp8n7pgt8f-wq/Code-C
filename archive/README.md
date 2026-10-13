# Archive. — 고등학생 오답노트

사진으로 오답을 모으고, Claude가 개념 추출·해설·유사 문제·단원평가를 만들어 주는 웹앱입니다. (2022 개정 교육과정 기준)

```
archive/
├─ index.html                 프론트엔드 (Tailwind CDN, Pretendard, KaTeX 수식)
├─ netlify.toml               Netlify 빌드 설정
├─ package.json               ESM 설정 (의존성 없음)
└─ netlify/functions/ai.js    Claude API 프록시 → /api/ai
```

## 배포 (Netlify)

1. Netlify에서 이 GitHub 레포로 새 사이트를 만듭니다.
2. **Site configuration → Build & deploy → Base directory** 를 `archive` 로 지정합니다.
   (레포 루트에는 기존 영어 단어 앱이 있어서 하위 폴더로 분리했습니다.)
   Build command는 비워 두고, Publish directory는 `archive` (netlify.toml이 자동 지정).
3. **Environment variables** 에 `ANTHROPIC_API_KEY` 를 추가합니다.
4. Deploy. 함수는 `/api/ai` 로 호출됩니다.

로컬 실행: `cd archive && npx netlify dev`

## 기능

| 기능 | 설명 |
| --- | --- |
| 오답 추가 | 과목, 사진, 개념 태그, 틀린 이유, 난이도(1~5), 메모 |
| AI 분석 | 사진 업로드 후 "AI로 개념 자동 추출" → 개념 태그·난이도 자동 입력 |
| AI 해설 | 오답 탭 → 힌트 1 → 힌트 2 → 해설 → 정답 순서로 단계 공개 (결과는 저장되어 재호출 안 함) |
| 유사 문제 | 같은 개념의 5지선다 3문제, 고르면 바로 채점 |
| 단원평가 | 과목별 오답(덜 복습한 것 우선)을 바탕으로 5문항 시험지 생성 → 채점 |
| 과목 관리 | 추가 / 이름·색 편집(기존 오답에도 반영) / 삭제(해당 오답도 삭제) |
| 저장 | localStorage (`archive.notes.v1`, `archive.subjects.v1`) |

### 데이터 구조

```json
{
  "id": "…",
  "subject": "공통수학",
  "concept_tag": "판별식, 이차방정식의 근",
  "pattern": "계산 실수",
  "memo": "",
  "image_url": "data:image/jpeg;base64,…",
  "difficulty": 3,
  "attempt_count": 0,
  "created_at": "2026-10-13T00:00:00.000Z",
  "ai_explain": { "…": "AI 해설 캐시 (선택)" },
  "ai_similar": [ "유사 문제 캐시 (선택)" ]
}
```

## AI 함수 (`/api/ai`)

`POST { action, ... }` → `{ ok: true, data }`

| action | 입력 | 출력(JSON) |
| --- | --- | --- |
| `analyze` | `image`, `subject` | `subject, unit, concept_tags[], difficulty, problem_summary` |
| `explain` | `note`, `image?` | `problem_summary, concepts[], hint, hint2, explanation, answer, key_point` |
| `similar` | `note`, `image?`, `count` | `problems[{question, choices[5], answer, explanation}]` |
| `exam` | `subject`, `notes[]` | `title, questions[5]{concept, question, choices[5], answer, explanation}` |

- 모델: `claude-sonnet-4-5`, 이미지는 base64(data URL)로 전달
- 프롬프트는 2022 개정 교육과정 기준, JSON 객체만 반환하도록 지시하고 서버에서 한 번 더 JSON만 추출합니다.

## 참고

- 사진은 업로드할 때 최대 1280px JPEG로 줄여 저장합니다. localStorage는 보통 5MB 정도라 사진 오답은 대략 30~60개가 한계입니다. 꽉 차면 저장 실패 안내가 뜹니다.
- 단원평가 생성은 15~30초 걸릴 수 있습니다. Netlify 함수 실행 시간 제한에 걸리면(504) 다시 시도하거나 플랜의 함수 타임아웃을 늘려 주세요.
