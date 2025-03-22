"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeMcpApiHandler = initializeMcpApiHandler;
const raw_body_1 = __importDefault(require("raw-body"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const http_1 = require("http");
const redis_1 = require("redis");
const net_1 = require("net");
const stream_1 = require("stream");
const vercel_json_1 = __importDefault(require("../vercel.json"));
function initializeMcpApiHandler(initializeServer, serverOptions = {}) {
    const maxDuration = vercel_json_1.default?.functions?.["api/server.ts"]?.maxDuration || 800;
    const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL environment variable is not set");
    }
    const redis = (0, redis_1.createClient)({
        url: redisUrl,
    });
    const redisPublisher = (0, redis_1.createClient)({
        url: redisUrl,
    });
    redis.on("error", (err) => {
        console.error("Redis error", err);
    });
    redisPublisher.on("error", (err) => {
        console.error("Redis error", err);
    });
    const redisPromise = Promise.all([redis.connect(), redisPublisher.connect()]);
    let servers = [];
    return async function mcpApiHandler(req, res) {
        await redisPromise;
        const url = new URL(req.url || "", "https://example.com");
        if (url.pathname === "/sse") {
            console.log("Got new SSE connection");
            const transport = new sse_js_1.SSEServerTransport("/message", res);
            const sessionId = transport.sessionId;
            const server = new mcp_js_1.McpServer({
                name: "mcp-typescript server on vercel",
                version: "0.1.0",
            }, serverOptions);
            initializeServer(server);
            servers.push(server);
            server.server.onclose = () => {
                console.log("SSE connection closed");
                servers = servers.filter((s) => s !== server);
            };
            let logs = [];
            // This ensures that we logs in the context of the right invocation since the subscriber
            // is not itself invoked in request context.
            function logInContext(severity, ...messages) {
                logs.push({
                    type: severity,
                    messages,
                });
            }
            // Handles messages originally received via /message
            const handleMessage = async (message) => {
                console.log("Received message from Redis", message);
                logInContext("log", "Received message from Redis", message);
                const request = JSON.parse(message);
                // Make in IncomingMessage object because that is what the SDK expects.
                const req = createFakeIncomingMessage({
                    method: request.method,
                    url: request.url,
                    headers: request.headers,
                    body: request.body,
                });
                const syntheticRes = new http_1.ServerResponse(req);
                let status = 100;
                let body = "";
                syntheticRes.writeHead = (statusCode) => {
                    status = statusCode;
                    return syntheticRes;
                };
                syntheticRes.end = (b) => {
                    body = b;
                    return syntheticRes;
                };
                await transport.handlePostMessage(req, syntheticRes);
                await redisPublisher.publish(`responses:${sessionId}:${request.requestId}`, JSON.stringify({
                    status,
                    body,
                }));
                if (status >= 200 && status < 300) {
                    logInContext("log", `Request ${sessionId}:${request.requestId} succeeded: ${body}`);
                }
                else {
                    logInContext("error", `Message for ${sessionId}:${request.requestId} failed with status ${status}: ${body}`);
                }
            };
            const interval = setInterval(() => {
                for (const log of logs) {
                    console[log.type].call(console, ...log.messages);
                }
                logs = [];
            }, 100);
            await redis.subscribe(`requests:${sessionId}`, handleMessage);
            console.log(`Subscribed to requests:${sessionId}`);
            let timeout;
            let resolveTimeout;
            const waitPromise = new Promise((resolve) => {
                resolveTimeout = resolve;
                timeout = setTimeout(() => {
                    resolve("max duration reached");
                }, (maxDuration - 5) * 1000);
            });
            async function cleanup() {
                clearTimeout(timeout);
                clearInterval(interval);
                await redis.unsubscribe(`requests:${sessionId}`, handleMessage);
                console.log("Done");
                res.statusCode = 200;
                res.end();
            }
            req.on("close", () => resolveTimeout("client hang up"));
            await server.connect(transport);
            const closeReason = await waitPromise;
            console.log(closeReason);
            await cleanup();
        }
        else if (url.pathname === "/message") {
            console.log("Received message");
            const body = await (0, raw_body_1.default)(req, {
                length: req.headers["content-length"],
                encoding: "utf-8",
            });
            const sessionId = url.searchParams.get("sessionId") || "";
            if (!sessionId) {
                res.statusCode = 400;
                res.end("No sessionId provided");
                return;
            }
            const requestId = crypto.randomUUID();
            const serializedRequest = {
                requestId,
                url: req.url || "",
                method: req.method || "",
                body: body,
                headers: req.headers,
            };
            // Handles responses from the /sse endpoint.
            await redis.subscribe(`responses:${sessionId}:${requestId}`, (message) => {
                clearTimeout(timeout);
                const response = JSON.parse(message);
                res.statusCode = response.status;
                res.end(response.body);
            });
            // Queue the request in Redis so that a subscriber can pick it up.
            // One queue per session.
            await redisPublisher.publish(`requests:${sessionId}`, JSON.stringify(serializedRequest));
            console.log(`Published requests:${sessionId}`, serializedRequest);
            let timeout = setTimeout(async () => {
                await redis.unsubscribe(`responses:${sessionId}:${requestId}`);
                res.statusCode = 408;
                res.end("Request timed out");
            }, 10 * 1000);
            res.on("close", async () => {
                clearTimeout(timeout);
                await redis.unsubscribe(`responses:${sessionId}:${requestId}`);
            });
        }
        else {
            res.statusCode = 404;
            res.end("Not found");
        }
    };
}
// Create a fake IncomingMessage
function createFakeIncomingMessage(options = {}) {
    const { method = "GET", url = "/", headers = {}, body = null, socket = new net_1.Socket(), } = options;
    // Create a readable stream
    const readable = new stream_1.Readable();
    readable._read = () => { }; // Required implementation
    // Create an IncomingMessage instance
    const req = Object.create(http_1.IncomingMessage.prototype);
    Object.assign(req, readable);
    // Set the properties
    req.method = method;
    req.url = url;
    req.headers = headers;
    req.socket = socket;
    // Push the body if it exists
    if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        readable.push(bodyStr);
        readable.push(null);
    }
    else {
        readable.push(null);
    }
    return req;
}
