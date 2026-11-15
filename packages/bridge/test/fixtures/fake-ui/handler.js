// Stands in for the adapter-node handler of the web UI: tells the test what it was called with.
/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function handler(req, res) {
  res.setHeader('content-type', 'text/plain');
  res.end(`ui ${req.method} ${req.url} api=${process.env.SR_BRIDGE_API_URL}`);
}
