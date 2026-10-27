import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleApi } from '../src/http.js';

// 真实 SDK 协议调用，但身份、服务和 SQLite 都来自调用方的隔离夹具，不访问线上。
export async function fixtureMcpClient(service) {
  const client = new Client({ name: 'phone-sync-integration', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://fixture.test/mcp'), {
    fetch: (url, init) => handleApi(new Request(url, init), service, 'https://fixture.test'),
  }));
  return client;
}
