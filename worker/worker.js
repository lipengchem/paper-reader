const COOKIE_NAME = "paper_reader_ai_session";
const OAUTH_STATE_COOKIE = "paper_reader_oauth_state";

const DEFAULT_MODELS = ["gpt-5.5", "gpt-4.1", "gpt-4.1-mini", "gpt-4o"];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function publicOpenAIError(message = "", status = 502) {
  const redacted = String(message).replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
  if (/incorrect api key|invalid api key/i.test(redacted)) {
    return "API Key 无效。请检查 API Key、API 平台、Base URL 和 API 格式是否匹配。";
  }
  if (/exceeded.*quota|quota|billing/i.test(redacted)) {
    return "OpenAI API 额度不足或账单未启用。请在 OpenAI Platform 检查 Billing/Usage，或改用一个有额度的自备 API Key。";
  }
  if (/model.*not.*found|does not exist|access.*model/i.test(redacted)) {
    return "当前 API Key 没有所选模型权限，请换一个可用模型或更换 API Key。";
  }
  return redacted || `OpenAI request failed: ${status}`;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "https://lipengchem.github.io,http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || "*";
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-Access-Code, X-OpenAI-Key, X-OpenAI-Base-URL, X-OpenAI-Mode",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=None"];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function siteUrl(env, path = "") {
  return `${(env.SITE_ORIGIN || "https://lipengchem.github.io/paper-reader").replace(/\/$/, "")}${path}`;
}

function libraryUrl(env, path) {
  return `${(env.LIBRARY_BASE_URL || "https://lipengchem.github.io/paper-reader-files/").replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function slugify(value) {
  return String(value || "paper")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "paper";
}

function fileType(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file?.type === "application/pdf") return "pdf";
  return "markdown";
}

function extensionFor(file) {
  return fileType(file) === "pdf" ? "pdf" : "md";
}

function siteFileUrl(env, path) {
  if (/^https?:/.test(path)) return path;
  if (path.startsWith("/file/")) return path;
  return `${(env.FILE_SITE_ORIGIN || "https://lipengchem.github.io/paper-reader-files").replace(/\/$/, "")}/${path.replace(/^\/+/, "")}`;
}

function githubRepo(env) {
  const full = env.GITHUB_CONTENT_REPO || "lipengchem/paper-reader";
  const [owner, repo] = full.split("/");
  return { owner, repo, branch: env.GITHUB_CONTENT_BRANCH || "main" };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function githubPutFile(env, path, file, message) {
  if (!env.GITHUB_CONTENT_TOKEN) {
    throw new Error("GitHub 存储尚未配置：需要设置 GITHUB_CONTENT_TOKEN。");
  }
  const { owner, repo, branch } = githubRepo(env);
  if (!owner || !repo) throw new Error("GITHUB_CONTENT_REPO 格式应为 owner/repo。");
  const content = arrayBufferToBase64(await file.arrayBuffer());
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
    method: "PUT",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_CONTENT_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "paper-reader-ai",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message,
      content,
      branch,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub 文件写入失败：${res.status}`);
  return data;
}

function openAIBaseUrl(env, access = {}) {
  return (access.baseUrl || env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
}

async function callOpenAI(env, access, model, input) {
  const baseUrl = openAIBaseUrl(env, access);
  const mode = (access.mode || env.OPENAI_API_MODE || (baseUrl.includes("api.openai.com") ? "responses" : "chat")).toLowerCase();
  const headers = {
    "Authorization": `Bearer ${access.apiKey}`,
    "Content-Type": "application/json",
  };

  if (mode === "chat") {
    const chatMessages = input.map((message) => ({
      role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || ""),
    }));
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages: chatMessages }),
    });
    const data = await res.json().catch(() => ({}));
    const answer = data.choices?.[0]?.message?.content || "";
    return { res, data, answer };
  }

  const res = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input }),
  });
  const data = await res.json().catch(() => ({}));
  const answer = data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "";
  return { res, data, answer };
}

