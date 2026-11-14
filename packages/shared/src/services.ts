// Paths on the bridge's HTTP port that lead to the child services it runs
// (docs/playwright-mcp.md). They are outside `API_PREFIX`: the bridge passes them through.

/** The Playwright server (`connectOptions.wsEndpoint`): `ws://<bridge>:5151/playwright`. */
export const PLAYWRIGHT_PATH = '/playwright';

/** Playwright MCP (streamable HTTP): `http://<bridge>:5151/playwright-mcp`. */
export const PLAYWRIGHT_MCP_PATH = '/playwright-mcp';
