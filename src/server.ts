import { setOpenAIAPI, setOpenAIResponsesTransport } from "@openai/agents";
import type { Request, Response } from "express";
import express from "express";
import type { AgentCard } from "@a2a-js/sdk";
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import type { AgentExecutor } from "@a2a-js/sdk/server";
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import { NouxisPaymentGate } from "@Nouxis-ai/NouX/middleware";

setOpenAIAPI("responses");
setOpenAIResponsesTransport("websocket");

// ─── Server Factory ─────────────────────────────────────────

export interface ServerConfig {
  port: number;
  host: string;
  agentUrl: string;
  basePath: string;
  agentMint?: string;
  executor: AgentExecutor;
}

export function createServer(config: ServerConfig): {
  app: express.Express;
  agentCard: AgentCard;
  start: () => Promise<void>;
} {
  const agentCard: AgentCard = {
    name: "Nouxis Oracle",
    description:
      "The definitive AI expert on the Nouxis protocol. Ask anything about " +
      "on-chain instructions, PDAs, the SDK, payment settlement, delegation, " +
      "A2A protocol, and the Nouxis ecosystem. Founded by @NouxisAI.",
    url: config.agentUrl,
    protocolVersion: "0.2.2",
    version: "0.1.0",
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills: [
      {
        id: "protocol-expert",
        name: "Protocol Expert",
        description:
          "Deep knowledge of Nouxis's 23 on-chain instructions, 9 PDA types, " +
          "47 error codes, settlement mechanics, delegation system, and reputation model.",
        tags: ["Nouxis", "solana", "protocol", "on-chain"],
        examples: [
          "How does verify_and_settle work?",
          "What are the 3 settlement modes?",
          "Explain the delegation depth system",
          "What happens when an agent NFT is transferred?",
        ],
      },
      {
        id: "sdk-guide",
        name: "SDK Developer Guide",
        description:
          "Provides code examples and guidance for @Nouxis-ai/sdk — " +
          "identity, service, reputation, delegation, payment, and settlement instructions.",
        tags: ["sdk", "typescript", "developer", "code"],
        examples: [
          "How do I register an agent using the SDK?",
          "Show me how to set up the DelegationBuilder",
          "How do I set payment requirements for a service?",
          "How do I fetch all agents owned by a wallet?",
        ],
      },
      {
        id: "general-faq",
        name: "Nouxis FAQ & Vision",
        description:
          "Answers general questions about Nouxis's vision, architecture, " +
          "revenue model, founder, build phases, and ecosystem.",
        tags: ["faq", "vision", "architecture"],
        examples: [
          "What is Nouxis?",
          "Who founded Nouxis?",
          "How does Nouxis make money?",
          "What's the tech stack?",
        ],
      },
    ],
  };

  if (config.agentMint) {
    (agentCard as any)["x-Nouxis"] = {
      agentMint: config.agentMint,
      paymentRequired: false,
      network: "solana:devnet",
    };
  }

  // Set up SDK-based A2A request handling
  const taskStore = new InMemoryTaskStore();
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    taskStore,
    config.executor,
  );
  const a2aApp = new A2AExpressApp(requestHandler);

  const app = express();
  app.use(express.json());

  // ─── NouX Payment Gate ─────────────────────────────────

  if (config.agentMint) {
    const network = process.env.SOLANA_NETWORK ?? "devnet";
    const routeKey = config.basePath ? `POST ${config.basePath}` : "POST /";

    app.use(
      NouxisPaymentGate({
        agentMint: config.agentMint,
        network,
        rpcUrl: process.env.SOLANA_RPC_URL,
        routes: {
          [routeKey]: {
            description: "Nouxis Protocol Oracle — expert knowledge query",
          },
        },
      }),
    );

    console.log(`[Nouxis Oracle] NouX payment gate enabled`);
    console.log(`[Nouxis Oracle]   Agent mint: ${config.agentMint}`);
    console.log(`[Nouxis Oracle]   Network: ${network}`);
    console.log(`[Nouxis Oracle]   Price: resolved from on-chain`);
  } else {
    console.log(`[Nouxis Oracle] NouX payment gate disabled (no AGENT_MINT set)`);
  }

  // ─── Health Check ───────────────────────────────────────

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      agent: "Nouxis Oracle",
      version: "0.1.0",
      uptime: process.uptime(),
    });
  });

  // ─── A2A Routes (agent card + JSON-RPC) ─────────────────

  a2aApp.setupRoutes(app, config.basePath);

  return {
    app,
    agentCard,
    start: () =>
      new Promise<void>((resolve) => {
        app.listen(config.port, config.host, () => {
          const bp = config.basePath || "";
          const rpcPath = bp ? `POST ${bp}/` : "POST /";
          const cardPath = bp
            ? `${bp}/.well-known/agent-card.json`
            : "/.well-known/agent-card.json";
          console.log(`
┌─────────────────────────────────────────────────┐
│              Nouxis Protocol Oracle                │
│         powered by @openai/agents               │
├─────────────────────────────────────────────────┤
│  A2A Server:  ${config.agentUrl.padEnd(33)}│
│  Agent Card:  ${cardPath.padEnd(33)}│
│  A2A RPC:     ${rpcPath.padEnd(33)}│
│  Health:      GET /health                       │
│  Model:       ${(process.env.OPENAI_MODEL ?? "gpt-4.1").padEnd(33)}│
│  Payment:     ${(config.agentMint ? "NouX enabled" : "disabled").padEnd(33)}│
│  Transport:   @a2a-js/sdk                       │
└─────────────────────────────────────────────────┘
`);
          resolve();
        });
      }),
  };
}
