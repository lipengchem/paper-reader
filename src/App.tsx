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
  Send,
  Languages,
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
  relatedReadingPath?: string;
  originalType?: "pdf" | "markdown";
  translationType?: "markdown" | "pdf";
  relatedReadingType?: "markdown" | "pdf";
  ownerLogin?: string;
  personal?: boolean;
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
  categories?: string[];
  tags?: string[];
  hidden?: boolean;
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

type PaneKey = "pdf" | "text" | "ai";

type TranslationPopup = {
  text: string;
  result: string;
  x: number;
  y: number;
  loading: boolean;
  error?: string;
};

type FriendItem = {
  login: string;
  createdAt?: string;
};

type LibraryScope = {
  type: "public" | "mine" | "friend";
  owner?: string;
};

const baseUrl = import.meta.env.BASE_URL;
const libraryBase = `${baseUrl}library/`;
const aiApiBase = (import.meta.env.VITE_AI_API_URL || "").replace(/\/$/, "");
const aiModelKey = "paper-reader:ai-model";
const aiEndpointKey = "paper-reader:ai-endpoint";
const aiCustomBaseUrlKey = "paper-reader:ai-custom-base-url";
const aiApiModeKey = "paper-reader:ai-api-mode";
const aiModels = [
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "deepseek-v4", label: "DeepSeek V4" },
  { id: "deepseek-chat", label: "DeepSeek Chat" },
  { id: "qwen-plus", label: "Qwen Plus" },
  { id: "glm-4-plus", label: "GLM-4 Plus" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];
const aiEndpointPresets = [
  { id: "openai", label: "OpenAI 官方", baseUrl: "https://api.openai.com/v1", mode: "responses" },
  { id: "zhizengzeng", label: "智增增", baseUrl: "https://api.zhizengzeng.com/v1", mode: "chat" },
  { id: "custom", label: "自定义兼容接口", baseUrl: "", mode: "chat" },
];

function normalizeAssetPath(slug: string, src = "") {
  if (/^(https?:|data:|\/)/.test(src)) return src;
  return `${libraryBase}${slug}/${src.replace(/^\.\//, "")}`;
}

function resolveFileUrl(path = "") {
  if (/^https?:/.test(path)) return path;
  return `${baseUrl}${path}`;
}

