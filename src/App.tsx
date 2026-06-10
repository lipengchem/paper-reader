import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  Bot,
  BookOpen,
  ChevronDown,
  FileText,
  Highlighter,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Send,
  Trash2,
  User,
} from "lucide-react";

type PaperItem = {
  slug: string;
  title: string;
  date: string;
  taskDate?: string;
  journal?: string;
  zoteroKey?: string;
  collections?: string[];
  pdfPath: string;
  markdownPath: string;
  relatedReading: boolean;
  paragraphCount?: number;
  figureCount?: number;
};

type LibraryIndex = {
  generatedAt?: string;
  items: PaperItem[];
};

type ReaderState = {
  read?: boolean;
  rating?: number;
  tags?: string[];
  note?: string;
  scrollTop?: number;
  updatedAt?: string;
};

type AiMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type AuthState = {
  authenticated: boolean;
  login?: string;
  isOwner?: boolean;
  avatarUrl?: string;
};

const baseUrl = import.meta.env.BASE_URL;
const libraryBase = `${baseUrl}library/`;
const aiApiBase = (import.meta.env.VITE_AI_API_URL || "").replace(/\/$/, "");
const aiAccessCodeKey = "paper-reader:ai-access-code";
const aiModelKey = "paper-reader:ai-model";
const aiProviderKey = "paper-reader:ai-provider";
const aiPanelPosKey = "paper-reader:ai-panel-pos";
const aiModels = [
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4o", label: "GPT-4o" },
];

function initialAiPanelPosition() {
  if (typeof window === "undefined") return { x: 680, y: 96 };
  const stored = localStorage.getItem(aiPanelPosKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { x?: number; y?: number };
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return {
          x: Math.min(Math.max(12, parsed.x || 12), Math.max(12, window.innerWidth - 360)),
          y: Math.min(Math.max(12, parsed.y || 12), Math.max(12, window.innerHeight - 260)),
        };
      }
    } catch {
      // Ignore corrupt local UI state.
    }
  }
  return { x: Math.max(12, window.innerWidth - 650), y: 88 };
}

function normalizeAssetPath(slug: string, src = "") {
  if (/^(https?:|data:|\/)/.test(src)) return src;
  return `${libraryBase}${slug}/${src.replace(/^\.\//, "")}`;
}

const splitStateKey = "paper-reader:pane-split";
const giscusRepo = "lipengchem/paper-reader";
const giscusRepoId = "R_kgDOS2FmKw";
const giscusCategory = "General";
const giscusCategoryId = "DIC_kwDOS2FmK84C-3sx";

function uniq(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
}

