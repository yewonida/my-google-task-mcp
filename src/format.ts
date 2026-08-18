import { CHARACTER_LIMIT } from "./constants.js";
import type { Task } from "./types.js";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 사용자가 입력한 날짜 문자열을 Google Tasks API가 요구하는 RFC 3339 타임스탬프로 바꾼다.
 *
 * Google Tasks 의 due 는 "날짜"만 의미가 있고 시간 부분은 무시된다 — 항상 그 날짜의
 * T00:00:00.000Z 로 저장된다
 * (https://developers.google.com/workspace/tasks/reference/rest/v1/tasks 의 due 필드 설명).
 *
 * dueMin/dueMax 로 걸러낼 때는 실제 API 동작을 직접 확인해서 반영했다: dueMin 은 포함(>=)이지만
 * dueMax 는 **미포함(<)** 경계다 — 문서에는 명시되어 있지 않지만, dueMax 를 같은 날짜의
 * 23:59:59.999Z 로 줘도 그 날짜 자정(T00:00:00.000Z)에 마감인 할일이 걸러진다. 그래서
 * "due_max=이 날짜까지 포함"을 만들려면 dueMax 를 "다음 날 자정"으로 잡아야 한다.
 *
 * "YYYY-MM-DD" 처럼 날짜만 들어오면 이 경계 규칙에 맞게 채워서 RFC 3339 로 만들고,
 * 이미 RFC 3339 타임스탬프가 들어오면 그대로 정규화해서 돌려준다.
 *
 * @param boundary 날짜만 주어졌을 때 하루의 시작("start", 기본값, dueMin/due 에 사용)으로
 *                 채울지, 다음 날의 시작("end", dueMax 에 사용 — "이 날짜까지 포함"이 되도록)으로
 *                 채울지.
 */
export function toRfc3339(input: string, boundary: "start" | "end" = "start"): string {
  const trimmed = input.trim();

  if (DATE_ONLY_RE.test(trimmed)) {
    if (boundary === "start") {
      return `${trimmed}T00:00:00.000Z`;
    }
    // "end": dueMax 가 미포함(<) 경계이므로, 이 날짜까지 포함시키려면 다음 날 자정을 넘겨야 한다.
    const nextDay = new Date(`${trimmed}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return nextDay.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `날짜 형식이 올바르지 않습니다: "${input}". "YYYY-MM-DD" 형식(예: 2026-08-19) 또는 ` +
        `RFC 3339 타임스탬프(예: 2026-08-19T00:00:00.000Z)를 사용하세요.`
    );
  }
  return parsed.toISOString();
}

/** 목록 안에서 사람이 읽기 좋은 한 줄로 할일을 표시한다. */
export function formatTaskLine(task: Task): string {
  const checkbox = task.status === "completed" ? "[x]" : "[ ]";
  const due = task.due ? ` (마감: ${task.due.slice(0, 10)})` : "";
  const parentTag = task.parent ? " (하위 할일)" : "";
  return `- ${checkbox} ${task.title}${due}${parentTag} — id: ${task.id}`;
}

/**
 * 헤더 + 항목 줄들을 CHARACTER_LIMIT 안에 들어오는 만큼만 이어붙인다.
 * 다 담지 못하면 안내 문구를 덧붙이고, 실제로 몇 개를 담았는지 shownCount 로 알려준다
 * (structuredContent 를 같은 개수로 잘라내는 데 쓴다).
 */
export function joinWithLimit(
  header: string,
  itemLines: string[],
  limit: number = CHARACTER_LIMIT
): { text: string; truncated: boolean; shownCount: number } {
  const lines = [header];
  let length = header.length;
  let shownCount = 0;

  for (const line of itemLines) {
    const addedLength = line.length + 1; // +1: 줄바꿈
    if (length + addedLength > limit) break;
    lines.push(line);
    length += addedLength;
    shownCount++;
  }

  const truncated = shownCount < itemLines.length;
  if (truncated) {
    lines.push(
      `\n... 응답 길이 제한(${limit}자)으로 ${itemLines.length - shownCount}개 항목을 더 표시하지 못했습니다. ` +
        "더 구체적인 조건으로 다시 조회해 보세요."
    );
  }

  return { text: lines.join("\n"), truncated, shownCount };
}

/** structuredContent 에 넣을 Task 의 축약된 형태. */
export function toStructuredTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    notes: task.notes,
    due: task.due,
    completed: task.completed,
    parent: task.parent,
  };
}