const paneWeightsKey = "paper-reader:pane-weights";
const defaultPaneWeights: Record<PaneKey, number> = { pdf: 42, text: 42, ai: 22 };
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
  const [personalPapers, setPersonalPapers] = useState<PaperItem[]>([]);
  const [activeSlug, setActiveSlug] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [originalMarkdown, setOriginalMarkdown] = useState("");
  const [viewMode, setViewMode] = useState<"reader" | "related">("reader");
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [journalFilter, setJournalFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"date" | "title" | "rating">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [states, setStates] = useState<Record<string, ReaderState>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendLoginDraft, setFriendLoginDraft] = useState("");
  const [libraryScope, setLibraryScope] = useState<LibraryScope>({ type: "public" });
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadJournal, setUploadJournal] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [uploadOriginal, setUploadOriginal] = useState<File | null>(null);
  const [uploadTranslation, setUploadTranslation] = useState<File | null>(null);
  const [uploadRelated, setUploadRelated] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [ownApiKey, setOwnApiKey] = useState("");
  const [aiReady, setAiReady] = useState(false);
  const [aiModel, setAiModel] = useState(() => localStorage.getItem(aiModelKey) || aiModels[0].id);
  const [aiEndpoint, setAiEndpoint] = useState(() => localStorage.getItem(aiEndpointKey) || "zhizengzeng");
  const [aiCustomBaseUrl, setAiCustomBaseUrl] = useState(() => localStorage.getItem(aiCustomBaseUrlKey) || "");
  const [aiApiMode, setAiApiMode] = useState<"chat" | "responses">(
    () => (localStorage.getItem(aiApiModeKey) === "responses" ? "responses" : "chat"),
  );
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [auth, setAuth] = useState<AuthState>({ authenticated: false });
  const [syncError, setSyncError] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [translateMode, setTranslateMode] = useState(false);
  const [translationPopup, setTranslationPopup] = useState<TranslationPopup | null>(null);
  const [hasNotifications, setHasNotifications] = useState(false);
  const [paneVisibility, setPaneVisibility] = useState<Record<PaneKey, boolean>>({
    pdf: true,
    text: true,
    ai: false,
  });
  const [paneWeights, setPaneWeights] = useState<Record<PaneKey, number>>(() => {
    const stored = localStorage.getItem(paneWeightsKey);
    if (!stored) return defaultPaneWeights;
    try {
      const parsed = JSON.parse(stored) as Partial<Record<PaneKey, number>>;
      return {
        pdf: Number.isFinite(parsed.pdf) ? Math.max(18, parsed.pdf || defaultPaneWeights.pdf) : defaultPaneWeights.pdf,
        text: Number.isFinite(parsed.text) ? Math.max(18, parsed.text || defaultPaneWeights.text) : defaultPaneWeights.text,
        ai: Number.isFinite(parsed.ai) ? Math.max(16, parsed.ai || defaultPaneWeights.ai) : defaultPaneWeights.ai,
      };
    } catch {
      return defaultPaneWeights;
    }
  });
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
    () => [...papers, ...personalPapers].find((paper) => paper.slug === activeSlug),
    [papers, personalPapers, activeSlug],
  );

  const allPapers = useMemo(() => [...papers, ...personalPapers], [papers, personalPapers]);

  useEffect(() => {
    if (!active) return;
    setNoteDraft(states[active.slug]?.note || "");
    setCategoryDraft((states[active.slug]?.categories || []).join(", "));
    setTagDraft((states[active.slug]?.tags || []).join(", "));
    setOriginalMarkdown("");
    if (active.originalType === "markdown") {
      fetch(resolveFileUrl(active.pdfPath), { cache: "no-store", credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error(`${active.pdfPath} ${res.status}`);
          return res.text();
        })
        .then(setOriginalMarkdown)
        .catch((err) => setOriginalMarkdown(`# 原文加载失败\n\n${err.message}`));
    }
    const documentPath = viewMode === "related"
      ? active.relatedReadingPath || `library/${active.slug}/related_reading.md`
      : active.markdownPath;
    const documentType = viewMode === "related" ? active.relatedReadingType || "markdown" : active.translationType || "markdown";
    if (documentType === "pdf") {
      setMarkdown("");
      return;
    }
    fetch(resolveFileUrl(documentPath), { cache: "no-store", credentials: "include" })
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
      loadFriends();
      setLibraryScope((prev) => (prev.type === "public" ? { type: "mine" } : prev));
    }
    setAccountOpen(false);
  }, [auth.authenticated]);

  useEffect(() => {
    if (!auth.authenticated || libraryScope.type === "public") {
      setPersonalPapers([]);
      return;
    }
    const owner = libraryScope.type === "mine" ? auth.login || "" : libraryScope.owner || "";
    loadPersonalPapers(owner);
  }, [auth.authenticated, auth.login, libraryScope]);

  useEffect(() => {
    if (!active) return;
    setAiMessages([]);
    setAiError("");
    setAiReady(false);
  }, [active?.slug]);

  const aiHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const preset = aiEndpointPresets.find((item) => item.id === aiEndpoint) || aiEndpointPresets[1];
    const baseUrl = aiEndpoint === "custom" ? aiCustomBaseUrl.trim() : preset.baseUrl;
    headers["X-OpenAI-Key"] = ownApiKey.trim();
    headers["X-OpenAI-Base-URL"] = baseUrl;
    headers["X-OpenAI-Mode"] = aiEndpoint === "custom" ? aiApiMode : preset.mode;
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

  const loadFriends = async () => {
    if (!aiApiBase || !auth.authenticated) return;
    try {
      const res = await fetch(`${aiApiBase}/friends`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `好友加载失败：${res.status}`);
      setFriends(Array.isArray(data.friends) ? data.friends : []);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "好友加载失败。");
    }
  };

  const addFriend = async () => {
    const login = friendLoginDraft.trim();
    if (!login || !aiApiBase || !auth.authenticated) return;
    try {
      const res = await fetch(`${aiApiBase}/friends`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `好友添加失败：${res.status}`);
      setFriendLoginDraft("");
      setFriends(Array.isArray(data.friends) ? data.friends : []);
      setLibraryScope({ type: "friend", owner: login });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "好友添加失败。");
    }
  };

  const loadPersonalPapers = async (ownerLogin: string) => {
    if (!aiApiBase || !auth.authenticated || !ownerLogin) return;
    try {
      const res = await fetch(`${aiApiBase}/personal-papers?owner=${encodeURIComponent(ownerLogin)}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `个人文献库加载失败：${res.status}`);
      setPersonalPapers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setPersonalPapers([]);
      setSyncError(err instanceof Error ? err.message : "个人文献库加载失败。");
    }
  };

  const uploadPersonalPaper = async () => {
    if (!aiApiBase || !auth.authenticated || !uploadOriginal || !uploadTranslation) {
      setSyncError("请先登录，并至少选择原文和译文文件。");
      return;
    }
    const formData = new FormData();
    formData.set("title", uploadTitle.trim() || uploadOriginal.name.replace(/\.[^.]+$/, ""));
    formData.set("journal", uploadJournal.trim());
    formData.set("date", uploadDate.trim());
    formData.set("original", uploadOriginal);
    formData.set("translation", uploadTranslation);
    if (uploadRelated) formData.set("related", uploadRelated);
    setUploadBusy(true);
    try {
      const res = await fetch(`${aiApiBase}/personal-papers`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `上传失败：${res.status}`);
      setUploadOpen(false);
      setUploadTitle("");
      setUploadJournal("");
      setUploadDate("");
      setUploadOriginal(null);
      setUploadTranslation(null);
      setUploadRelated(null);
      setLibraryScope({ type: "mine" });
      await loadPersonalPapers(auth.login || "");
      if (data.item?.slug) setActiveSlug(data.item.slug);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "上传失败。");
    } finally {
      setUploadBusy(false);
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
    if (!ownApiKey.trim()) {
      setAiError("请先输入你的 API Key。");
      return;
    }
    if (aiEndpoint === "custom" && !aiCustomBaseUrl.trim()) {
      setAiError("请先输入自定义 API Base URL。");
      return;
    }
    localStorage.setItem(aiModelKey, aiModel);
    localStorage.setItem(aiEndpointKey, aiEndpoint);
    localStorage.setItem(aiCustomBaseUrlKey, aiCustomBaseUrl.trim());
    localStorage.setItem(aiApiModeKey, aiApiMode);
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
    if (paneVisibility.ai && active && ownApiKey.trim() && auth.authenticated) {
      loadAiSession();
    }
  }, [paneVisibility.ai, active?.slug, auth.authenticated]);

  const visibleLibraryPapers = libraryScope.type === "public" ? papers : personalPapers;
  const journals = useMemo(() => uniq(visibleLibraryPapers.map((paper) => paper.journal)), [visibleLibraryPapers]);
  const dates = useMemo(() => uniq(visibleLibraryPapers.map((paper) => monthFromDate(paper.date))).reverse(), [visibleLibraryPapers]);
  const categories = useMemo(
    () => Array.from(new Set(Object.values(states).flatMap((state) => state.categories || []))).sort((a, b) => a.localeCompare(b)),
    [states],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = visibleLibraryPapers.filter((paper) => {
      const local = states[paper.slug] || {};
      if (local.hidden) return false;
      const isRead = !!local.read || !!local.rating;
      const searchable = [paper.title, paper.journal, paper.date, ...(paper.collections || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !searchable.includes(q)) return false;
      if (journalFilter !== "all" && paper.journal !== journalFilter) return false;
      if (dateFilter !== "all" && monthFromDate(paper.date) !== dateFilter) return false;
      if (categoryFilter !== "all" && !(local.categories || []).includes(categoryFilter)) return false;
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
  }, [categoryFilter, dateFilter, journalFilter, query, readFilter, sortDirection, sortKey, states, visibleLibraryPapers]);

  useEffect(() => {
    if (!visibleLibraryPapers.length) {
      setActiveSlug("");
      return;
    }
    if (!visibleLibraryPapers.some((paper) => paper.slug === activeSlug)) {
      setActiveSlug(visibleLibraryPapers[0].slug);
    }
  }, [activeSlug, visibleLibraryPapers]);

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

  const saveCategories = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), categories: parseTags(categoryDraft) };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const saveTags = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), tags: parseTags(tagDraft) };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const hidePaper = (slug: string) => {
    if (!window.confirm("从你的文献列表里隐藏这篇文章？这只影响当前登录账号，不会删除网站文件。")) return;
    const next = { ...(states[slug] || {}), hidden: true };
    setStates((prev) => ({ ...prev, [slug]: next }));
    saveReaderState(slug, next);
    if (slug === activeSlug) {
      const nextPaper = filtered.find((paper) => paper.slug !== slug);
      setActiveSlug(nextPaper?.slug || "");
    }
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
    if (!ownApiKey.trim()) {
      setAiError("请先输入你的 API Key。");
      return;
    }
    if (aiEndpoint === "custom" && !aiCustomBaseUrl.trim()) {
      setAiError("请先输入自定义 API Base URL。");
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
    localStorage.setItem(aiModelKey, aiModel);
    localStorage.setItem(aiEndpointKey, aiEndpoint);
    localStorage.setItem(aiCustomBaseUrlKey, aiCustomBaseUrl.trim());
    localStorage.setItem(aiApiModeKey, aiApiMode);

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
            visiblePanes: visiblePaneKeys,
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

  const translateSelection = async (text: string, x: number, y: number) => {
    if (!active || !text) return;
    setTranslationPopup({ text, result: "", x, y, loading: true });
    if (!aiApiBase) {
      setTranslationPopup({ text, result: "", x, y, loading: false, error: "AI 后端还没有配置。" });
      return;
    }
    if (!auth.authenticated) {
      setTranslationPopup({ text, result: "", x, y, loading: false, error: "请先登录 GitHub。" });
      return;
    }
    if (!ownApiKey.trim()) {
      setTranslationPopup({ text, result: "", x, y, loading: false, error: "请先在 AI 栏输入 API Key。" });
      return;
    }
    try {
      const res = await fetch(`${aiApiBase}/chat`, {
        method: "POST",
        credentials: "include",
        headers: aiHeaders(),
        body: JSON.stringify({
          transient: true,
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
            visiblePanes: visiblePaneKeys,
            currentMarkdown: markdown.slice(0, 8000),
          },
          messages: [
            {
              role: "user",
              content: `请把下面选中的学术文本准确翻译成中文；如果是单词或术语，请给出中文含义和一句很短的领域解释。只回答翻译结果，不要展开聊天。\n\n${text}`,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `翻译失败：${res.status}`);
      setTranslationPopup({ text, result: data.answer || "", x, y, loading: false });
    } catch (err) {
      setTranslationPopup({
        text,
        result: "",
        x,
        y,
        loading: false,
        error: err instanceof Error ? err.message : "翻译失败。",
      });
    }
  };

  useEffect(() => {
    if (!translateMode) return;
    const onMouseUp = (event: MouseEvent) => {
      window.setTimeout(() => {
        const text = window.getSelection()?.toString().trim().replace(/\s+/g, " ") || "";
        if (text.length < 2) return;
        translateSelection(text.slice(0, 1200), event.clientX, event.clientY);
      }, 0);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [translateMode, active?.slug, auth.authenticated, ownApiKey, aiModel, aiEndpoint, aiCustomBaseUrl, aiApiMode, markdown, viewMode, paneWeights]);

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

  const visiblePaneKeys = (["pdf", "text", "ai"] as PaneKey[]).filter((key) => paneVisibility[key]);
  const readerGridTemplate = visiblePaneKeys.length
    ? visiblePaneKeys
        .flatMap((key, index) => [
          `minmax(${key === "ai" ? 230 : 260}px, ${paneWeights[key]}fr)`,
          ...(index < visiblePaneKeys.length - 1 ? ["10px"] : []),
        ])
        .join(" ")
    : "1fr";

  const togglePane = (key: PaneKey) => {
    setPaneVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const startPaneResize = (event: ReactPointerEvent<HTMLDivElement>, leftKey: PaneKey, rightKey: PaneKey) => {
    event.preventDefault();
    const grid = event.currentTarget.closest(".reader-grid") as HTMLElement | null;
    const leftPanel = grid?.querySelector(`[data-pane="${leftKey}"]`) as HTMLElement | null;
    const rightPanel = grid?.querySelector(`[data-pane="${rightKey}"]`) as HTMLElement | null;
    const leftRect = leftPanel?.getBoundingClientRect();
    const rightRect = rightPanel?.getBoundingClientRect();
    if (!leftRect || !rightRect) return;

    const leftBoundary = leftRect.left;
    const rightBoundary = rightRect.right;
    const totalWidth = rightBoundary - leftBoundary;
    const totalWeight = paneWeights[leftKey] + paneWeights[rightKey];

    const updateSplit = (clientX: number) => {
      const ratio = Math.min(0.82, Math.max(0.18, (clientX - leftBoundary) / totalWidth));
      const next = {
        ...paneWeights,
        [leftKey]: totalWeight * ratio,
        [rightKey]: totalWeight * (1 - ratio),
      };
      setPaneWeights(next);
      localStorage.setItem(paneWeightsKey, JSON.stringify(next));
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
    setPaneWeights(defaultPaneWeights);
    localStorage.setItem(paneWeightsKey, JSON.stringify(defaultPaneWeights));
  };

  const openRelatedView = () => {
    if (!active) return;
    if (viewMode === "related") {
      setViewMode("reader");
      history.replaceState(null, "", `${baseUrl}?paper=${active.slug}`);
    } else {
      setPaneVisibility((prev) => ({ ...prev, text: true }));
      setViewMode("related");
      history.replaceState(null, "", `${baseUrl}?paper=${active.slug}&view=related`);
    }
  };

  if (!allPapers.length && !error) {
    return (
      <div className="empty-state">
        <p>正在加载文献库...</p>
      </div>
    );
  }

  const hasAiCredential = !!ownApiKey.trim();

  return (
    <div className="shell">
      {sidebarOpen ? (
        <aside className="sidebar">
          <div className="brand">
            <div className="library-switcher">
              <button className="library-title" onClick={() => setLibraryMenuOpen((open) => !open)}>
                文献库
                <ChevronDown size={16} className={libraryMenuOpen ? "chevron open" : "chevron"} />
              </button>
              <p>{visibleLibraryPapers.length} 篇文件</p>
              {libraryMenuOpen && (
                <div className="library-popover">
                  <button
                    className={libraryScope.type === "public" ? "active" : ""}
                    onClick={() => {
                      setLibraryScope({ type: "public" });
                      setLibraryMenuOpen(false);
                    }}
                  >
                    公共文献库
                  </button>
                  {auth.authenticated && (
                    <button
                      className={libraryScope.type === "mine" ? "active" : ""}
                      onClick={() => {
                        setLibraryScope({ type: "mine" });
                        setLibraryMenuOpen(false);
                      }}
                    >
                      我的文献库
                    </button>
                  )}
                  {friends.map((friend) => (
                    <button
                      key={friend.login}
                      className={libraryScope.type === "friend" && libraryScope.owner === friend.login ? "active" : ""}
                      onClick={() => {
                        setLibraryScope({ type: "friend", owner: friend.login });
                        setLibraryMenuOpen(false);
                      }}
                    >
                      {friend.login} 的文献库
                    </button>
                  ))}
                </div>
              )}
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

          {auth.authenticated && libraryScope.type === "mine" && (
            <button className="upload-toggle" onClick={() => setUploadOpen((open) => !open)}>
              上传文献
            </button>
          )}
          {uploadOpen && (
            <div className="upload-popover">
              <label>
                标题
                <input className="tag-input" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} />
              </label>
              <label>
                期刊
                <input className="tag-input" value={uploadJournal} onChange={(event) => setUploadJournal(event.target.value)} />
              </label>
              <label>
                日期
                <input className="tag-input" value={uploadDate} onChange={(event) => setUploadDate(event.target.value)} placeholder="例如：2026-06 或 2026-06-10" />
              </label>
              <label>
                原文
                <input type="file" accept=".pdf,.md,.markdown,text/markdown,application/pdf" onChange={(event) => setUploadOriginal(event.target.files?.[0] || null)} />
              </label>
              <label>
                译文
                <input type="file" accept=".md,.markdown,.pdf,text/markdown,application/pdf" onChange={(event) => setUploadTranslation(event.target.files?.[0] || null)} />
              </label>
              <label>
                相关阅读
                <input type="file" accept=".md,.markdown,.pdf,text/markdown,application/pdf" onChange={(event) => setUploadRelated(event.target.files?.[0] || null)} />
              </label>
              <button onClick={uploadPersonalPaper} disabled={uploadBusy}>
                {uploadBusy ? "上传中..." : "加入我的文献库"}
              </button>
            </div>
          )}

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
              <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">类别</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
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
                  <button
                    className="paper-delete"
                    onClick={() => hidePaper(paper.slug)}
                    title="从我的列表隐藏"
                  >
                    ×
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
                      编辑
                      <ChevronDown size={14} />
                    </button>
                    {metaOpen && (
                      <div className="meta-popover">
                        <label htmlFor="categories">分类</label>
                        <input
                          id="categories"
                          className="tag-input"
                          value={categoryDraft}
                          onChange={(event) => setCategoryDraft(event.target.value)}
                          onBlur={saveCategories}
                          placeholder="例如：DFT, 实验, AI"
                        />
                        <label htmlFor="tags">标签</label>
                        <input
                          id="tags"
                          className="tag-input"
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onBlur={saveTags}
                          placeholder="例如：扩散模型, SSW, HHI"
                        />
                        <label htmlFor="note">本地批注</label>
                        {!auth.authenticated && (
                          <p className="sync-hint">登录后，星级、分类、标签和批注会按账号跨设备保存。</p>
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
                  <button className={translateMode ? "active" : ""} onClick={() => setTranslateMode((mode) => !mode)}>
                    <Languages size={16} />
                    翻译
                  </button>
                </div>
                <div className="toolbar-row toolbar-row-bottom">
                  <div className="layout-control" aria-label="阅读区域显示模式">
                    <button className={paneVisibility.pdf ? "active" : ""} onClick={() => togglePane("pdf")}>
                      原文
                    </button>
                    <button className={paneVisibility.text ? "active" : ""} onClick={() => togglePane("text")}>
                      译文
                    </button>
                    <button className={paneVisibility.ai ? "active" : ""} onClick={() => togglePane("ai")}>
                      <Bot size={14} />
                      AI
                    </button>
                  </div>
                  <div className="toolbar-account-group">
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
                          {hasNotifications && <span className="account-dot" />}
                          <ChevronDown size={14} className={accountOpen ? "chevron open" : "chevron"} />
                        </button>
                        {accountOpen && (
                          <div className="account-popover">
                            <div className="account-name">{auth.login}</div>
                            <button onClick={() => setHasNotifications(false)}>
                              通知
                              {hasNotifications && <span className="menu-dot" />}
                            </button>
                            <button onClick={() => setFriendOpen((open) => !open)}>好友</button>
                            {friendOpen && (
                              <div className="friend-box">
                                <input
                                  className="tag-input"
                                  value={friendLoginDraft}
                                  onChange={(event) => setFriendLoginDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") addFriend();
                                  }}
                                  placeholder="GitHub 用户名"
                                />
                                <button onClick={addFriend}>添加</button>
                              </div>
                            )}
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
                          {hasNotifications && <span className="account-dot" />}
                          <ChevronDown size={14} className={accountOpen ? "chevron open" : "chevron"} />
                        </button>
                        {accountOpen && (
                          <div className="account-popover">
                            <button onClick={() => setHasNotifications(false)}>
                              通知
                              {hasNotifications && <span className="menu-dot" />}
                            </button>
                            <button onClick={loginWithGitHub}>登录</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <section className="reader-grid" style={{ gridTemplateColumns: readerGridTemplate }}>
              {!visiblePaneKeys.length && <div className="reader-empty">当前没有显示的阅读栏。</div>}
              {visiblePaneKeys.map((pane, index) => (
                <div className="pane-slot" key={pane}>
                  {pane === "pdf" && (
                    <section className="panel pdf-panel" data-pane="pdf">
                      <div className="panel-header">
                        <h3><BookOpen size={16} /> 原文</h3>
                        <span className="path">{active.pdfPath}</span>
                      </div>
                      {active.originalType === "markdown" ? (
                        <article className="markdown-pane">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                            {originalMarkdown}
                          </ReactMarkdown>
                        </article>
                      ) : (
                        <iframe className="pdf-frame" src={resolveFileUrl(active.pdfPath)} title={`${active.title} PDF`} />
                      )}
                    </section>
                  )}
                  {pane === "text" && (
                    <section className="panel text-panel" data-pane="text">
                      <div className="panel-header">
                        <h3><FileText size={16} /> {viewMode === "related" ? "相关必读" : "译文解读"}</h3>
                        <span className="path">
                          {viewMode === "related"
                            ? active.relatedReadingPath || `library/${active.slug}/related_reading.md`
                            : active.markdownPath}
                        </span>
                      </div>
                      {((viewMode === "related" ? active.relatedReadingType : active.translationType) || "markdown") === "pdf" ? (
                        <iframe
                          className="pdf-frame"
                          src={resolveFileUrl(viewMode === "related" ? active.relatedReadingPath || "" : active.markdownPath)}
                          title={`${active.title} ${viewMode === "related" ? "related reading" : "translation"}`}
                        />
                      ) : (
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
                      )}
                    </section>
                  )}
                  {pane === "ai" && (
                    <section className="panel ai-panel" data-pane="ai" aria-label="AI 文献助手">
                      <div className="panel-header ai-header">
                        <div>
                          <h3><Bot size={16} /> AI 文献助手</h3>
                          <span className="path">{active.title}</span>
                        </div>
                        <button className="icon-button" onClick={() => togglePane("ai")} title="隐藏 AI">
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
                          <p>已登录：{auth.login}。填写任意 OpenAI 兼容 API，即可使用 AI。</p>
                          <div className="ai-controls">
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
                              placeholder="输入 API Key，按 Enter 进入"
                            />
                            <input
                              className="ai-model-input"
                              list="ai-model-options"
                              value={aiModel}
                              onChange={(event) => setAiModel(event.target.value)}
                              placeholder="模型名"
                            />
                          </div>
                          <datalist id="ai-model-options">
                            {aiModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.label}
                              </option>
                            ))}
                          </datalist>
                          <div className="ai-endpoint-grid">
                            <label>
                              API 平台
                              <select
                                className="select"
                                value={aiEndpoint}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setAiEndpoint(next);
                                  const preset = aiEndpointPresets.find((item) => item.id === next);
                                  if (preset) setAiApiMode(preset.mode as "chat" | "responses");
                                  setAiReady(false);
                                  setAiError("");
                                }}
                              >
                                {aiEndpointPresets.map((preset) => (
                                  <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              API 格式
                              <select
                                className="select"
                                value={aiEndpoint === "custom" ? aiApiMode : (aiEndpointPresets.find((item) => item.id === aiEndpoint)?.mode || "chat")}
                                onChange={(event) => setAiApiMode(event.target.value as "chat" | "responses")}
                                disabled={aiEndpoint !== "custom"}
                              >
                                <option value="chat">chat/completions</option>
                                <option value="responses">responses</option>
                              </select>
                            </label>
                            <label className="ai-endpoint-wide">
                              Base URL
                              <input
                                className="ai-access"
                                value={aiEndpoint === "custom" ? aiCustomBaseUrl : (aiEndpointPresets.find((item) => item.id === aiEndpoint)?.baseUrl || "")}
                                onChange={(event) => {
                                  setAiCustomBaseUrl(event.target.value);
                                  setAiReady(false);
                                }}
                                disabled={aiEndpoint !== "custom"}
                                placeholder="https://api.example.com/v1"
                              />
                            </label>
                          </div>
                          <button onClick={loadAiSession} disabled={aiBusy || !hasAiCredential}>
                            {aiBusy ? "正在进入..." : "进入 AI"}
                          </button>
                          <p className="ai-note">API Key 只用于当前浏览器本次请求转发，不会写入数据库或网页文件。GitHub 只用于保存你的阅读状态和聊天记录。</p>
                        </div>
                      ) : (
                        <>
                          <div className="ai-session-bar">
                            <span>{aiEndpointPresets.find((item) => item.id === aiEndpoint)?.label || "自定义接口"} · {auth.login}</span>
                            <input
                              className="ai-model-input"
                              list="ai-model-options"
                              value={aiModel}
                              onChange={(event) => setAiModel(event.target.value)}
                              title="模型名"
                            />
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
                            {aiMessages.map((message, messageIndex) => (
                              <div key={`${message.createdAt}-${messageIndex}`} className={`ai-message ${message.role}`}>
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
                            <button onClick={() => setAiReady(false)}>切换 API 配置</button>
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                  {index < visiblePaneKeys.length - 1 && (
                    <div
                      className="pane-divider"
                      role="separator"
                      aria-label="调整阅读栏宽度"
                      aria-orientation="vertical"
                      onPointerDown={(event) => startPaneResize(event, pane, visiblePaneKeys[index + 1])}
                      onDoubleClick={resetPaneSplit}
                    />
                  )}
                </div>
              ))}
            </section>
            {translationPopup && translateMode && (
              <div
                className="translation-popover"
                style={{
                  left: Math.min(Math.max(14, translationPopup.x + 12), Math.max(14, window.innerWidth - 360)),
                  top: Math.min(Math.max(14, translationPopup.y + 12), Math.max(14, window.innerHeight - 220)),
                }}
              >
                <div className="translation-head">
                  <strong>快速翻译</strong>
                  <button className="icon-button" onClick={() => setTranslationPopup(null)} title="关闭">
                    ×
                  </button>
                </div>
                <p className="translation-source">{translationPopup.text}</p>
                {translationPopup.loading && <p className="translation-result">正在翻译...</p>}
                {translationPopup.error && <p className="translation-error">{translationPopup.error}</p>}
                {translationPopup.result && <p className="translation-result">{translationPopup.result}</p>}
              </div>
            )}
            {viewMode === "reader" && <GiscusComments paper={active} />}
          </>
        )}
      </main>
    </div>
  );
}
