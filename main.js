const PLUGIN_ID = "local.context-insights";
const TOOL_NAME = "context_snapshot";
const HISTORY_LIMIT = 32;
const SECTION_LIMIT = 48;
const ITEM_LIMIT = 24;
const PREVIEW_LIMIT = 420;

let history = [];

function toText(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? String(item) : item) ?? String(value);
  } catch {
    return String(value);
  }
}

function estimateTokens(value) {
  const text = toText(value);
  const wide = text.match(/[\u2e80-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0;
  return Math.ceil(wide + (text.length - wide) / 4);
}

function classifyKey(key) {
  const value = String(key).toLowerCase();
  if (/system|instruction|developer/.test(value)) return "system";
  if (/tool|function|schema/.test(value)) return "tools";
  if (/message|history|conversation|turn/.test(value)) return "messages";
  if (/context|inject|skill|memory|attachment|prompt/.test(value)) return "injected";
  if (/session.?id|turn.?id|model|timestamp|request.?id|created.?at/.test(value)) return "metadata";
  return "other";
}

function itemLabel(value, index) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["role", "type", "name", "toolName", "filename", "path", "id"]) {
      if (typeof value[key] === "string" && value[key]) return value[key].slice(0, 100);
    }
  }
  return `Item ${index + 1}`;
}

function itemPreview(value) {
  if (typeof value === "string") return value.slice(0, PREVIEW_LIMIT);
  if (value && typeof value === "object") {
    for (const key of ["content", "text", "prompt", "arguments", "input", "output", "result", "description"]) {
      if (value[key] !== undefined && value[key] !== value) {
        const text = toText(value[key]);
        if (text) return text.slice(0, PREVIEW_LIMIT);
      }
    }
  }
  return toText(value).slice(0, PREVIEW_LIMIT);
}

function sectionItems(value) {
  if (Array.isArray(value)) return value.map((item, index) => ({ label: itemLabel(item, index), value: item }));
  if (value && typeof value === "object") {
    return Object.entries(value).map(([label, item]) => ({ label, value: item }));
  }
  return [{ label: "Value", value }];
}

function summarizeContext(raw, sessionId, turnId) {
  let entries;
  if (Array.isArray(raw)) {
    entries = raw.map((value, index) => [`Item ${index + 1}`, value]);
  } else if (raw && typeof raw === "object") {
    entries = Object.entries(raw);
  } else {
    entries = [["context", raw]];
  }

  const sections = entries.slice(0, SECTION_LIMIT).map(([key, value]) => {
    const items = sectionItems(value);
    return {
      key: String(key),
      category: classifyKey(key),
      itemCount: items.length,
      characters: toText(value).length,
      estimatedTokens: estimateTokens(value),
      items: items.slice(0, ITEM_LIMIT).map((item) => ({
        label: item.label,
        estimatedTokens: estimateTokens(item.value),
        preview: itemPreview(item.value),
      })),
    };
  });

  const categories = ["system", "tools", "messages", "injected", "other", "metadata"].map((category) => {
    const matching = sections.filter((section) => section.category === category);
    return {
      category,
      estimatedTokens: matching.reduce((sum, section) => sum + section.estimatedTokens, 0),
      itemCount: matching.reduce((sum, section) => sum + section.itemCount, 0),
      sectionCount: matching.length,
    };
  });
  const messageCount = categories.find((item) => item.category === "messages")?.itemCount ?? 0;

  return {
    sessionId: sessionId == null ? null : String(sessionId),
    turnId: turnId == null ? null : String(turnId),
    capturedAt: new Date().toISOString(),
    estimatedTokens: estimateTokens(raw),
    characters: toText(raw).length,
    messageCount,
    sectionCount: entries.length,
    categories,
    sections,
  };
}

function publicSummary(snapshot) {
  return {
    sessionId: snapshot.sessionId,
    turnId: snapshot.turnId,
    capturedAt: snapshot.capturedAt,
    estimatedTokens: snapshot.estimatedTokens,
    characters: snapshot.characters,
    messageCount: snapshot.messageCount,
    sectionCount: snapshot.sectionCount,
    categories: snapshot.categories,
  };
}

async function inspectContext(args, context) {
  if (args?.action !== "inspect") throw new Error("Unsupported context snapshot action.");
  if (context?.signal?.aborted) throw new Error("Context inspection was cancelled.");

  const raw = await pi.session.getLlmContext();
  if (context?.signal?.aborted) throw new Error("Context inspection was cancelled.");

  const snapshot = summarizeContext(raw, context?.sessionId, context?.turnId);
  history.push(snapshot);
  if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);

  return {
    ok: true,
    pluginId: PLUGIN_ID,
    note: "Token counts are rough character-based estimates, not provider billing values.",
    snapshot: publicSummary(snapshot),
  };
}

async function onLoad() {
  await pi.commands.register({
    id: "context-insights.open",
    title: "PI Context: Open Panel",
    keywords: ["context", "prompt", "tokens"],
    run: async () => {
      await pi.ui.openPanel({ title: "PI Context" });
    },
  });

  await pi.agent.registerTool({
    name: TOOL_NAME,
    description: "Inspect the active session's assembled LLM context. Returns approximate size, top-level composition and message counts without returning prompt contents.",
    risk: "low",
    planSafeActions: ["inspect"],
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["inspect"], default: "inspect" },
      },
      required: ["action"],
    },
    execute: inspectContext,
  });
}

async function onPanelInvoke(channel, payload) {
  if (channel === "context.requestInspection") {
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;
    if (!sessionId) return { shown: false, reason: "no-active-session" };
    try {
      return await pi.composer.suggest({
        sessionId,
        text: "请检查当前会话的上下文组成。调用 context_snapshot 工具并展示概览，不要复述上下文正文。",
        ttlMs: 120000,
      });
    } catch {
      return { shown: false, reason: "suggestion-unavailable" };
    }
  }

  if (channel !== "context.getSnapshot") return { ok: false, error: "Unknown panel operation." };
  const requestedSessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;
  if (!requestedSessionId) return { ok: true, snapshot: null, history: [] };

  const matching = history.filter((snapshot) => snapshot.sessionId === requestedSessionId);
  return {
    ok: true,
    snapshot: matching[matching.length - 1] ?? null,
    history: matching.slice(-HISTORY_LIMIT),
  };
}


async function onUnload() {
  await pi.commands.unregister("context-insights.open");
  await pi.agent.unregisterTool(TOOL_NAME);
  history = [];
}

module.exports = { onLoad, onUnload, onPanelInvoke };
