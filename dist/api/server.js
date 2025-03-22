"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
const http_1 = require("http");
const mcp_api_handler_1 = require("../lib/mcp-api-handler");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// Load environment variables from .env file
(0, dotenv_1.config)();

async function loadMcpConfig() {
    const configPath = (0, path_1.join)(process.cwd(), 'servers', 'mcp_servers.json');
    const configContent = await (0, promises_1.readFile)(configPath, 'utf-8');
    return JSON.parse(configContent);
}

async function startServer() {
    const mcpConfig = await loadMcpConfig();
    const handler = (0, mcp_api_handler_1.initializeMcpApiHandler)((server) => {
        // Add more tools, resources, and prompts here
        server.tool("echo", { message: zod_1.z.string() }, async ({ message }) => ({
            content: [{ type: "text", text: `Tool echo: ${message}` }],
        }));
    }, mcpConfig);

    const PORT = process.env.PORT || 3000;
    const httpServer = (0, http_1.createServer)(async (req, res) => {
        const url = new URL(req.url || "", `http://localhost:${PORT}`);
        // Serve index.html at root path
        if (url.pathname === '/') {
            try {
                const indexPath = (0, path_1.join)(process.cwd(), 'public', 'index.html');
                const content = await (0, promises_1.readFile)(indexPath, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
                return;
            }
            catch (error) {
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
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
});
