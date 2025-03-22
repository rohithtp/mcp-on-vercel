# Run an MCP Server on Vercel

This project implements a Model Context Protocol (MCP) server that can be run locally or deployed on Vercel.

## Local Development Setup

1. Install dependencies:
```sh
pnpm install
```

2. Set up Redis:
   - Option 1: Using Docker (recommended)
   ```sh
   docker run --name mcp-redis -p 6379:6379 -d redis:latest
   ```
   - Option 2: Use existing Redis instance

3. Configure environment:
   - Create a `.env` file:
   ```sh
   REDIS_URL=redis://localhost:6379
   ```

4. Start the development server:
```sh
pnpm dev
```

The server will be available at `http://localhost:3000` with:
- `/` - Landing page
- `/sse` - Server-Sent Events endpoint
- `/message` - Message endpoint

## Testing

Use the provided test client to verify the server:

```sh
# Test local server
pnpm test-client http://localhost:3000

# Test deployed server
pnpm test-client https://mcp-on-vercel.vercel.app
```

## Customizing the Server

Update `api/server.ts` with your tools, prompts, and resources following the [MCP TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk/tree/main?tab=readme-ov-file#server).

Example tool already included:
- `echo`: A simple tool that echoes back messages

## Deploying to Vercel

1. Prerequisites:
   - Vercel account
   - Redis instance (e.g., Upstash, Redis Labs)

2. Configuration Requirements:
   - Set `REDIS_URL` environment variable in your Vercel project settings
   - Enable [Fluid compute](https://vercel.com/docs/functions/fluid-compute) for efficient execution
   - For Pro/Enterprise accounts: Adjust max duration to 800 in `vercel.json`

3. Deploy:
   - Use [Deploy MCP template](https://vercel.com/templates/other/model-context-protocol-mcp-with-vercel-functions)
   - Or connect your repository to Vercel

## Project Structure

```
├── api/
│   └── server.ts          # Main server implementation
├── lib/
│   └── mcp-api-handler.ts # MCP protocol handler
├── scripts/
│   └── test-client.mjs    # Test client
└── public/
    └── index.html         # Landing page
```
