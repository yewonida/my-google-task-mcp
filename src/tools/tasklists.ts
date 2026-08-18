import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatApiError, googleTasksRequest } from "../google-tasks-client.js";
import { joinWithLimit } from "../format.js";
import type { TaskList, TaskListsListResponse } from "../types.js";

/** list_tasklists 가 내부적으로 페이지를 넘기며 가져올 최대 개수. */
const MAX_TASKLISTS = 1000;

export function registerTasklistTools(server: McpServer): void {
  server.registerTool(
    "create_tasklist",
    {
      title: "Create Task List",
      description: `새 Google 할일 목록(task list)을 만듭니다.

이 도구는 개별 할일이 아니라, 할일들을 담는 "목록" 자체를 새로 만듭니다. 만든 목록의 id는
이후 add_task, list_tasks 를 호출할 때 tasklist_id 로 사용해야 합니다.

Args:
  - title (string, 필수): 새로 만들 목록의 제목. 1~1024자.

Returns:
  생성된 목록 정보를 담은 텍스트와 구조화된 데이터:
  { "id": string, "title": string, "updated": string }

Examples:
  - "이번 주 할일" 이라는 이름으로 새 목록 만들기 -> title="이번 주 할일"
  - "장보기" 목록 만들기 -> title="장보기"

Error Handling:
  - GOOGLE_TASKS_ACCESS_TOKEN 이 없거나 만료된 경우 401 에러 메시지를 반환합니다.
  - 스코프(https://www.googleapis.com/auth/tasks)가 없으면 403 에러 메시지를 반환합니다.`,
      inputSchema: {
        title: z
          .string()
          .min(1, "title은 비어 있을 수 없습니다.")
          .max(1024, "title은 1024자를 넘을 수 없습니다.")
          .describe("새로 만들 할일 목록의 제목"),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        updated: z.string().optional(),
      },
      annotations: {
        title: "Create Task List",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title }) => {
      try {
        const created = await googleTasksRequest<TaskList>("/users/@me/lists", {
          method: "POST",
          body: { title },
        });

        const text = `할일 목록을 만들었습니다.\n- 제목: ${created.title}\n- id: ${created.id}`;
        const structuredContent = {
          id: created.id,
          title: created.title,
          updated: created.updated,
        };

        return {
          content: [{ type: "text", text }],
          structuredContent,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatApiError(error) }] };
      }
    }
  );

  server.registerTool(
    "list_tasklists",
    {
      title: "List Task Lists",
      description: `내 Google 할일 목록(task list)들을 모두 조회합니다.

입력 인자가 없습니다. 여러 개의 목록이 있으면 API 가 나눠주는 페이지를 서버가 자동으로
이어붙여서 최대 ${MAX_TASKLISTS}개까지 한 번에 반환합니다.

Returns:
  목록들을 나열한 텍스트와 구조화된 데이터:
  {
    "total": number,           // 전체 목록 개수
    "truncated": boolean,      // 응답 길이 제한으로 일부만 담았는지 여부
    "tasklists": [
      { "id": string, "title": string, "updated": string }
    ]
  }
  목록이 하나도 없으면 tasklists 는 빈 배열입니다.

Examples:
  - "내 할일 목록들 보여줘" -> 인자 없이 호출

Error Handling:
  - GOOGLE_TASKS_ACCESS_TOKEN 이 없거나 만료된 경우 401 에러 메시지를 반환합니다.`,
      outputSchema: {
        total: z.number(),
        truncated: z.boolean(),
        tasklists: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            updated: z.string().optional(),
          })
        ),
      },
      annotations: {
        title: "List Task Lists",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const items: TaskList[] = [];
        let pageToken: string | undefined;
        do {
          const page = await googleTasksRequest<TaskListsListResponse>("/users/@me/lists", {
            query: { maxResults: 100, pageToken },
          });
          items.push(...(page.items ?? []));
          pageToken = page.nextPageToken;
        } while (pageToken && items.length < MAX_TASKLISTS);

        if (items.length === 0) {
          return {
            content: [{ type: "text", text: "할일 목록이 하나도 없습니다. create_tasklist 로 먼저 만들어 보세요." }],
            structuredContent: { total: 0, truncated: false, tasklists: [] },
          };
        }

        const itemLines = items.map((l) => `- ${l.title} — id: ${l.id}`);
        const { text, truncated, shownCount } = joinWithLimit(`할일 목록 (${items.length}개):`, itemLines);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            total: items.length,
            truncated,
            tasklists: items.slice(0, shownCount).map((list) => ({
              id: list.id,
              title: list.title,
              updated: list.updated,
            })),
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatApiError(error) }] };
      }
    }
  );
}
