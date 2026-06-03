import { getLocalClaudeConfig, MCP } from './mcp';
import { describe, it, vi, expect } from 'vitest';

const { platformMock, homeMock } = vi.hoisted(() => ({
  platformMock: vi.fn(),
  homeMock: vi.fn(),
}));
vi.mock('node:os', () => ({
  platform: platformMock,
  homedir: homeMock,
}));

describe('MCP server', () => {
  it.each`
    platform    | expected
    ${'win32'}  | ${'/Claude/claude_desktop_config.json'}
    ${'darwin'} | ${'/Library/Application Support/claude_desktop_config.json'}
    ${'linux'}  | ${'/.config/Claude/claude_desktop_config.json'}
  `(
    'uses the correct claude desktop config for platform',
    ({ platform, expected }) => {
      platformMock.mockReturnValueOnce(platform);
      homeMock.mockReturnValueOnce('/');

      expect(getLocalClaudeConfig()).toEqual(expected);
    }
  );

  it('should create mcp server', async () => {
    const controller = new AbortController();
    const server = new MCP(
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
    const tools = await server.listTools();
    console.log(tools);
  });
});
