import type Anthropic from "@anthropic-ai/sdk";
import type { ParsedMessage } from "@anthropic-ai/sdk/lib/parser";
import type { SpanInput } from "../types";

type AnthropicStream = ReturnType<Anthropic["messages"]["stream"]>;

function blockToSpan(block: Anthropic.ContentBlock, startMs: number, durationMs: number): SpanInput {
  switch (block.type) {
    case "thinking":
      return { kind: "thinking", label: "Thinking", startMs, durationMs, inputText: null, outputText: block.thinking };
    case "server_tool_use": {
      const query = (block.input as { query?: string } | null)?.query;
      return {
        kind: "web_search_query",
        label: query ? `Web search: "${query}"` : `Server tool: ${block.name}`,
        startMs,
        durationMs,
        inputText: JSON.stringify(block.input),
        outputText: null,
      };
    }
    case "web_search_tool_result": {
      const content = block.content;
      const isError = !Array.isArray(content);
      return {
        kind: "web_search_result",
        label: isError ? `Search error: ${content.error_code}` : `${content.length} result${content.length === 1 ? "" : "s"}`,
        startMs,
        durationMs,
        inputText: null,
        outputText: isError
          ? JSON.stringify(content)
          : JSON.stringify(
              content.map((r) => ({ title: r.title, url: r.url, page_age: r.page_age })),
              null,
              2
            ),
      };
    }
    case "text":
      return { kind: "text_output", label: "Response text", startMs, durationMs, inputText: null, outputText: block.text };
    default:
      return { kind: "other", label: block.type, startMs, durationMs, inputText: null, outputText: JSON.stringify(block) };
  }
}

export type TracedStreamResult<ParsedT> =
  | { ok: true; message: ParsedMessage<ParsedT>; spans: SpanInput[] }
  | { ok: false; error: unknown; spans: SpanInput[] };

/**
 * Consumes an Anthropic MessageStream, turning each completed content block
 * (thinking, a web-search query, its results, the final text) into a timed
 * span for the profiling timeline. Never throws — spans accumulate via
 * closure regardless of how the stream ends, so a caller gets partial
 * timeline data even on abort/error.
 */
export async function consumeTracedStream<ParsedT>(
  stream: AnthropicStream,
  callStart: number
): Promise<TracedStreamResult<ParsedT>> {
  const spans: SpanInput[] = [];
  let lastTs = callStart;

  stream.on("contentBlock", (block: Anthropic.ContentBlock) => {
    const now = Date.now();
    spans.push(blockToSpan(block, lastTs - callStart, now - lastTs));
    lastTs = now;
  });

  try {
    const message = (await stream.finalMessage()) as ParsedMessage<ParsedT>;
    return { ok: true, message, spans };
  } catch (error) {
    return { ok: false, error, spans };
  }
}