async function requireSession(request, env) {
  const sessionToken = parseCookies(request)[COOKIE_NAME];
  if (!sessionToken) {
    return { error: json({ authenticated: false, error: "请先登录 GitHub。" }, 401, corsHeaders(request, env)) };
  }
  const tokenHash = await sha256(sessionToken);
  const row = await env.DB.prepare(
    "SELECT login, avatar_url as avatarUrl, expires_at FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')",
  ).bind(tokenHash).first();
  if (!row) {
    return { error: json({ authenticated: false, error: "登录已过期，请重新登录 GitHub。" }, 401, corsHeaders(request, env)) };
  }
  return { login: row.login, avatarUrl: row.avatarUrl || "" };
}

async function requireAiAccess(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session;

  const ownApiKey = request.headers.get("X-OpenAI-Key") || "";
  if (ownApiKey.trim()) {
    if (ownApiKey.trim().length < 8) {
      return { error: json({ authenticated: true, authorized: false, login: session.login, error: "API Key 格式不正确。" }, 403, corsHeaders(request, env)) };
    }
    const requestedBaseUrl = request.headers.get("X-OpenAI-Base-URL") || "";
    let baseUrl = "";
    if (requestedBaseUrl.trim()) {
      try {
        const parsed = new URL(requestedBaseUrl.trim());
        if (parsed.protocol !== "https:") {
          return { error: json({ authenticated: true, authorized: false, login: session.login, error: "API Base URL 必须是 https 地址。" }, 403, corsHeaders(request, env)) };
        }
        baseUrl = parsed.toString().replace(/\/+$/, "");
      } catch {
        return { error: json({ authenticated: true, authorized: false, login: session.login, error: "API Base URL 格式不正确。" }, 403, corsHeaders(request, env)) };
      }
    }
    const mode = (request.headers.get("X-OpenAI-Mode") || "").toLowerCase() === "responses" ? "responses" : "chat";
    return { ...session, apiKey: ownApiKey.trim(), apiKeySource: "user", baseUrl, mode };
  }

  const provided = request.headers.get("X-Access-Code") || "";
  if (!env.AI_ACCESS_CODE || provided !== env.AI_ACCESS_CODE) {
    return { error: json({ authenticated: true, authorized: false, login: session.login, error: "访问码错误或未配置。" }, 403, corsHeaders(request, env)) };
  }

  const allowed = (env.AI_ALLOWED_GITHUB_LOGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(session.login)) {
    return { error: json({ authenticated: true, authorized: false, login: session.login, error: "当前 GitHub 账户没有 AI 使用权限。" }, 403, corsHeaders(request, env)) };
  }
  return { ...session, apiKey: env.OPENAI_API_KEY, apiKeySource: "site" };
}

async function githubJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Accept": "application/json",
      "User-Agent": "paper-reader-ai",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.message || `GitHub request failed: ${res.status}`);
  return data;
}

async function githubGraphql(env, query, variables = {}) {
  const token = env.GITHUB_CONTENT_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub token 尚未配置，无法读取评论通知。");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "paper-reader-ai",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    throw new Error(data.errors?.[0]?.message || data.message || `GitHub GraphQL request failed: ${res.status}`);
  }
  return data.data;
}

async function ensureNotificationTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS notification_reads (
      login TEXT NOT NULL,
      channel TEXT NOT NULL,
      seen_at TEXT NOT NULL,
      PRIMARY KEY (login, channel)
    )`,
  ).run();
}

function compactSourceMap(sourceMap) {
  const blocks = Array.isArray(sourceMap) ? sourceMap : sourceMap.blocks || sourceMap.items || [];
  return blocks
    .slice(0, 220)
    .map((block) => ({
      id: block.id || block.source_id || block.block_id,
      page: block.page || block.page_number,
      type: block.type || block.block_type,
      original: block.original || block.text || "",
      chinese: block.translation || block.chinese || block.zh || "",
    }))
    .filter((block) => block.original || block.chinese);
}

function chooseContext(blocks, question) {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((term) => term.length >= 2)
    .slice(0, 16);
  const scored = blocks.map((block) => {
    const text = `${block.original} ${block.chinese}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    return { block, score };
  });
  const selected = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item) => item.block);
  return selected.length ? selected : blocks.slice(0, 24);
}

