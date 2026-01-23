// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Role = "user" | "assistant" | "system";

interface Message {
  role: Role;
  content: string;
}

interface ChatRequestBody {
  messages: Message[];
  stream?: boolean;
  model?: string;
  options?: Record<string, unknown>;
}

/**
 * Notes:
 * - Uses HTTPS if you provide it in OLLAMA_BASE_URL to avoid redirects dropping auth headers.
 * - Supports both common auth styles (Authorization Bearer + X-API-Key) for compatibility with gateways.
 * - Prefer /api/chat when possible (better formatting than prompt stitching), fallback to /api/generate.
 * - Streams Ollama NDJSON -> SSE "data: {content: ...}\n\n" + "[DONE]".
 */

const DEFAULT_MODEL = "llama3.1:70b";

function normalizeBaseUrl(input: string) {
  // Remove trailing slashes so `${base}/api/...` is clean
  return input.replace(/\/+$/, "");
}

function buildAuthHeaders(apiKey: string) {
  // Many gateways accept either/both; harmless to send both.
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
  };
}

function toOllamaChatMessages(messages: Message[]) {
  // Ollama chat accepts: system/user/assistant
  // If caller only uses user/assistant, pass through.
  return messages.map((m) => ({
    role: m.role === "system" ? "system" : m.role,
    content: m.content,
  }));
}

function promptFromMessages(messages: Message[]) {
  // Fallback prompt builder for /api/generate
  // Keeps things simple and deterministic.
  const parts = messages.map((m) => {
    if (m.role === "system") return `System: ${m.content}`;
    if (m.role === "user") return `Human: ${m.content}`;
    return `Assistant: ${m.content}`;
  });
  // Ensure the model continues as Assistant
  return `${parts.join("\n")}\nAssistant:`;
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status },
  );
}

async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Convert an upstream NDJSON stream (Ollama) into an SSE stream for the client.
 * Ollama emits one JSON object per line.
 */
function ndjsonToSse(upstream: Response) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: "" })}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete lines; keep remainder in buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const json = JSON.parse(trimmed);

              // /api/chat streams chunks under `message.content`
              const chatChunk: string | undefined = json?.message?.content;

              // /api/generate streams chunks under `response`
              const genChunk: string | undefined = json?.response;

              const chunk = chatChunk ?? genChunk;
              if (chunk) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ content: chunk })}\n\n`,
                  ),
                );
              }

              if (json?.done) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // ignore malformed partial line
            }
          }
        }

        // Flush any remaining buffered line if it parses
        const last = buffer.trim();
        if (last) {
          try {
            const json = JSON.parse(last);
            const chunk: string | undefined =
              json?.message?.content ?? json?.response;
            if (chunk) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ content: chunk })}\n\n`,
                ),
              );
            }
            if (json?.done)
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            // ignore
          }
        }
      } catch (err) {
        // Surface as an SSE error message then close.
        const msg =
          err instanceof Error ? err.message : "Upstream stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = (await req.json()) as ChatRequestBody;

    const messages = body?.messages ?? [];
    const stream = body?.stream ?? true;
    const model = body?.model ?? DEFAULT_MODEL;
    const options = body?.options ?? {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError(400, "Missing messages array");
    }

    const base = process.env.OLLAMA_BASE_URL;
    const apiKey = process.env.OLLAMA_API_KEY;

    if (!base) return jsonError(500, "Missing OLLAMA_BASE_URL");
    if (!apiKey) return jsonError(500, "Missing OLLAMA_API_KEY");

    const ollamaUrl = normalizeBaseUrl(base);

    // Helpful logs (avoid printing the key)
    console.log(`[chat:${requestId}] base:`, ollamaUrl);
    console.log(`[chat:${requestId}] stream:`, stream, "model:", model);

    // Prefer /api/chat first (better than prompt stitching)
    const chatPayload = {
      model,
      messages: toOllamaChatMessages(messages),
      stream,
      options,
    };

    const commonHeaders = {
      "Content-Type": "application/json",
      ...buildAuthHeaders(apiKey),
    };

    let upstream: Response | null = null;

    // Try /api/chat, then fallback to /api/generate
    try {
      upstream = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify(chatPayload),
        redirect: "follow",
      });
    } catch (e: any) {
      console.error(
        `[chat:${requestId}] fetch /api/chat failed:`,
        e?.message || e,
      );
      upstream = null;
    }

    if (!upstream || !upstream.ok) {
      const status = upstream?.status ?? 502;
      const text = upstream ? await safeReadText(upstream) : "";
      console.warn(
        `[chat:${requestId}] /api/chat not ok (${status}). Falling back to /api/generate.`,
      );

      // Build prompt fallback
      const prompt = promptFromMessages(messages);

      let genRes: Response;
      try {
        genRes = await fetch(`${ollamaUrl}/api/generate`, {
          method: "POST",
          headers: commonHeaders,
          body: JSON.stringify({
            model,
            prompt,
            stream,
            options,
          }),
          redirect: "follow",
        });
      } catch (e: any) {
        console.error(
          `[chat:${requestId}] fetch /api/generate failed:`,
          e?.message || e,
        );
        return jsonError(502, "Upstream fetch failed", {
          message: e?.message || String(e),
        });
      }

      if (!genRes.ok) {
        const raw = await safeReadText(genRes);
        console.error(
          `[chat:${requestId}] upstream error /api/generate:`,
          genRes.status,
          genRes.statusText,
          raw.slice(0, 800),
        );
        return jsonError(
          genRes.status,
          `Upstream error ${genRes.status}`,
          raw ? { body: raw.slice(0, 2000) } : undefined,
        );
      }

      if (stream) {
        return new Response(ndjsonToSse(genRes), { headers: sseHeaders() });
      }

      // Non-streaming /api/generate
      const data = await genRes.json().catch(() => null);
      const content = data?.response ?? "";
      return NextResponse.json({ content });
    }

    // /api/chat success
    if (stream) {
      return new Response(ndjsonToSse(upstream), { headers: sseHeaders() });
    }

    // Non-streaming /api/chat
    const data = await upstream.json().catch(() => null);
    const content = data?.message?.content ?? data?.response ?? "";
    return NextResponse.json({ content });
  } catch (e: any) {
    console.error("[chat] handler error:", e?.message || e);
    return jsonError(500, "Internal server error", {
      message: e?.message || String(e),
    });
  }
}
