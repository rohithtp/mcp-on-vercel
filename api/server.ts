import { config } from "dotenv";
import { z } from "zod";
import { createServer } from "http";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";
import { readFile } from "fs/promises";
import { join } from "path";

// Load environment variables from .env file
config();

const handler = initializeMcpApiHandler(
  (server) => {
    // Add more tools, resources, and prompts here
    server.tool("echo", { message: z.string() }, async ({ message }) => ({
      content: [{ type: "text", text: `Tool echo: ${message}` }],
    }));
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
      },
    },
  }
);

const PORT = process.env.PORT || 3000;
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  
  // Serve index.html at root path
  if (url.pathname === '/') {
    try {
      const indexPath = join(process.cwd(), 'public', 'index.html');
      const content = await readFile(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }
  }
  
  // Handle MCP requests
  await handler(req, res);
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
