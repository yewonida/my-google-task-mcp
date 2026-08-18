/**
 * Google Tasks API v1 리소스 타입 정의.
 *
 * 참고: https://developers.google.com/workspace/tasks/reference/rest/v1/tasks
 *       https://developers.google.com/workspace/tasks/reference/rest/v1/tasklists
 *
 * API가 실제로 돌려주는 필드는 이보다 많지만(selfLink, links[] 등),
 * 이 서버가 사용하는 필드만 선언한다.
 */

/** 할일 목록(TaskList) 리소스. */
export interface TaskList {
  /** "tasks#taskList" */
  kind?: string;
  /** 목록 id. add_task / list_tasks 의 tasklist_id 로 사용한다. (읽기 전용) */
  id: string;
  etag?: string;
  /** 목록 제목 */
  title: string;
  /** 마지막 수정 시각 (RFC 3339, 읽기 전용) */
  updated?: string;
  /** Google Tasks 웹 UI에서 이 목록을 가리키는 링크 (읽기 전용) */
  selfLink?: string;
}

/** 할일(Task) 상태. */
export type TaskStatus = "needsAction" | "completed";

/** 할일(Task) 리소스. */
export interface Task {
  /** "tasks#task" */
  kind?: string;
  /** 할일 id (읽기 전용) */
  id: string;
  etag?: string;
  /** 할일 제목. 최대 1024자. */
  title: string;
  /** 마지막 수정 시각 (RFC 3339, 읽기 전용) */
  updated?: string;
  /** 상위 할일 id. 최상위 할일이면 없음. (읽기 전용 — 생성 시에는 쿼리 파라미터 parent 로 지정) */
  parent?: string;
  /** 형제 할일 사이의 순서를 나타내는 문자열 (읽기 전용) */
  position?: string;
  /** 할일 설명. 최대 8192자. */
  notes?: string;
  /** "needsAction" 또는 "completed" */
  status: TaskStatus;
  /** 마감일 (RFC 3339). 날짜 정보만 의미가 있고 시간 부분은 API가 무시한다. */
  due?: string;
  /** 완료 처리된 시각 (RFC 3339) */
  completed?: string;
  /** 삭제 여부 */
  deleted?: boolean;
  /** 완료 후 목록을 "정리"해서 화면에서 숨겨졌는지 여부 (읽기 전용) */
  hidden?: boolean;
  /** Google Tasks 웹 UI에서 이 할일을 가리키는 링크 (읽기 전용) */
  webViewLink?: string;
}

/** GET /users/@me/lists 응답. */
export interface TaskListsListResponse {
  kind?: string;
  etag?: string;
  nextPageToken?: string;
  items?: TaskList[];
}

/** GET /lists/{tasklist}/tasks 응답. */
export interface TasksListResponse {
  kind?: string;
  etag?: string;
  nextPageToken?: string;
  items?: Task[];
}
