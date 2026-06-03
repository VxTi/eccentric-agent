import { MCP } from './mcp';
import { describe, it, vi } from 'vitest';

const { platformMock, homeMock } = vi.hoisted(() => ({
  platformMock: vi.fn(),
  homeMock: vi.fn(),
}));
vi.mock('node:os', () => ({
  platform: platformMock,
  homedir: homeMock,
}));

describe('MCP server', () => {
  it('should create mcp server', async () => {
    const controller = new AbortController();
    const server = await MCP.create(
      'atlassian-rovo-mcp',
      {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote@latest',
          'https://mcp.atlassian.com/v1/mcp/authv2',
        ],
        autoApprove: [
          'getJiraIssue',
          'getJiraProjectIssueTypesMetadata',
          'getIssueLinkTypes',
          'getJiraIssueTypeMetaWithFields',
          'getTransitionsForJiraIssue',
        ],
      },
      controller.signal
    );
    const tools = await server.client.listTools();
    console.log(tools);
  });
});