async function loadPaperContext(env, paper, question) {
  const markdown = await fetch(libraryUrl(env, paper.markdownPath)).then((res) => (res.ok ? res.text() : ""));
  const sourceMapPath = `library/${paper.slug}/source_map.json`;
  const sourceMap = await fetch(libraryUrl(env, sourceMapPath)).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const blocks = sourceMap ? compactSourceMap(sourceMap) : [];
  return {
    markdown: markdown.slice(0, 50000),
    blocks: chooseContext(blocks, question),
  };
}

async function handleGitHubStart(request, env) {
  if (!env.GITHUB_CLIENT_ID) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") || siteUrl(env);
  const state = randomToken();
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  target.searchParams.set("scope", "read:user");
  target.searchParams.set("state", state);
  target.searchParams.set("redirect_uri", `${url.origin}/auth/github/callback`);
  return new Response(null, {
    status: 302,
    headers: {
      "Location": target.toString(),
      "Set-Cookie": cookie(OAUTH_STATE_COOKIE, JSON.stringify({ state, returnTo }), { maxAge: 600 }),
    },
  });
}

async function handleGitHubCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const stateCookie = parseCookies(request)[OAUTH_STATE_COOKIE];
  if (!code || !stateCookie) return new Response("Missing OAuth state", { status: 400 });
  const saved = JSON.parse(stateCookie);
  if (saved.state !== state) return new Response("Invalid OAuth state", { status: 400 });

  const tokenData = await githubJson("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/auth/github/callback`,
    }),
  });
  const user = await githubJson("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const sessionToken = randomToken();
  const tokenHash = await sha256(sessionToken);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, login, avatar_url, created_at, expires_at) VALUES (?, ?, ?, datetime('now'), datetime('now', '+30 days'))",
  ).bind(tokenHash, user.login, user.avatar_url || "").run();

  const headers = new Headers({ "Location": saved.returnTo || siteUrl(env) });
  headers.append("Set-Cookie", cookie(COOKIE_NAME, sessionToken, { maxAge: 60 * 60 * 24 * 30 }));
  headers.append("Set-Cookie", cookie(OAUTH_STATE_COOKIE, "", { maxAge: 1 }));
  return new Response(null, {
    status: 302,
    headers,
  });
}

async function handleMe(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return json({ authenticated: false }, 200, corsHeaders(request, env));
  return json({
    authenticated: true,
    login: session.login,
    avatarUrl: session.avatarUrl,
    isOwner: session.login === (env.ALLOWED_GITHUB_LOGIN || "lipengchem"),
  }, 200, corsHeaders(request, env));
}

async function handleLogout(request, env) {
  const sessionToken = parseCookies(request)[COOKIE_NAME];
  if (sessionToken) {
    const tokenHash = await sha256(sessionToken);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return json({ ok: true }, 200, {
    ...corsHeaders(request, env),
    "Set-Cookie": cookie(COOKIE_NAME, "", { maxAge: 1 }),
  });
}

async function handleAiVerify(request, env) {
  const access = await requireAiAccess(request, env);
  if (access.error) return access.error;
  return json({ authenticated: true, authorized: true, login: access.login, source: access.apiKeySource }, 200, corsHeaders(request, env));
}

async function handleHistory(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;
  const url = new URL(request.url);
  const paperSlug = url.searchParams.get("paperSlug") || "";
  if (!paperSlug) return json({ error: "Missing paperSlug" }, 400, corsHeaders(request, env));

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM messages WHERE login = ? AND paper_slug = ?").bind(session.login, paperSlug).run();
    return json({ ok: true, messages: [] }, 200, corsHeaders(request, env));
  }

  const rows = await env.DB.prepare(
    "SELECT role, content, created_at as createdAt FROM messages WHERE login = ? AND paper_slug = ? ORDER BY id ASC LIMIT 200",
  ).bind(session.login, paperSlug).all();
  return json({ messages: rows.results || [] }, 200, corsHeaders(request, env));
}

