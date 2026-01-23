// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300; // 5 minutes for long responses

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, stream = true } = await req.json();

    const ollamaUrl = process.env.OLLAMA_BASE_URL;
    const ollamaApiKey = process.env.OLLAMA_API_KEY;

    console.log("OLLAMA_BASE_URL:", ollamaUrl);
    console.log("OLLAMA_API_KEY exists:", !!ollamaApiKey);

    if (!ollamaUrl || !ollamaApiKey) {
      return NextResponse.json(
        { error: "Server configuration error: Missing Ollama credentials" },
        { status: 500 },
      );
    }

    // Get the last user message for the prompt
    const lastMessage = messages[messages.length - 1];

    // Build context from conversation history
    const context = messages
      .slice(0, -1)
      .map(
        (m: Message) =>
          `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`,
      )
      .join("\n");

    const fullPrompt = context
      ? `${context}\nHuman: ${lastMessage.content}\nAssistant:`
      : lastMessage.content;

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ollamaApiKey,
      },
      body: JSON.stringify({
        model: "llama3.1:70b",
        prompt: fullPrompt,
        stream: stream,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ollama API error:", errorText);
      return NextResponse.json(
        { error: `Ollama API error: ${response.statusText}` },
        { status: response.status },
      );
    }

    if (stream) {
      // Stream the response
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Parse the JSON lines from Ollama
              const text = new TextDecoder().decode(value);
              const lines = text.split("\n").filter((line) => line.trim());

              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.response) {
                    // Send only the response text as SSE
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ content: json.response })}\n\n`,
                      ),
                    );
                  }
                  if (json.done) {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                  console.error("Failed to parse line:", line, e);
                }
              }
            }
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      // Non-streaming response
      const data = await response.json();
      return NextResponse.json({ content: data.response });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
