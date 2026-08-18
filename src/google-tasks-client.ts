/**
 * Google Tasks API v1 에 대한 얇은 HTTP 클라이언트.
 *
 * 인증은 환경 변수 GOOGLE_TASKS_ACCESS_TOKEN 하나로 처리한다 (OAuth Playground 발급,
 * 유효기간 1시간). Google Cloud 프로젝트/클라이언트 등록이 필요 없는 실습이라
 * 리프레시 토큰을 이용한 자동 갱신은 구현하지 않는다 — 만료되면 사용자가 새 토큰을
 * 발급받아 환경 변수를 갱신해야 한다 (formatApiError 의 401 메시지 참고).
 */

const API_BASE_URL = "https://tasks.googleapis.com/tasks/v1";

/** 쿼리 파라미터로 넘길 수 있는 값. undefined 는 파라미터 자체를 생략한다. */
type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  query?: Record<string, QueryValue>;
  body?: unknown;
}

/** Google Tasks API가 에러 상태 코드를 응답했을 때 던지는 에러. */
export class GoogleTasksApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(`Google Tasks API error ${status} ${statusText}: ${body}`);
    this.name = "GoogleTasksApiError";
  }
}

function getAccessToken(): string {
  const token = process.env.GOOGLE_TASKS_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "GOOGLE_TASKS_ACCESS_TOKEN 환경 변수가 설정되어 있지 않습니다. " +
        "https://developers.google.com/oauthplayground 에서 'Google Tasks API v1' > " +
        "https://www.googleapis.com/auth/tasks 스코프로 액세스 토큰을 발급받아 설정하세요."
    );
  }
  return token;
}

/**
 * Google Tasks API 에 인증된 요청을 보낸다.
 *
 * @param path API_BASE_URL 뒤에 붙는 경로. 예: "/users/@me/lists"
 */
export async function googleTasksRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = getAccessToken();
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new Error(
      `Google Tasks API 에 연결하지 못했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const rawBody = await response.text();

  if (!response.ok) {
    throw new GoogleTasksApiError(response.status, response.statusText, rawBody);
  }

  if (!rawBody) {
    return {} as T;
  }

  return JSON.parse(rawBody) as T;
}

/** API/입력 오류를 도구 응답에 그대로 보여줄 수 있는 사람이 읽을 메시지로 바꾼다. */
export function formatApiError(error: unknown): string {
  if (error instanceof GoogleTasksApiError) {
    switch (error.status) {
      case 401:
        return (
          "Error: 인증에 실패했습니다 (401). GOOGLE_TASKS_ACCESS_TOKEN 이 없거나 만료되었을 " +
          "가능성이 높습니다 (액세스 토큰 유효기간은 1시간입니다). " +
          "https://developers.google.com/oauthplayground 에서 새 액세스 토큰을 발급받아 " +
          "환경 변수를 갱신한 뒤 MCP 서버를 재시작하세요."
        );
      case 403:
        return (
          "Error: 권한이 거부되었습니다 (403). 토큰을 발급받을 때 " +
          "'https://www.googleapis.com/auth/tasks' 스코프를 체크했는지 확인하세요."
        );
      case 404:
        return (
          "Error: 대상을 찾을 수 없습니다 (404). tasklist_id 또는 parent_task_id 값이 " +
          "올바른지 확인하세요 (list_tasklists / list_tasks 로 정확한 id 를 다시 조회해 보세요)."
        );
      case 429:
        return "Error: 요청 한도를 초과했습니다 (429). 잠시 후 다시 시도하세요.";
      default:
        return `Error: Google Tasks API 요청이 실패했습니다 (${error.status} ${error.statusText}). ${error.body}`;
    }
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: 알 수 없는 오류가 발생했습니다 (${String(error)}).`;
}
