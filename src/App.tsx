import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Highlighter,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
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

const baseUrl = import.meta.env.BASE_URL;
const libraryBase = `${baseUrl}library/`;

function normalizeAssetPath(slug: string, src = "") {
  if (/^(https?:|data:|\/)/.test(src)) return src;
  return `${libraryBase}${slug}/${src.replace(/^\.\//, "")}`;
}

function stateKey(slug: string) {
  return `paper-reader:${slug}`;
}

const splitStateKey = "paper-reader:pane-split";

function readLocalState(slug: string): ReaderState {
  try {
    return JSON.parse(localStorage.getItem(stateKey(slug)) || "{}");
  } catch {
    return {};
  }
}

function writeLocalState(slug: string, value: ReaderState) {
  localStorage.setItem(
    stateKey(slug),
    JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
  );
}

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
  const [sortOpen, setSortOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [splitPct, setSplitPct] = useState(() => {
    const stored = Number(localStorage.getItem(splitStateKey));
    return Number.isFinite(stored) && stored >= 25 && stored <= 75 ? stored : 50;
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
        const loaded: Record<string, ReaderState> = {};
        for (const item of items) loaded[item.slug] = readLocalState(item.slug);
        setStates(loaded);
      })
      .catch((err) => setError(`无法加载文献索引：${err.message}`));
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
    writeLocalState(slug, next);
    setStates((prev) => ({ ...prev, [slug]: next }));
  };

  const saveNote = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), note: noteDraft };
    writeLocalState(active.slug, next);
    setStates((prev) => ({ ...prev, [active.slug]: next }));
  };

  const saveTags = () => {
    if (!active) return;
    const next = { ...(states[active.slug] || {}), tags: parseTags(tagDraft) };
    writeLocalState(active.slug, next);
    setStates((prev) => ({ ...prev, [active.slug]: next }));
  };

  const startPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paneMode !== "both") return;
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
    updateSplit(event.clientX);
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
              </div>
              <div className="toolbar">
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
                <button onClick={() => location.reload()}>
                  <RefreshCw size={16} />
                  刷新
                </button>
              </div>
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
                  onDoubleClick={resetPaneSplit}
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
          </>
        )}
      </main>
    </div>
  );
}
