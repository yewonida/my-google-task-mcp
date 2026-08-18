# Google Tasks MCP 서버 — 설치/실행

`src/` 에 있는 MCP 서버(Node.js/TypeScript, stdio 전송)를 빌드하고 연결하는 방법입니다.

## 1. 의존성 설치 & 빌드

```bash
npm install
npm run build      # src/ -> dist/ (TypeScript 컴파일)
```

## 2. 액세스 토큰 준비

Google Cloud 프로젝트 생성 불필요.

1. <https://developers.google.com/oauthplayground> 접속
2. 왼쪽 목록에서 **Google Tasks API v1** 펼치기 → `https://www.googleapis.com/auth/tasks` 체크
3. **Authorize APIs** → 구글 로그인 → 허용
4. **Exchange authorization code for tokens** → **Access token** 복사

> ⚠️ 유효기간 1시간. 만료되면 위 과정을 반복해 새 토큰을 발급받으세요.

로컬에서 직접 실행/테스트할 때는 `.env.example` 을 복사해 `.env` 로 저장하고 토큰을 채워 넣습니다 (`.env` 는 git에 커밋되지 않습니다).

```bash
cp .env.example .env
# .env 파일을 열어 GOOGLE_TASKS_ACCESS_TOKEN= 뒤에 토큰 붙여넣기
```

## 3. 단독 실행 확인

```bash
npm start
# "Google Tasks MCP 서버가 stdio 로 실행 중입니다." 가 stderr 에 출력되면 정상
```

MCP Inspector 로 도구 목록/호출을 직접 확인하려면:

```bash
npx @modelcontextprotocol/inspector --cli node dist/index.js \
  --method tools/list \
  -e GOOGLE_TASKS_ACCESS_TOKEN=<발급받은 토큰>
```

## 4. 에이전트에 전역으로 연결

```bash
claude mcp add google-tasks --scope user \
  -e GOOGLE_TASKS_ACCESS_TOKEN=<발급받은 토큰> \
  -- node <이 저장소의 절대 경로>/dist/index.js
```

등록 후 **새 세션**을 열고 `/mcp` 로 `google-tasks` 서버와 도구 4개
(`create_tasklist`, `list_tasklists`, `add_task`, `list_tasks`)가 보이는지 확인하세요.

## 5. 제공하는 도구

| 도구 | 입력 |
|---|---|
| `create_tasklist` | `title` |
| `list_tasklists` | (없음) |
| `add_task` | `tasklist_id`, `title`, `notes?`, `due?`, `parent_task_id?` |
| `list_tasks` | `tasklist_id`, `due_min?`, `due_max?`, `show_completed?` |

인증 실패(401)가 나오면 토큰이 만료된 것이니 2단계를 반복해 새 토큰을 발급받고,
`claude mcp add` 로 다시 등록하거나 `.env` 를 갱신한 뒤 서버를 재시작하세요.
