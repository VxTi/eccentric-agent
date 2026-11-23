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
  it.skip('should create mcp server', async () => {});
});