async function handleCommentNotifications(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;
  await ensureNotificationTables(env);

  const channel = "giscus-comments";
  if (request.method === "POST") {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO notification_reads (login, channel, seen_at)
       VALUES (?, ?, ?)
       ON CONFLICT(login, channel) DO UPDATE SET seen_at = excluded.seen_at`,
    ).bind(session.login, channel, now).run();
    return json({ ok: true, seenAt: now }, 200, corsHeaders(request, env));
  }

  const seen = await env.DB.prepare(
    "SELECT seen_at as seenAt FROM notification_reads WHERE login = ? AND channel = ?",
  ).bind(session.login, channel).first();
  const seenAt = seen?.seenAt || "1970-01-01T00:00:00.000Z";
  const [owner, repo] = (env.GISCUS_REPO || "lipengchem/paper-reader").split("/");
  const categoryId = env.GISCUS_CATEGORY_ID || "DIC_kwDOS2FmK84C-3sx";
  const data = await githubGraphql(env, `
    query PaperReaderDiscussions($owner: String!, $repo: String!, $categoryId: ID!) {
      repository(owner: $owner, name: $repo) {
        discussions(first: 25, categoryId: $categoryId, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            id
            title
            url
            updatedAt
            comments(last: 10) {
              totalCount
              nodes {
                body
                createdAt
                url
                author {
                  login
                }
                replies(last: 1) {
                  totalCount
                  nodes {
                    body
                    createdAt
                    url
                    author {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { owner, repo, categoryId });
  const notifications = (data.repository?.discussions?.nodes || [])
    .filter((node) => (node.comments?.totalCount || 0) > 0)
    .map((node) => {
      const candidates = [];
      for (const comment of node.comments?.nodes || []) {
        candidates.push(comment);
        const reply = comment.replies?.nodes?.[0];
        if (reply) candidates.push(reply);
      }
      const latest = candidates
        .filter((item) => item?.createdAt)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || {};
      const latestAuthor = latest.author?.login || "";
      const latestTime = latest.createdAt || node.updatedAt;
      return {
        id: node.id,
        title: node.title,
        url: latest.url || node.url,
        updatedAt: latestTime,
        commentCount: node.comments?.totalCount || 0,
        latestAuthor,
        latestBody: String(latest.body || "").replace(/\s+/g, " ").slice(0, 160),
        unread: latestAuthor !== session.login && latestTime > seenAt,
      };
    });
  return json({ seenAt, notifications }, 200, corsHeaders(request, env));
}

async function handleStates(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner") || session.login;
  if (!(await canViewPersonalLibrary(env, session.login, owner))) {
    return json({ error: "没有权限查看该用户的阅读状态。" }, 403, corsHeaders(request, env));
  }
  const rows = await env.DB.prepare(
    "SELECT paper_slug as paperSlug, read, rating, categories_json as categoriesJson, tags_json as tagsJson, hidden, note, scroll_top as scrollTop, updated_at as updatedAt FROM user_states WHERE login = ?",
  ).bind(owner).all();
  const states = {};
  for (const row of rows.results || []) {
    states[row.paperSlug] = {
      read: !!row.read,
      rating: row.rating || 0,
      categories: JSON.parse(row.categoriesJson || "[]"),
      tags: JSON.parse(row.tagsJson || "[]"),
      hidden: !!row.hidden,
      note: row.note || "",
      scrollTop: row.scrollTop || 0,
      updatedAt: row.updatedAt,
    };
  }
  return json({ login: owner, states }, 200, corsHeaders(request, env));
}

async function handleState(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;
  const body = await request.json();
  const paperSlug = body.paperSlug || "";
  if (!paperSlug) return json({ error: "Missing paperSlug" }, 400, corsHeaders(request, env));
  const state = body.state || {};
  const rating = Math.max(0, Math.min(5, Number(state.rating || 0)));
  const read = state.read || rating > 0 ? 1 : 0;
  const categories = Array.isArray(state.categories) ? state.categories.map((category) => String(category).trim()).filter(Boolean).slice(0, 40) : [];
  const tags = Array.isArray(state.tags) ? state.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 40) : [];
  const hidden = state.hidden ? 1 : 0;
  const note = String(state.note || "").slice(0, 20000);
  const scrollTop = Math.max(0, Number(state.scrollTop || 0));
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_states (login, paper_slug, read, rating, categories_json, tags_json, hidden, note, scroll_top, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(login, paper_slug) DO UPDATE SET
       read = excluded.read,
       rating = excluded.rating,
       categories_json = excluded.categories_json,
       tags_json = excluded.tags_json,
       hidden = excluded.hidden,
       note = excluded.note,
       scroll_top = excluded.scroll_top,
       updated_at = excluded.updated_at`,
  ).bind(session.login, paperSlug, read, rating, JSON.stringify(categories), JSON.stringify(tags), hidden, note, scrollTop, updatedAt).run();
  return json({
    paperSlug,
    state: { read: !!read, rating, categories, tags, hidden: !!hidden, note, scrollTop, updatedAt },
  }, 200, corsHeaders(request, env));
}

async function handleFriends(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const friendLogin = String(body.login || "").trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(friendLogin)) {
      return json({ error: "GitHub 用户名格式不正确。" }, 400, corsHeaders(request, env));
    }
    await env.DB.prepare(
      `INSERT INTO friends (login, friend_login, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(login, friend_login) DO UPDATE SET created_at = excluded.created_at`,
    ).bind(session.login, friendLogin, new Date().toISOString()).run();
  }

  const rows = await env.DB.prepare(
    "SELECT friend_login as login, created_at as createdAt FROM friends WHERE login = ? ORDER BY friend_login ASC",
  ).bind(session.login).all();
  return json({ friends: rows.results || [] }, 200, corsHeaders(request, env));
}

async function canViewPersonalLibrary(env, viewer, owner) {
  if (!viewer || !owner) return false;
  if (viewer === owner) return true;
  const row = await env.DB.prepare(
    "SELECT 1 FROM friends WHERE login = ? AND friend_login = ?",
  ).bind(viewer, owner).first();
  return !!row;
}

async function handlePersonalPapers(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;

  const url = new URL(request.url);

  if (request.method === "POST") {
    if (url.pathname === "/personal-papers/copy") {
      const body = await request.json().catch(() => ({}));
      const sourceOwner = String(body.owner || "").trim();
      const sourceSlug = String(body.slug || "").trim();
      if (!sourceOwner || !sourceSlug) return json({ error: "Missing source owner or slug." }, 400, corsHeaders(request, env));
      if (sourceOwner === session.login) return json({ error: "这篇已经在你的文献库里。" }, 400, corsHeaders(request, env));
      if (!(await canViewPersonalLibrary(env, session.login, sourceOwner))) {
        return json({ error: "没有权限查看该用户的文献库。" }, 403, corsHeaders(request, env));
      }
      const source = await env.DB.prepare(
        `SELECT slug, owner_login as ownerLogin, title, date, journal, pdf_path as pdfPath, markdown_path as markdownPath,
                related_reading_path as relatedReadingPath, original_type as originalType,
                translation_type as translationType, related_reading_type as relatedReadingType
         FROM personal_papers WHERE owner_login = ? AND slug = ?`,
      ).bind(sourceOwner, sourceSlug).first();
      if (!source) return json({ error: "Source paper not found." }, 404, corsHeaders(request, env));
      const exists = await env.DB.prepare(
        "SELECT slug FROM personal_papers WHERE owner_login = ? AND (pdf_path = ? OR markdown_path = ?) LIMIT 1",
      ).bind(session.login, source.pdfPath, source.markdownPath).first();
      if (exists) return json({ error: "你的文献库里已经有这篇了。" }, 409, corsHeaders(request, env));
      const now = new Date().toISOString();
      const copiedSlug = `${session.login}-${Date.now()}-${slugify(source.title)}`;
      await env.DB.prepare(
        `INSERT INTO personal_papers
         (slug, owner_login, title, date, journal, pdf_path, markdown_path, related_reading_path, original_type, translation_type, related_reading_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(copiedSlug, session.login, source.title, source.date, source.journal || "", source.pdfPath, source.markdownPath, source.relatedReadingPath || "", source.originalType || "pdf", source.translationType || "markdown", source.relatedReadingType || "markdown", now).run();
      return json({ ok: true, slug: copiedSlug }, 200, corsHeaders(request, env));
    }

    const form = await request.formData();
    const original = form.get("original");
    const translation = form.get("translation");
    const related = form.get("related");
    if (!(original instanceof File) || !(translation instanceof File)) {
      return json({ error: "请至少上传原文和译文文件。" }, 400, corsHeaders(request, env));
    }
    const title = String(form.get("title") || original.name.replace(/\.[^.]+$/, "")).trim().slice(0, 300) || "Untitled paper";
    const journal = String(form.get("journal") || "").trim().slice(0, 200);
    const date = String(form.get("date") || new Date().toISOString().slice(0, 10)).trim().slice(0, 20);
    const slug = `${session.login}-${Date.now()}-${slugify(title)}`;
    const siteBasePath = `user-library/${session.login}/${slug}`;
    const originalType = fileType(original);
    const translationType = fileType(translation);
    const originalPath = `${siteBasePath}/paper.${extensionFor(original)}`;
    const translationPath = `${siteBasePath}/translation.${extensionFor(translation)}`;
    const commitPrefix = `Add personal paper: ${title.slice(0, 80)}`;
    await githubPutFile(env, `public/${originalPath}`, original, `${commitPrefix} original`);
    await githubPutFile(env, `public/${translationPath}`, translation, `${commitPrefix} translation`);
    let relatedPath = "";
    let relatedType = "markdown";
    if (related instanceof File && related.size > 0) {
      relatedType = fileType(related);
      relatedPath = `${siteBasePath}/related_reading.${extensionFor(related)}`;
      await githubPutFile(env, `public/${relatedPath}`, related, `${commitPrefix} related reading`);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO personal_papers
       (slug, owner_login, title, date, journal, pdf_path, markdown_path, related_reading_path, original_type, translation_type, related_reading_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(slug, session.login, title, date, journal, originalPath, translationPath, relatedPath, originalType, translationType, relatedType, now).run();
    return json({
      item: {
        slug,
        ownerLogin: session.login,
        personal: true,
        title,
        date,
        journal,
        pdfPath: siteFileUrl(env, originalPath),
        markdownPath: siteFileUrl(env, translationPath),
        relatedReadingPath: relatedPath ? siteFileUrl(env, relatedPath) : "",
        relatedReading: !!relatedPath,
        originalType,
        translationType,
        relatedReadingType: relatedType,
      },
    }, 200, corsHeaders(request, env));
  }

  const owner = url.searchParams.get("owner") || session.login;
  if (!(await canViewPersonalLibrary(env, session.login, owner))) {
    return json({ error: "没有权限查看该用户的个人文献库。" }, 403, corsHeaders(request, env));
  }
  const rows = await env.DB.prepare(
    `SELECT slug, owner_login as ownerLogin, title, date, journal, pdf_path as pdfPath, markdown_path as markdownPath,
            related_reading_path as relatedReadingPath, original_type as originalType,
            translation_type as translationType, related_reading_type as relatedReadingType, created_at as createdAt
     FROM personal_papers WHERE owner_login = ? ORDER BY created_at DESC`,
  ).bind(owner).all();
  const items = (rows.results || []).map((row) => ({
    ...row,
    personal: true,
    pdfPath: row.pdfPath?.startsWith("/file/") ? `${aiApiOrigin(request)}${row.pdfPath}` : siteFileUrl(env, row.pdfPath),
    markdownPath: row.markdownPath?.startsWith("/file/") ? `${aiApiOrigin(request)}${row.markdownPath}` : siteFileUrl(env, row.markdownPath),
    relatedReadingPath: row.relatedReadingPath
      ? row.relatedReadingPath.startsWith("/file/")
        ? `${aiApiOrigin(request)}${row.relatedReadingPath}`
        : siteFileUrl(env, row.relatedReadingPath)
      : "",
    relatedReading: !!row.relatedReadingPath,
  }));
  return json({ owner, items }, 200, corsHeaders(request, env));
}

function aiApiOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function handleFile(request, env) {
  const session = await requireSession(request, env);
  if (session.error) return session.error;
  if (!env.PAPER_FILES) return json({ error: "R2 bucket PAPER_FILES 尚未配置。" }, 500, corsHeaders(request, env));
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/file\//, ""));
  if (!key.startsWith("personal/")) return json({ error: "Not found" }, 404, corsHeaders(request, env));
  const owner = key.split("/")[1] || "";
  if (!(await canViewPersonalLibrary(env, session.login, owner))) {
    return json({ error: "没有权限查看该文件。" }, 403, corsHeaders(request, env));
  }
  const object = await env.PAPER_FILES.get(key);
  if (!object) return json({ error: "Not found" }, 404, corsHeaders(request, env));
  return new Response(object.body, {
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
}

async function handleChat(request, env) {
  const access = await requireAiAccess(request, env);
  if (access.error) return access.error;
  const body = await request.json();
  const paper = body.paper || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const question = messages.at(-1)?.content || "";
  if (!paper.slug || !question) return json({ error: "Missing paper or question." }, 400, corsHeaders(request, env));

  const allowedModels = (env.ALLOWED_MODELS || DEFAULT_MODELS.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const requestedModel = String(body.model || "").trim().slice(0, 120);
  const model = access.apiKeySource === "user"
    ? requestedModel || allowedModels[0]
    : allowedModels.includes(requestedModel) ? requestedModel : allowedModels[0];
  const context = await loadPaperContext(env, paper, question);
  const prompt = [
    "You are an AI literature-reading assistant for a computational chemistry graduate student.",
    "Answer in Chinese by default. Be precise and source-grounded.",
    "Use the provided paper markdown and source-map blocks. Cite source block ids and pages when relevant, e.g. S012 p.3.",
    "If the provided context is insufficient, say so instead of guessing.",
    `Paper: ${paper.title}`,
    `Journal/date: ${paper.journal || ""} ${paper.date || ""}`,
    `Current view: ${body.pageContext?.viewMode || ""}, panes: ${(body.pageContext?.visiblePanes || []).join(", ")}`,
    "Relevant source-map blocks:",
    JSON.stringify(context.blocks).slice(0, 30000),
    "Current loaded markdown excerpt:",
    String(body.pageContext?.currentMarkdown || "").slice(0, 12000),
    "Full paper markdown excerpt:",
    context.markdown.slice(0, 30000),
  ].join("\n\n");

  const input = [
    { role: "system", content: prompt },
    ...messages.slice(-10).map((message) => ({ role: message.role, content: message.content })),
  ];

  const { res, data, answer } = await callOpenAI(env, access, model, input);
  if (!res.ok) return json({ error: publicOpenAIError(data.error?.message, res.status) }, 502, corsHeaders(request, env));

  if (body.transient) {
    return json({ answer, messages: [...messages, { role: "assistant", content: answer, createdAt: new Date().toISOString() }] }, 200, corsHeaders(request, env));
  }

  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO messages (login, paper_slug, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(access.login, paper.slug, "user", question, model, now).run();
  await env.DB.prepare("INSERT INTO messages (login, paper_slug, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(access.login, paper.slug, "assistant", answer, model, new Date().toISOString()).run();

  const rows = await env.DB.prepare(
    "SELECT role, content, created_at as createdAt FROM messages WHERE login = ? AND paper_slug = ? ORDER BY id ASC LIMIT 200",
  ).bind(access.login, paper.slug).all();
  return json({ answer, messages: rows.results || [] }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/auth/github/start") return handleGitHubStart(request, env);
      if (url.pathname === "/auth/github/callback") return handleGitHubCallback(request, env);
      if (url.pathname === "/auth/logout" && request.method === "POST") return handleLogout(request, env);
      if (url.pathname === "/me") return handleMe(request, env);
      if (url.pathname === "/ai/verify") return handleAiVerify(request, env);
      if (url.pathname === "/notifications/comments" && request.method === "GET") return handleCommentNotifications(request, env);
      if (url.pathname === "/notifications/comments/read" && request.method === "POST") return handleCommentNotifications(request, env);
      if (url.pathname === "/states" && request.method === "GET") return handleStates(request, env);
      if (url.pathname === "/state" && request.method === "PUT") return handleState(request, env);
      if (url.pathname === "/friends" && (request.method === "GET" || request.method === "POST")) return handleFriends(request, env);
      if ((url.pathname === "/personal-papers" || url.pathname === "/personal-papers/copy") && (request.method === "GET" || request.method === "POST")) return handlePersonalPapers(request, env);
      if (url.pathname.startsWith("/file/") && request.method === "GET") return handleFile(request, env);
      if (url.pathname === "/history") return handleHistory(request, env);
      if (url.pathname === "/chat" && request.method === "POST") return handleChat(request, env);
      return json({ error: "Not found" }, 404, corsHeaders(request, env));
    } catch (error) {
      return json({ error: error.message || "Worker error" }, 500, corsHeaders(request, env));
    }
  },
};
