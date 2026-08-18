import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatApiError, googleTasksRequest } from "../google-tasks-client.js";
import { formatTaskLine, joinWithLimit, toRfc3339, toStructuredTask } from "../format.js";
import type { Task, TasksListResponse } from "../types.js";

/** list_tasks 가 내부적으로 페이지를 넘기며 가져올 최대 개수 (안전장치). */
const MAX_TASKS = 500;

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    "add_task",
    {
      title: "Add Task",
      description: `지정한 할일 목록에 새 할일(task)을 추가합니다.

parent_task_id 를 주면 그 할일의 "하위 할일(subtask)"로 만들어집니다. 생략하면 목록의
최상위(top-level) 할일로 추가됩니다.

Args:
  - tasklist_id (string, 필수): 할일을 추가할 목록의 id. list_tasklists 로 조회한 id 값.
  - title (string, 필수): 할일 제목. 1~1024자.
  - notes (string, 선택): 할일에 대한 설명/메모. 최대 8192자.
  - due (string, 선택): 마감일. "YYYY-MM-DD" 형식(예: "2026-08-19") 또는 RFC 3339
    타임스탬프. Google Tasks 는 날짜 정보만 저장하고 시간 부분은 무시합니다 — 즉 몇 시로
    입력하든 "그 날짜에 마감"으로만 기록됩니다.
  - parent_task_id (string, 선택): 이 값을 주면 지정한 할일의 하위 할일로 생성됩니다.
    최상위 할일로 만들려면 생략하세요.

Returns:
  생성된 할일 정보를 담은 텍스트와 구조화된 데이터:
  {
    "id": string, "title": string, "status": "needsAction" | "completed",
    "notes": string | undefined, "due": string | undefined, "parent": string | undefined
  }

Examples:
  - "내일 병원 예약 넣어줘" -> tasklist_id=<대상 목록 id>, title="병원 예약", due="2026-08-19"
  - "'장보기' 밑에 '우유 사기' 하위 할일 추가" -> parent_task_id=<'장보기' 할일 id>, title="우유 사기"

Error Handling:
  - tasklist_id 또는 parent_task_id 가 잘못되면 404 에러 메시지를 반환합니다.
  - due 형식이 잘못되면 API 호출 전에 형식 오류 메시지를 반환합니다.
  - GOOGLE_TASKS_ACCESS_TOKEN 이 없거나 만료된 경우 401 에러 메시지를 반환합니다.`,
      inputSchema: {
        tasklist_id: z
          .string()
          .min(1, "tasklist_id 는 비어 있을 수 없습니다.")
          .describe("할일을 추가할 목록의 id (list_tasklists 로 조회)"),
        title: z
          .string()
          .min(1, "title은 비어 있을 수 없습니다.")
          .max(1024, "title은 1024자를 넘을 수 없습니다.")
          .describe("할일 제목"),
        notes: z
          .string()
          .max(8192, "notes 는 8192자를 넘을 수 없습니다.")
          .optional()
          .describe("할일에 대한 설명/메모 (선택)"),
        due: z
          .string()
          .optional()
          .describe(
            '마감일. "YYYY-MM-DD" 형식(예: "2026-08-19") 또는 RFC 3339 타임스탬프. ' +
              "시간 부분은 Google Tasks 가 저장하지 않고 날짜만 사용합니다."
          ),
        parent_task_id: z
          .string()
          .optional()
          .describe("이 값을 주면 지정한 할일의 하위 할일로 생성됩니다. 생략하면 최상위 할일이 됩니다."),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        status: z.enum(["needsAction", "completed"]),
        notes: z.string().optional(),
        due: z.string().optional(),
        parent: z.string().optional(),
      },
      annotations: {
        title: "Add Task",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ tasklist_id, title, notes, due, parent_task_id }) => {
      try {
        const body: Record<string, unknown> = { title };
        if (notes !== undefined) body.notes = notes;
        if (due !== undefined) body.due = toRfc3339(due);

        const created = await googleTasksRequest<Task>(
          `/lists/${encodeURIComponent(tasklist_id)}/tasks`,
          {
            method: "POST",
            query: { parent: parent_task_id },
            body,
          }
        );

        const lines = [
          "할일을 추가했습니다.",
          `- 제목: ${created.title}`,
          `- id: ${created.id}`,
          created.due ? `- 마감일: ${created.due.slice(0, 10)}` : undefined,
          created.parent ? `- 상위 할일 id: ${created.parent}` : undefined,
        ].filter((line): line is string => line !== undefined);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: toStructuredTask(created),
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatApiError(error) }] };
      }
    }
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description: `지정한 할일 목록 안의 할일(task)들을 조회합니다.

기본적으로 Google Tasks API 와 동일하게 완료된 할일도 포함해서 보여줍니다
(show_completed 기본값 true). 여러 페이지가 있으면 서버가 자동으로 이어붙여서
최대 ${MAX_TASKS}개까지 반환합니다.

Args:
  - tasklist_id (string, 필수): 조회할 목록의 id. list_tasklists 로 조회한 id 값.
  - due_min (string, 선택): 이 날짜/시각 이후에 마감인 할일만 포함. "YYYY-MM-DD" 또는
    RFC 3339. 날짜만 주면 그 날의 00:00:00 부터로 계산합니다.
  - due_max (string, 선택): 이 날짜/시각 이전에 마감인 할일만 포함. "YYYY-MM-DD" 또는
    RFC 3339. 날짜만 주면 그 날짜까지(포함)로 계산합니다 (Google Tasks API의 dueMax가
    미포함 경계라 내부적으로는 다음 날 자정을 기준으로 넘깁니다).
  - show_completed (boolean, 선택): 완료된 할일 포함 여부. 기본값 true. false 로 주면
    미완료(needsAction) 할일만 반환합니다. true 로 주면 "완료된 항목 지우기"로 숨겨진
    할일까지 함께 반환합니다.

Returns:
  할일 목록을 나열한 텍스트와 구조화된 데이터:
  {
    "tasklist_id": string,
    "total": number,           // 조건에 맞는 전체 할일 개수
    "truncated": boolean,      // 응답 길이 제한으로 일부만 담았는지 여부
    "tasks": [
      {
        "id": string, "title": string, "status": "needsAction" | "completed",
        "notes": string | undefined, "due": string | undefined,
        "completed": string | undefined, "parent": string | undefined
      }
    ]
  }
  조건에 맞는 할일이 없으면 tasks 는 빈 배열입니다.

Examples:
  - "이번 주 할일 목록 보여줘" -> tasklist_id=<대상 목록 id>, due_min="2026-08-18", due_max="2026-08-24"
  - "아직 안 끝난 할일만 보여줘" -> tasklist_id=<대상 목록 id>, show_completed=false

Error Handling:
  - tasklist_id 가 잘못되면 404 에러 메시지를 반환합니다.
  - due_min/due_max 형식이 잘못되면 API 호출 전에 형식 오류 메시지를 반환합니다.
  - GOOGLE_TASKS_ACCESS_TOKEN 이 없거나 만료된 경우 401 에러 메시지를 반환합니다.`,
      inputSchema: {
        tasklist_id: z
          .string()
          .min(1, "tasklist_id 는 비어 있을 수 없습니다.")
          .describe("조회할 목록의 id (list_tasklists 로 조회)"),
        due_min: z
          .string()
          .optional()
          .describe('이 날짜/시각 이후에 마감인 할일만 포함. "YYYY-MM-DD" 또는 RFC 3339'),
        due_max: z
          .string()
          .optional()
          .describe(
            '이 날짜/시각 이전에 마감인 할일만 포함(날짜만 주면 그 날짜까지 포함). "YYYY-MM-DD" 또는 RFC 3339'
          ),
        show_completed: z
          .boolean()
          .optional()
          .describe("완료된 할일 포함 여부 (기본값: true, Google Tasks API 기본 동작과 동일)"),
      },
      outputSchema: {
        tasklist_id: z.string(),
        total: z.number(),
        truncated: z.boolean(),
        tasks: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            status: z.enum(["needsAction", "completed"]),
            notes: z.string().optional(),
            due: z.string().optional(),
            completed: z.string().optional(),
            parent: z.string().optional(),
          })
        ),
      },
      annotations: {
        title: "List Tasks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tasklist_id, due_min, due_max, show_completed }) => {
      try {
        const dueMin = due_min !== undefined ? toRfc3339(due_min, "start") : undefined;
        const dueMax = due_max !== undefined ? toRfc3339(due_max, "end") : undefined;

        const items: Task[] = [];
        let pageToken: string | undefined;
        do {
          const page = await googleTasksRequest<TasksListResponse>(
            `/lists/${encodeURIComponent(tasklist_id)}/tasks`,
            {
              query: {
                dueMin,
                dueMax,
                showCompleted: show_completed,
                // 완료 후 "완료된 항목 지우기"로 숨겨진 할일도 show_completed 와 함께 보이게 맞춘다.
                showHidden: show_completed,
                maxResults: 100,
                pageToken,
              },
            }
          );
          items.push(...(page.items ?? []));
          pageToken = page.nextPageToken;
        } while (pageToken && items.length < MAX_TASKS);

        if (items.length === 0) {
          return {
            content: [{ type: "text", text: `목록(${tasklist_id})에 조건에 맞는 할일이 없습니다.` }],
            structuredContent: { tasklist_id, total: 0, truncated: false, tasks: [] },
          };
        }

        const itemLines = items.map(formatTaskLine);
        const { text, truncated, shownCount } = joinWithLimit(`할일 (${items.length}개):`, itemLines);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            tasklist_id,
            total: items.length,
            truncated,
            tasks: items.slice(0, shownCount).map(toStructuredTask),
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatApiError(error) }] };
      }
    }
  );
}