function monthFromDate(date: string) {
  const match = date.match(/^\d{4}-\d{2}/);
  return match ? match[0] : date;
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，;；\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function GiscusComments({ paper }: { paper: PaperItem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-repo", giscusRepo);
    script.setAttribute("data-repo-id", giscusRepoId);
    script.setAttribute("data-category", giscusCategory);
    script.setAttribute("data-category-id", giscusCategoryId);
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", `${paper.slug}: ${paper.title}`);
    script.setAttribute("data-strict", "1");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute("data-theme", "light");
    script.setAttribute("data-lang", "zh-CN");
    script.setAttribute("data-loading", "lazy");
    container.appendChild(script);
  }, [paper.slug, paper.title]);

  return (
    <section className="comments-section">
      <h2>评论区</h2>
      <div ref={containerRef} />
    </section>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [activeSlug, setActiveSlug] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [viewMode, setViewMode] = useState<"reader" | "related">("reader");
  const [paneMode, setPaneMode] = useState<"both" | "pdf" | "text">("both");
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [journalFilter, setJournalFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"date" | "title" | "rating">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [states, setStates] = useState<Record<string, ReaderState>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAccessCode, setAiAccessCode] = useState(() => localStorage.getItem(aiAccessCodeKey) || "");
  const [aiProvider, setAiProvider] = useState<"access" | "own">(
    () => (localStorage.getItem(aiProviderKey) === "own" ? "own" : "access"),
  );
  const [ownApiKey, setOwnApiKey] = useState("");
  const [aiReady, setAiReady] = useState(false);
  const [aiModel, setAiModel] = useState(() => localStorage.getItem(aiModelKey) || aiModels[0].id);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [auth, setAuth] = useState<AuthState>({ authenticated: false });
  const [syncError, setSyncError] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [splitPct, setSplitPct] = useState(() => {
    const stored = Number(localStorage.getItem(splitStateKey));
    return Number.isFinite(stored) && stored >= 25 && stored <= 75 ? stored : 50;
  });
  const [aiPanelPos, setAiPanelPos] = useState(initialAiPanelPosition);
  const lastDividerPointerAt = useRef(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${libraryBase}index.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`index.json ${res.status}`);
        return res.json();
      })
      .then((index: LibraryIndex) => {
        const items = Array.isArray(index) ? index : index.items || [];
        setPapers(items);
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get("paper");
        setViewMode(params.get("view") === "related" ? "related" : "reader");
        setActiveSlug(items.some((paper) => paper.slug === fromUrl) ? fromUrl || "" : items[0]?.slug || "");
        setStates({});
      })
      .catch((err) => setError(`无法加载文献索引：${err.message}`));
    checkAuth();
  }, []);

  const active = useMemo(
    () => papers.find((paper) => paper.slug === activeSlug),
    [papers, activeSlug],
  );

  useEffect(() => {
    if (!active) return;
    setNoteDraft(states[active.slug]?.note || "");
    setTagDraft((states[active.slug]?.tags || []).join(", "));
    const documentPath =
      viewMode === "related" ? `library/${active.slug}/related_reading.md` : active.markdownPath;
    fetch(`${baseUrl}${documentPath}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`${documentPath} ${res.status}`);
        return res.text();
      })
      .then(setMarkdown)
      .catch((err) => setMarkdown(`# 加载失败\n\n${err.message}`));
  }, [active, states, viewMode]);

  useEffect(() => {
    if (auth.authenticated) {
      loadReaderStates();
    }
    setAccountOpen(false);
  }, [auth.authenticated]);

  useEffect(() => {
    if (!active) return;
    setAiMessages([]);
    setAiError("");
    setAiReady(false);
  }, [active?.slug]);

  const aiHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (aiProvider === "own") {
      headers["X-OpenAI-Key"] = ownApiKey.trim();
    } else {
      headers["X-Access-Code"] = aiAccessCode.trim();
    }
    return headers;
  };

  const loginWithGitHub = () => {
    if (!aiApiBase) {
      setSyncError("后端还没有配置 VITE_AI_API_URL。");
      return;
    }
    window.location.href = `${aiApiBase}/auth/github/start?returnTo=${encodeURIComponent(window.location.href)}`;
  };

  const checkAuth = async () => {
    if (!aiApiBase) return;
    try {
      const res = await fetch(`${aiApiBase}/me`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setAuth({
        authenticated: !!data.authenticated,
        login: data.login,
        avatarUrl: data.avatarUrl,
        isOwner: !!data.isOwner,
      });
    } catch {
      setAuth({ authenticated: false });
    }
  };

  const logout = async () => {
    if (!aiApiBase) return;
    try {
      await fetch(`${aiApiBase}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setAuth({ authenticated: false });
      setStates({});
      setAiReady(false);
      setAiMessages([]);
      setAiError("");
      setSyncError("");
    }
  };

  const switchAiCredentialMode = (provider: "access" | "own") => {
    setAiProvider(provider);
    localStorage.setItem(aiProviderKey, provider);
    setAiReady(false);
    setAiError("");
  };

  const loadReaderStates = async () => {
    if (!aiApiBase || !auth.authenticated) return;
    try {
      const res = await fetch(`${aiApiBase}/states`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `个人状态加载失败：${res.status}`);
      setStates(data.states || {});
      setSyncError("");
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "个人状态加载失败。");
    }
  };

  const saveReaderState = async (slug: string, state: ReaderState) => {
    if (!aiApiBase || !auth.authenticated) return;
    try {
      const res = await fetch(`${aiApiBase}/state`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperSlug: slug, state }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `保存失败：${res.status}`);
      setStates((prev) => ({ ...prev, [slug]: data.state || state }));
      setSyncError("");
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "个人状态保存失败。");
    }
  };

  const loadAiSession = async () => {
    if (!active || !aiApiBase) return;
    if (aiProvider === "access" && !aiAccessCode.trim()) {
      setAiError("请先输入访问码。");
      return;
    }
    if (aiProvider === "own" && !ownApiKey.trim()) {
      setAiError("请先输入你自己的 OpenAI API Key。");
      return;
    }
    localStorage.setItem(aiAccessCodeKey, aiAccessCode.trim());
    localStorage.setItem(aiModelKey, aiModel);
    localStorage.setItem(aiProviderKey, aiProvider);
    setAiBusy(true);
    setAiError("");
    try {
      const me = await fetch(`${aiApiBase}/me`, {
        credentials: "include",
      });
      const meData = await me.json().catch(() => ({}));
      setAuth({
        authenticated: !!meData.authenticated,
        login: meData.login,
        avatarUrl: meData.avatarUrl,
        isOwner: !!meData.isOwner,
      });
      if (!me.ok) throw new Error(meData.error || `认证检查失败：${me.status}`);
      if (!meData.authenticated) {
        setAiError("请先登录 GitHub。");
        return;
      }
      const verify = await fetch(`${aiApiBase}/ai/verify`, {
        credentials: "include",
        headers: aiHeaders(),
      });
      const verifyData = await verify.json().catch(() => ({}));
      if (!verify.ok) throw new Error(verifyData.error || `AI 凭证验证失败：${verify.status}`);
      const history = await fetch(`${aiApiBase}/history?paperSlug=${encodeURIComponent(active.slug)}`, {
        credentials: "include",
      });
      const historyData = await history.json().catch(() => ({}));
      if (!history.ok) throw new Error(historyData.error || `聊天记录加载失败：${history.status}`);
      setAiMessages(Array.isArray(historyData.messages) ? historyData.messages : []);
      setAiReady(true);
    } catch (err) {
      setAiReady(false);
      setAiError(err instanceof Error ? err.message : "AI 会话加载失败。");
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => {
    const hasCredential = aiProvider === "own" ? ownApiKey.trim() : aiAccessCode.trim();
    if (aiOpen && active && hasCredential && auth.authenticated) {
      loadAiSession();
    }
  }, [aiOpen, active?.slug, auth.authenticated]);

  const journals = useMemo(() => uniq(papers.map((paper) => paper.journal)), [papers]);
  const dates = useMemo(() => uniq(papers.map((paper) => monthFromDate(paper.date))).reverse(), [papers]);
  const tags = useMemo(
    () => Array.from(new Set(Object.values(states).flatMap((state) => state.tags || []))).sort((a, b) => a.localeCompare(b)),
    [states],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = papers.filter((paper) => {
      const local = states[paper.slug] || {};
      const isRead = !!local.read || !!local.rating;
      const searchable = [paper.title, paper.journal, paper.date, ...(paper.collections || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (journalFilter !== "all" && paper.journal !== journalFilter) return false;
      if (dateFilter !== "all" && monthFromDate(paper.date) !== dateFilter) return false;
      if (tagFilter !== "all" && !(local.tags || []).includes(tagFilter)) return false;
      if (readFilter === "read") return isRead;
      if (readFilter === "unread") return !isRead;
      return true;
    });
    return result.sort((a, b) => {
      const stateA = states[a.slug] || {};
      const stateB = states[b.slug] || {};
      let value = 0;
      if (sortKey === "date") value = a.date.localeCompare(b.date);
      if (sortKey === "title") value = a.title.localeCompare(b.title);
      if (sortKey === "rating") value = (stateA.rating || 0) - (stateB.rating || 0);
      return sortDirection === "asc" ? value : -value;
    });
  }, [dateFilter, journalFilter, papers, query, readFilter, sortDirection, sortKey, states, tagFilter]);

  const changeSort = (nextKey: typeof sortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  };

  const setRating = (slug: string, rating: number) => {
    const current = states[slug]?.rating || 0;
    const nextRating = current === rating ? 0 : rating;
    const next = { ...(states[slug] || {}), rating: nextRating, read: nextRating > 0 };
    setStates((prev) => ({ ...prev, [slug]: next }));
    saveReaderState(slug, next);
  };

  const saveNote = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), note: noteDraft };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const saveTags = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), tags: parseTags(tagDraft) };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const sendAiQuestion = async () => {
    if (!active || aiBusy) return;
    const question = aiInput.trim();
    if (!question) return;
    if (!aiApiBase) {
      setAiError("AI 后端还没有配置 VITE_AI_API_URL。");
      return;
    }
    if (!auth.authenticated) {
      setAiError("请先登录 GitHub。");
      return;
    }
    if (aiProvider === "access" && !aiAccessCode.trim()) {
      setAiError("请先输入访问码。");
      return;
    }
    if (aiProvider === "own" && !ownApiKey.trim()) {
      setAiError("请先输入你自己的 OpenAI API Key。");
      return;
    }

    const userMessage: AiMessage = {
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...aiMessages, userMessage];
    setAiMessages(nextMessages);
    setAiInput("");
    setAiBusy(true);
    setAiError("");
    localStorage.setItem(aiAccessCodeKey, aiAccessCode.trim());
    localStorage.setItem(aiModelKey, aiModel);
    localStorage.setItem(aiProviderKey, aiProvider);

    try {
      const res = await fetch(`${aiApiBase}/chat`, {
        method: "POST",
        credentials: "include",
        headers: aiHeaders(),
        body: JSON.stringify({
          model: aiModel,
          paper: {
            slug: active.slug,
            title: active.title,
            journal: active.journal,
            date: active.date,
            pdfPath: active.pdfPath,
            markdownPath: active.markdownPath,
            relatedReadingPath: active.relatedReading ? `library/${active.slug}/related_reading.md` : "",
          },
          pageContext: {
            viewMode,
            paneMode,
            currentMarkdown: markdown.slice(0, 16000),
          },
          messages: nextMessages.slice(-12),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `AI 请求失败：${res.status}`);
      setAiMessages(Array.isArray(data.messages) ? data.messages : nextMessages);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI 请求失败。");
      setAiMessages(nextMessages);
    } finally {
      setAiBusy(false);
    }
  };

  const clearAiHistory = () => {
    if (!active) return;
    if (!aiApiBase || !auth.authenticated) {
      setAiMessages([]);
      setAiError("");
      return;
    }
    fetch(`${aiApiBase}/history?paperSlug=${encodeURIComponent(active.slug)}`, {
      method: "DELETE",
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`清空失败：${res.status}`);
        setAiMessages([]);
        setAiError("");
      })
      .catch((err) => setAiError(err instanceof Error ? err.message : "清空失败。"));
  };

  const startAiPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a")) return;
    event.preventDefault();
    const panel = event.currentTarget.closest(".ai-drawer") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const updatePosition = (clientX: number, clientY: number) => {
      const maxX = Math.max(12, window.innerWidth - 220);
      const maxY = Math.max(12, window.innerHeight - 120);
      const next = {
        x: Math.min(Math.max(12, clientX - offsetX), maxX),
        y: Math.min(Math.max(12, clientY - offsetY), maxY),
      };
      setAiPanelPos(next);
      localStorage.setItem(aiPanelPosKey, JSON.stringify(next));
    };

    const onPointerMove = (moveEvent: PointerEvent) => updatePosition(moveEvent.clientX, moveEvent.clientY);
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-dragging-ai");
    };

    document.body.classList.add("is-dragging-ai");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const startPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paneMode !== "both") return;
    const now = window.performance.now();
    if (now - lastDividerPointerAt.current < 350) {
      lastDividerPointerAt.current = 0;
      resetPaneSplit();
      return;
    }
    lastDividerPointerAt.current = now;
    event.preventDefault();
    const grid = event.currentTarget.closest(".reader-grid") as HTMLElement | null;
    const rect = grid?.getBoundingClientRect();
    if (!rect) return;

    const updateSplit = (clientX: number) => {
      const next = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(25, next));
      setSplitPct(clamped);
      localStorage.setItem(splitStateKey, clamped.toFixed(1));
    };
    const onPointerMove = (moveEvent: PointerEvent) => updateSplit(moveEvent.clientX);
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-reader");
    };

    document.body.classList.add("is-resizing-reader");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const resetPaneSplit = () => {
    setSplitPct(50);
    localStorage.setItem(splitStateKey, "50");
  };

  const openRelatedView = () => {
    if (!active) return;
    if (viewMode === "related") {
      setViewMode("reader");
      history.replaceState(null, "", `${baseUrl}?paper=${active.slug}`);
    } else {
      if (paneMode === "pdf") setPaneMode("text");
      setViewMode("related");
      history.replaceState(null, "", `${baseUrl}?paper=${active.slug}&view=related`);
    }
  };

  if (!papers.length && !error) {
    return (
      <div className="empty-state">
        <p>正在加载文献库...</p>
      </div>
    );
  }

  const hasAiCredential = aiProvider === "own" ? !!ownApiKey.trim() : !!aiAccessCode.trim();

  return (
    <div className="shell">
      {sidebarOpen ? (
        <aside className="sidebar">
          <div className="brand">
            <div>
              <h1>文献库</h1>
              <p>{papers.length} 篇文件</p>
            </div>
            <button className="icon-button" onClick={() => setSidebarOpen(false)} title="收起侧栏">
              <PanelLeftClose size={18} />
            </button>
          </div>

          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、期刊、日期、集合"
          />

          <div className="filters">
            <div className="segmented">
              {[
                ["all", "全部"],
                ["unread", "未读"],
                ["read", "已读"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={readFilter === key ? "active" : ""}
                  onClick={() => setReadFilter(key as typeof readFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="filter-row">
              <select className="select" value={journalFilter} onChange={(event) => setJournalFilter(event.target.value)}>
                <option value="all">期刊</option>
                {journals.map((journal) => (
                  <option key={journal} value={journal}>
                    {journal}
                  </option>
                ))}
              </select>
              <select className="select" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
                <option value="all">日期</option>
                {dates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-row">
              <select className="select" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="all">标签</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <div className="sort-menu">
                <button className={sortOpen ? "select sort-trigger active" : "select sort-trigger"} onClick={() => setSortOpen((open) => !open)}>
                  <span>排序</span>
                  <ChevronDown size={14} className={sortOpen ? "chevron open" : "chevron"} />
                </button>
                {sortOpen && (
                  <div className="sort-popover">
                    {[
                      ["date", "日期"],
                      ["title", "首字母"],
                      ["rating", "星级"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={sortKey === key ? "active" : ""}
                        onClick={() => changeSort(key as typeof sortKey)}
                      >
                        {label}
                        {sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="paper-list">
            {filtered.map((paper) => {
              const local = states[paper.slug] || {};
              const isRead = !!local.read || !!local.rating;
              return (
                <div
                  key={paper.slug}
                  className={`paper-item ${paper.slug === activeSlug ? "active" : ""}`}
                >
                  <button className="paper-select" onClick={() => setActiveSlug(paper.slug)}>
                    <span>
                      <strong>{paper.title}</strong>
                      <small>{paper.journal || "Unknown journal"} · {paper.date}</small>
                    </span>
                    <span className={`status-dot ${isRead ? "read" : ""}`} />
                  </button>
                  <div className="rating-row" aria-label={`${paper.title} 评分`}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        className={rating <= (local.rating || 0) ? "star active" : "star"}
                        onClick={() => setRating(paper.slug, rating)}
                        title={`${rating} 星`}
                      >
                        {rating <= (local.rating || 0) ? "★" : "☆"}
                      </button>
                    ))}
                  </div>
                  {!!local.tags?.length && (
                    <div className="tag-row">
                      {local.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {!filtered.length && <p className="empty">没有符合筛选条件的文献。</p>}
          </div>
        </aside>
      ) : (
        <aside className="sidebar" style={{ width: 62 }}>
          <button className="icon-button" onClick={() => setSidebarOpen(true)} title="展开侧栏">
            <PanelLeftOpen size={18} />
          </button>
        </aside>
      )}

      <main className="main">
        {error && (
          <div className="empty-state">
            <p>{error}</p>
          </div>
        )}

        {active && (
          <>
            <header className="topbar">
              <div className="title-row">
                <h2>{active.title}</h2>
                <div className="meta-line">
                  <span>{active.journal || "Unknown journal"}</span>
                  <span>{active.date}</span>
                </div>
                {syncError && <p className="sync-error">{syncError}</p>}
              </div>
              <div className="toolbar">
                <div className="toolbar-row toolbar-row-top">
                  <div className="meta-menu">
                    <button className={metaOpen ? "active" : ""} onClick={() => setMetaOpen((open) => !open)}>
                      <Highlighter size={16} />
                      标签/批注
                      <ChevronDown size={14} />
                    </button>
                    {metaOpen && (
                      <div className="meta-popover">
                        <label htmlFor="tags">标签</label>
                        <input
                          id="tags"
                          className="tag-input"
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onBlur={saveTags}
                          placeholder="例如：AI, 光催化, 电催化"
                        />
                        <label htmlFor="note">本地批注</label>
                        {!auth.authenticated && (
                          <p className="sync-hint">登录后，星级、标签和批注会按账号跨设备保存。</p>
                        )}
                        <textarea
                          id="note"
                          className="notes-box"
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          onBlur={saveNote}
                          placeholder="记录你的理解、疑问或后续想法。内容只保存在当前浏览器。"
                        />
                      </div>
                    )}
                  </div>
                  {active.relatedReading && (
                    <button className={viewMode === "related" ? "active" : ""} onClick={openRelatedView}>
                      <BookOpen size={16} />
                      相关阅读
                    </button>
                  )}
                  <button onClick={() => location.reload()}>
                    <RefreshCw size={16} />
                    刷新
                  </button>
                </div>
                <div className="toolbar-row toolbar-row-bottom">
                  <div className="layout-control" aria-label="阅读区域显示模式">
                    <button className={paneMode === "both" ? "active" : ""} onClick={() => setPaneMode("both")}>
                      双栏
                    </button>
                    <button className={paneMode === "pdf" ? "active" : ""} onClick={() => setPaneMode("pdf")}>
                      原文
                    </button>
                    <button className={paneMode === "text" ? "active" : ""} onClick={() => setPaneMode("text")}>
                      译文
                    </button>
                  </div>
                  <div className="toolbar-account-group">
                    <button className={aiOpen ? "active" : ""} onClick={() => setAiOpen((open) => !open)}>
                      <Bot size={16} />
                      AI
                    </button>
                    {auth.authenticated ? (
                      <div className="account-menu">
                        <button
                          className="account-trigger"
                          onClick={() => setAccountOpen((open) => !open)}
                          title={auth.login}
                        >
                          {auth.avatarUrl ? (
                            <img src={auth.avatarUrl} alt="" />
                          ) : (
                            <span className="avatar-fallback">{auth.login?.slice(0, 1).toUpperCase()}</span>
                          )}
                          <ChevronDown size={14} className={accountOpen ? "chevron open" : "chevron"} />
                        </button>
                        {accountOpen && (
                          <div className="account-popover">
                            <div className="account-name">{auth.login}</div>
                            <button onClick={loadReaderStates}>同步</button>
                            <button onClick={logout}>
                              <LogOut size={15} />
                              退出
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="account-menu">
                        <button
                          className="account-trigger"
                          onClick={() => setAccountOpen((open) => !open)}
                          title="账号"
                        >
                          <User size={24} />
                          <ChevronDown size={14} className={accountOpen ? "chevron open" : "chevron"} />
                        </button>
                        {accountOpen && (
                          <div className="account-popover">
                            <button onClick={loginWithGitHub}>登录</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {aiOpen && (
                <section
                  className="ai-drawer"
                  aria-label="AI 文献助手"
                  style={{ left: aiPanelPos.x, top: aiPanelPos.y }}
                >
                  <div className="ai-header" onPointerDown={startAiPanelDrag}>
                    <div>
                      <h3>AI 文献助手</h3>
                      <p>{active.title}</p>
                    </div>
                    <button className="icon-button" onClick={() => setAiOpen(false)} title="关闭 AI">
                      ×
                    </button>
                  </div>
                  {!auth.authenticated ? (
                    <div className="ai-gate">
                      <p>请先登录 GitHub。登录后，AI 对话记录会按你的账号保存，其他人看不到。</p>
                      <button onClick={loginWithGitHub}>登录 GitHub</button>
                    </div>
                  ) : !aiReady ? (
                    <div className="ai-gate">
                      <p>已登录：{auth.login}。请选择 AI 使用方式。</p>
                      <div className="ai-provider-tabs">
                        <button
                          className={aiProvider === "access" ? "active" : ""}
                          onClick={() => switchAiCredentialMode("access")}
                        >
                          访问码
                        </button>
                        <button
                          className={aiProvider === "own" ? "active" : ""}
                          onClick={() => switchAiCredentialMode("own")}
                        >
                          自备 API Key
                        </button>
                      </div>
                      <div className="ai-controls">
                        {aiProvider === "access" ? (
                          <input
                            className="ai-access"
                            type="password"
                            value={aiAccessCode}
                            onChange={(event) => {
                              setAiAccessCode(event.target.value);
                              setAiReady(false);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") loadAiSession();
                            }}
                            placeholder="输入访问码，按 Enter 进入"
                          />
                        ) : (
                          <input
                            className="ai-access"
                            type="password"
                            value={ownApiKey}
                            onChange={(event) => {
                              setOwnApiKey(event.target.value);
                              setAiReady(false);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") loadAiSession();
                            }}
                            placeholder="输入你自己的 OpenAI API Key，按 Enter 进入"
                          />
                        )}
                        <select className="select" value={aiModel} onChange={(event) => setAiModel(event.target.value)}>
                          {aiModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button onClick={loadAiSession} disabled={aiBusy || !hasAiCredential}>
                        {aiBusy ? "正在进入..." : "进入 AI"}
                      </button>
                      {aiProvider === "own" && (
                        <p className="ai-note">自备 API Key 只用于当前浏览器本次请求转发，不会写入数据库或网页文件。</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="ai-session-bar">
                        <span>{aiProvider === "own" ? "自备 API Key" : "访问码"} · {auth.login}</span>
                        <select className="select" value={aiModel} onChange={(event) => setAiModel(event.target.value)}>
                          {aiModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            setAiReady(false);
                            setAiMessages([]);
                            setAiError("");
                          }}
                        >
                          切换
                        </button>
                      </div>
                      <div className="ai-messages">
                        {!aiMessages.length && (
                          <p className="ai-empty">可以直接问当前文章、译文、图注或相关阅读。回答会尽量引用段落 ID 和页码。</p>
                        )}
                        {aiMessages.map((message, index) => (
                          <div key={`${message.createdAt}-${index}`} className={`ai-message ${message.role}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        ))}
                        {aiBusy && <p className="ai-empty">正在回答...</p>}
                      </div>
                      <div className="ai-compose">
                        <textarea
                          value={aiInput}
                          onChange={(event) => setAiInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) sendAiQuestion();
                          }}
                          placeholder="问这篇文章里的任何问题。Ctrl/⌘ + Enter 发送。"
                        />
                        <div className="ai-actions">
                          <button onClick={clearAiHistory} title="清空当前文章聊天记录">
                            <Trash2 size={16} />
                            清空
                          </button>
                          <button onClick={sendAiQuestion} disabled={aiBusy}>
                            <Send size={16} />
                            发送
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {aiError && (
                    <div className="ai-error">
                      <p>{aiError}</p>
                      <div className="ai-error-actions">
                        {aiProvider === "access" ? (
                          <button onClick={() => switchAiCredentialMode("own")}>改用自备 API Key</button>
                        ) : (
                          <button onClick={() => switchAiCredentialMode("access")}>改用访问码</button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </header>

            <section
              className={`reader-grid pane-${paneMode}`}
              style={
                paneMode === "both"
                  ? { gridTemplateColumns: `minmax(260px, ${splitPct}fr) 10px minmax(300px, ${100 - splitPct}fr)` }
                  : undefined
              }
            >
              {paneMode !== "text" && (
              <section className="panel pdf-panel">
                <div className="panel-header">
                  <h3><BookOpen size={16} /> 原文</h3>
                  <span className="path">{active.pdfPath}</span>
                </div>
                <iframe className="pdf-frame" src={`${baseUrl}${active.pdfPath}`} title={`${active.title} PDF`} />
              </section>
              )}

              {paneMode === "both" && (
                <div
                  className="pane-divider"
                  role="separator"
                  aria-label="调整原文和译文宽度"
                  aria-orientation="vertical"
                  onPointerDown={startPaneResize}
                />
              )}

              {paneMode !== "pdf" && (
              <section className="panel text-panel">
                <div className="panel-header">
                  <h3><FileText size={16} /> {viewMode === "related" ? "相关必读" : "译文解读"}</h3>
                  <span className="path">
                    {viewMode === "related"
                      ? `library/${active.slug}/related_reading.md`
                      : active.markdownPath}
                  </span>
                </div>
                <article className="markdown-pane">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      img: ({ src, alt }) => (
                        <img src={normalizeAssetPath(active.slug, src)} alt={alt || ""} />
                      ),
                      a: ({ href, children }) => (
                        <a href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {markdown}
                  </ReactMarkdown>
                </article>
              </section>
              )}
            </section>
            {viewMode === "reader" && <GiscusComments paper={active} />}
          </>
        )}
      </main>
    </div>
  );
}
