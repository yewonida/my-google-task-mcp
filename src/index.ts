#!/usr/bin/env node
/**
 * Google Tasks MCP 서버.
 *
 * 내 Google 할일(Google Tasks) 계정을 조작하는 4개의 도구를 stdio 로 제공한다:
 * create_tasklist, list_tasklists, add_task, list_tasks.
 *
 * 인증: 환경 변수 GOOGLE_TASKS_ACCESS_TOKEN (OAuth Playground 발급, 유효기간 1시간).
 * 소스코드에는 토큰을 두지 않는다 — 로컬 개발 시에는 .env (git에 커밋되지 않음)를,
 * MCP 클라이언트에 등록할 때는 클라이언트 설정의 환경 변수를 사용한다.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTasklistTools } from "./tools/tasklists.js";
import { registerTaskTools } from "./tools/tasks.js";

const server = new McpServer({
  name: "google-tasks-mcp-server",
  version: "1.0.0",
});

registerTasklistTools(server);
registerTaskTools(server);

async function main(): Promise<void> {
  if (!process.env.GOOGLE_TASKS_ACCESS_TOKEN) {
    console.error(
      "ERROR: GOOGLE_TASKS_ACCESS_TOKEN 환경 변수가 설정되어 있지 않습니다.\n" +
        "  https://developers.google.com/oauthplayground 에서 'Google Tasks API v1' > " +
        "https://www.googleapis.com/auth/tasks 스코프로 액세스 토큰을 발급받아\n" +
        "  .env 파일(.env.example 참고) 또는 MCP 클라이언트 설정의 환경 변수로 설정한 뒤 다시 실행하세요."
    );
    process.exit(1);
  }

  // stdio 서버는 stdout 을 프로토콜 통신 전용으로 써야 하므로, 로그는 반드시 stderr 로 보낸다.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Tasks MCP 서버가 stdio 로 실행 중입니다.");
}

main().catch((error) => {
  console.error("서버 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
