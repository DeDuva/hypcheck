import { describe, expect, it, vi } from "vitest";
import { DispatchError, dispatchConfig, dispatchResearch } from "../src/lib/dispatch";

const config = { token: "tok", repo: "DeDuva/hypcheck", ref: "main" };

describe("dispatchConfig", () => {
  it("is null without a token, and defaults repo/ref", () => {
    expect(dispatchConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(dispatchConfig({ HYPCHECK_DISPATCH_TOKEN: "t" } as unknown as NodeJS.ProcessEnv)).toEqual({
      token: "t",
      repo: "DeDuva/hypcheck",
      ref: "main",
    });
  });
});

describe("dispatchResearch", () => {
  it("POSTs a workflow_dispatch for research.yml with the hypcheck id", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatchResearch("abc123", { config, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/DeDuva/hypcheck/actions/workflows/research.yml/dispatches");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ref: "main", inputs: { hypcheck_id: "abc123" } });
  });

  it("sends an empty id for 'all due'", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatchResearch(null, { config, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).inputs).toEqual({ hypcheck_id: "" });
  });

  it("throws a DispatchError when not configured, without calling GitHub", async () => {
    const fetchImpl = vi.fn();
    await expect(dispatchResearch("x", { config: null, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(
      DispatchError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response, with GitHub's message", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
    await expect(dispatchResearch("x", { config, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(
      /HTTP 401.*Bad credentials/
    );
  });
});
