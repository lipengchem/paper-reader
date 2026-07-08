import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  Bot,
  BookOpen,
  ChevronDown,
  Eraser,
  ExternalLink,
  FileText,
  Highlighter,
  LogOut,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Send,
  Trash2,
  Underline,
  Upload,
  User,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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
  createdAt?: string;
  uploadedAt?: string;
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
  pdfAnnotations?: PdfAnnotation[];
  hidden?: boolean;
  note?: string;
  scrollTop?: number;
  updatedAt?: string;
};

type PdfAnnotationKind = "highlight" | "underline";

type PdfAnnotation = {
  id: string;
  page: number;
  kind: PdfAnnotationKind;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  color?: string;
  createdAt?: string;
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

type FriendItem = {
  login: string;
  createdAt?: string;
};

type LibraryScope = {
  type: "mine" | "friend";
  owner?: string;
};

type SortKey = "date" | "uploaded" | "title" | "rating" | "journal" | "category";

type CommentNotification = {
  id: string;
  paperSlug?: string;
  title: string;
  url: string;
  updatedAt: string;
  commentCount: number;
  latestAuthor?: string;
  latestBody?: string;
  unread?: boolean;
};

const baseUrl = import.meta.env.BASE_URL;
const fileBase = (import.meta.env.VITE_FILE_BASE_URL || `${baseUrl}`).replace(/\/$/, "");
const libraryBase = `${fileBase}/library/`;
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
  return `${fileBase}/${path.replace(/^\/+/, "")}`;
}

function resolvePdfUrl(path = "") {
  const url = resolveFileUrl(path);
  const separator = url.includes("#") ? "&" : "#";
  return `${url}${separator}view=FitH&zoom=page-width`;
}

const paneWeightsKey = "paper-reader:pane-weights";
const sidebarWidthKey = "paper-reader:sidebar-width";
const overviewColumnWidthsKey = "paper-reader:overview-column-widths";
const commentsHeightKey = "paper-reader:comments-height";
const defaultPaneWeights: Record<PaneKey, number> = { pdf: 42, text: 42, ai: 22 };
const defaultSidebarWidth = 300;
const defaultCommentsHeight = 520;
const defaultOverviewColumnWidths: Record<SortKey, number> = {
  title: 560,
  journal: 250,
  date: 130,
  rating: 130,
  category: 150,
  uploaded: 150,
};
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

type ParsedSearchQuery = {
  mode: "all" | "category" | "tag";
  value: string;
};

function parseSearchQuery(value: string): ParsedSearchQuery {
  const trimmed = value.trim().toLowerCase();
  const prefixMatch = trimmed.match(/^(tag|tags|标签|label|cat|category|类别|分类)\s*[:：]\s*(.+)$/);
  if (!prefixMatch) return { mode: "all", value: trimmed };
  const prefix = prefixMatch[1];
  const mode = ["tag", "tags", "标签", "label"].includes(prefix) ? "tag" : "category";
  return { mode, value: prefixMatch[2].trim() };
}

function searchTokens(value = "") {
  return value
    .toLowerCase()
    .split(/[\s,;:()[\]{}'"，。；：、/\\._-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function matchesSearchField(value: string | undefined, query: string) {
  if (!query) return true;
  const normalized = (value || "").toLowerCase();
  if (!normalized) return false;
  const tokens = searchTokens(normalized);
  if (tokens.some((token) => token.startsWith(query))) return true;
  return query.length >= 3 && normalized.includes(query);
}

function matchSearchList(values: string[] | undefined, query: string) {
  return (values || []).some((value) => matchesSearchField(value, query));
}

function searchRank(paper: PaperItem, local: ReaderState, parsed: ParsedSearchQuery) {
  const q = parsed.value;
  if (!q) return 0;
  const categoryMatch = matchSearchList(local.categories, q);
  const tagMatch = matchSearchList(local.tags, q);
  const metadataMatch = [paper.title, paper.journal, paper.date, ...(paper.collections || [])].some((value) =>
    matchesSearchField(value, q),
  );
  if (parsed.mode === "category") return categoryMatch ? 0 : Number.POSITIVE_INFINITY;
  if (parsed.mode === "tag") return tagMatch ? 0 : Number.POSITIVE_INFINITY;
  if (categoryMatch || tagMatch) return 0;
  if (metadataMatch) return 1;
  return Number.POSITIVE_INFINITY;
}

function formatShortTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayJournalName(journal = "") {
  if (!journal) return "Unknown journal";
  const normalized = journal.replace(/[.&]/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 3) return journal;
  const known: Record<string, string> = {
    "journal of the american chemical society": "JACS",
    "the journal of physical chemistry b": "JPCB",
    "journal of physical chemistry b": "JPCB",
    "the journal of physical chemistry c": "JPCC",
    "journal of physical chemistry c": "J. Phys. Chem. C",
    "the journal of physical chemistry letters": "JPCL",
    "journal of physical chemistry letters": "JPCL",
    "journal of chemical theory and computation": "JCTC",
    "advanced intelligent discovery": "Adv. Intell. Discov.",
    "nature machine intelligence": "Nat. Mach. Intell.",
    "nature computational science": "Nat. Comput. Sci.",
    "nature communications": "Nature Communications",
  };
  const key = normalized.toLowerCase();
  if (known[key]) return known[key];
  const ignored = new Set(["of", "the", "and", "for", "in", "on", "a", "an"]);
  const abbreviation = words
    .filter((word) => !ignored.has(word.toLowerCase()))
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
  return abbreviation || journal;
}

function createAnnotationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizePdfAnnotations(value: unknown): PdfAnnotation[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 1000)
    .map((item: any) => {
      const rects = Array.isArray(item?.rects)
        ? item.rects
            .slice(0, 30)
            .map((rect: any) => ({
              x: clampPercent(Number(rect?.x)),
              y: clampPercent(Number(rect?.y)),
              width: clampPercent(Number(rect?.width)),
              height: clampPercent(Number(rect?.height)),
            }))
            .filter((rect: { width: number; height: number }) => rect.width > 0 && rect.height > 0)
        : [];
      return {
        id: String(item?.id || createAnnotationId()).slice(0, 80),
        page: Math.max(1, Math.floor(Number(item?.page || 1))),
        kind: item?.kind === "underline" ? "underline" : "highlight",
        rects,
        color: String(item?.color || "").slice(0, 32),
        createdAt: String(item?.createdAt || "").slice(0, 40),
      } as PdfAnnotation;
    })
    .filter((item) => item.rects.length);
}

function rectsFromSelection(range: Range, container: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  if (!containerRect.width || !containerRect.height) return [];
  return Array.from(range.getClientRects())
    .map((rect) => {
      const left = Math.max(rect.left, containerRect.left);
      const top = Math.max(rect.top, containerRect.top);
      const right = Math.min(rect.right, containerRect.right);
      const bottom = Math.min(rect.bottom, containerRect.bottom);
      const width = right - left;
      const height = bottom - top;
      if (width < 2 || height < 2) return null;
      return {
        x: ((left - containerRect.left) / containerRect.width) * 100,
        y: ((top - containerRect.top) / containerRect.height) * 100,
        width: (width / containerRect.width) * 100,
        height: (height / containerRect.height) * 100,
      };
    })
    .filter(Boolean) as PdfAnnotation["rects"];
}

function PdfPageView({
  page,
  pageNumber,
  annotations,
  mode,
  canEdit,
  onAdd,
  onDelete,
}: {
  page: any;
  pageNumber: number;
  annotations: PdfAnnotation[];
  mode: PdfAnnotationKind | "select" | "erase";
  canEdit: boolean;
  onAdd: (annotation: PdfAnnotation) => void;
  onDelete: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    let renderTask: any;

    async function renderPage() {
      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer) return;
      const viewport = page.getViewport({ scale: 1.35 });
      const dpr = window.devicePixelRatio || 1;
      setPageSize({ width: viewport.width, height: viewport.height });
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (cancelled) return;

      const textContent = await page.getTextContent();
      if (cancelled) return;
      textLayer.innerHTML = "";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      for (const item of textContent.items || []) {
        if (!item.str) continue;
        const span = document.createElement("span");
        const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(transform[2], transform[3]) || 10;
        const angle = Math.atan2(transform[1], transform[0]);
        span.textContent = item.str;
        span.style.left = `${transform[4]}px`;
        span.style.top = `${transform[5] - fontHeight}px`;
        span.style.fontSize = `${fontHeight}px`;
        span.style.fontFamily = "serif";
        span.style.transform = `rotate(${angle}rad)`;
        textLayer.appendChild(span);
      }
    }

    renderPage().catch(() => {
      if (textLayerRef.current) textLayerRef.current.textContent = "PDF 页面渲染失败";
    });

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        // Ignore render cancellation races.
      }
    };
  }, [page]);

  const addAnnotationFromSelection = () => {
    if (!canEdit || (mode !== "highlight" && mode !== "underline")) return;
    const selection = window.getSelection();
    const pageEl = pageRef.current;
    const textLayer = textLayerRef.current;
    if (!selection || !pageEl || !textLayer || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
    const endNode = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
    if (!(startNode instanceof Node) || !(endNode instanceof Node)) return;
    if (!textLayer.contains(startNode) || !textLayer.contains(endNode)) return;
    const rects = rectsFromSelection(range, pageEl);
    selection.removeAllRanges();
    if (!rects.length) return;
    onAdd({
      id: createAnnotationId(),
      page: pageNumber,
      kind: mode,
      rects,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="pdf-page-shell" style={{ width: pageSize.width, height: pageSize.height }}>
      <div
        ref={pageRef}
        className={`pdf-page ${mode !== "select" ? `pdf-mode-${mode}` : ""}`}
        onPointerUp={addAnnotationFromSelection}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="pdf-text-layer" />
        <div className="pdf-annotation-layer" aria-hidden="true">
          {annotations.map((annotation) =>
            annotation.rects.map((rect, index) => (
              <button
                key={`${annotation.id}-${index}`}
                className={`pdf-annotation pdf-annotation-${annotation.kind}`}
                style={{
                  left: `${rect.x}%`,
                  top: `${rect.y}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
                type="button"
                title={canEdit && mode === "erase" ? "删除这个标注" : "PDF 标注"}
                onClick={(event) => {
                  if (!canEdit || mode !== "erase") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete(annotation.id);
                }}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function PdfReader({
  src,
  title,
  annotations,
  canEdit,
  onChange,
  onUploadAnnotatedPdf,
  uploadBusy,
}: {
  src: string;
  title: string;
  annotations: PdfAnnotation[];
  canEdit: boolean;
  onChange: (next: PdfAnnotation[]) => void;
  onUploadAnnotatedPdf: (file: File) => void;
  uploadBusy?: boolean;
}) {
  const nativeSaveInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="pdf-reader">
      <div className="pdf-native-toolbar">
        <button
          onClick={() => nativeSaveInputRef.current?.click()}
          disabled={!canEdit || uploadBusy}
          title={canEdit ? "选择原生 PDF 工具保存后的文件，自动保存到我的文献库" : "当前文献库只读"}
        >
          <Upload size={15} />
          {uploadBusy ? "保存中..." : "保存修改"}
        </button>
        <span className="pdf-annotation-hint">
          用内嵌 PDF 工具标注后，先用 PDF 工具栏保存文件，再点这里接回网页。
        </span>
        <input
          ref={nativeSaveInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onUploadAnnotatedPdf(file);
          }}
        />
      </div>
      <iframe className="pdf-frame pdf-native-frame" src={resolvePdfUrl(src)} title={`${title} PDF`} />
    </div>
  );

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [mode, setMode] = useState<PdfAnnotationKind | "select" | "erase">("select");
  const [readerMode, setReaderMode] = useState<"native" | "legacy">("native");
  const [error, setError] = useState("");
  const normalizedAnnotations = useMemo(() => normalizePdfAnnotations(annotations), [annotations]);

  useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setPages([]);
    setError("");
    const task = pdfjsLib.getDocument({ url: src });
    task.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        const loadedPages = await Promise.all(
          Array.from({ length: doc.numPages }, (_, index) => doc.getPage(index + 1)),
        );
        if (!cancelled) setPages(loadedPages);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "PDF 加载失败");
      });
    return () => {
      cancelled = true;
      try {
        task.destroy();
      } catch {
        // Ignore cleanup races.
      }
    };
  }, [src]);

  const addAnnotation = (annotation: PdfAnnotation) => {
    onChange(normalizePdfAnnotations([...normalizedAnnotations, annotation]));
  };

  const deleteAnnotation = (id: string) => {
    onChange(normalizedAnnotations.filter((annotation) => annotation.id !== id));
  };

  const saveAnnotatedPdf = async () => {
    if (!canEdit || uploadBusy) return;
    if (!normalizedAnnotations.length) {
      setError("先添加高亮或下划线，再保存批注版 PDF。");
      return;
    }
    try {
      setError("");
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) throw new Error(`PDF 下载失败：${res.status}`);
      const pdf = await PDFDocument.load(await res.arrayBuffer());
      const pdfPages = pdf.getPages();
      for (const annotation of normalizedAnnotations) {
        const page = pdfPages[annotation.page - 1];
        if (!page) continue;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        for (const rect of annotation.rects) {
          const x = (rect.x / 100) * pageWidth;
          const y = pageHeight - ((rect.y + rect.height) / 100) * pageHeight;
          const width = (rect.width / 100) * pageWidth;
          const height = (rect.height / 100) * pageHeight;
          if (width <= 0 || height <= 0) continue;
          if (annotation.kind === "highlight") {
            page.drawRectangle({
              x,
              y,
              width,
              height,
              color: rgb(1, 0.82, 0.18),
              opacity: 0.36,
              borderOpacity: 0,
            });
          } else {
            const lineY = y + Math.max(1, height * 0.12);
            page.drawLine({
              start: { x, y: lineY },
              end: { x: x + width, y: lineY },
              thickness: Math.max(0.9, pageHeight * 0.0012),
              color: rgb(0.9, 0.48, 0),
              opacity: 0.95,
            });
          }
        }
      }
      const bytes = await pdf.save();
      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "paper";
      await onUploadAnnotatedPdf(new File([pdfBuffer], `${safeTitle}-annotated.pdf`, { type: "application/pdf" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "批注版 PDF 保存失败。");
    }
  };

  return (
    <div className="pdf-reader">
      <div className="pdf-annotation-toolbar">
        <button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")} title="普通选择">
          <MousePointer2 size={15} />
          选择
        </button>
        <button
          className={mode === "highlight" ? "active" : ""}
          onClick={() => setMode("highlight")}
          disabled={!canEdit}
          title={canEdit ? "选中文字后添加高亮" : "好友文献库只读"}
        >
          <Highlighter size={15} />
          高亮
        </button>
        <button
          className={mode === "underline" ? "active" : ""}
          onClick={() => setMode("underline")}
          disabled={!canEdit}
          title={canEdit ? "选中文字后添加下划线" : "好友文献库只读"}
        >
          <Underline size={15} />
          下划线
        </button>
        <button
          className={mode === "erase" ? "active" : ""}
          onClick={() => setMode("erase")}
          disabled={!canEdit || !normalizedAnnotations.length}
          title="点击已有标注删除"
        >
          <Eraser size={15} />
          删除
        </button>
        <button
          onClick={saveAnnotatedPdf}
          disabled={!canEdit || uploadBusy || !normalizedAnnotations.length}
          title="生成带批注的 PDF 并保存到我的文献库"
        >
          <Save size={15} />
          {uploadBusy ? "保存中..." : "保存批注版"}
        </button>
        <span className="pdf-annotation-hint">
          {canEdit ? "在这里标注，点保存批注版后会自动上传到我的文献库。" : "当前文献库只读。"}
        </span>
      </div>
      {error ? (
        <div className="pdf-reader-error">{error}</div>
      ) : !pdfDoc || !pages.length ? (
        <div className="pdf-reader-loading">正在加载 PDF...</div>
      ) : (
        <div className="pdf-reader-pages" aria-label={`${title} PDF`}>
          {pages.map((page, index) => (
            <PdfPageView
              key={index}
              page={page}
              pageNumber={index + 1}
              annotations={normalizedAnnotations.filter((annotation) => annotation.page === index + 1)}
              mode={mode}
              canEdit={canEdit}
              onAdd={addAnnotation}
              onDelete={deleteAnnotation}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pdf-reader">
      {readerMode === "native" ? (
        <>
          <div className="pdf-native-toolbar">
            <button onClick={() => window.open(src, "_blank", "noopener,noreferrer")} title="用浏览器 PDF 工具打开和标注">
              <ExternalLink size={15} />
              浏览器标注
            </button>
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={!canEdit || uploadBusy}
              title={canEdit ? "上传保存后的带批注 PDF，替换到我的文献库" : "只能在我的文献库保存批注版 PDF"}
            >
              <Upload size={15} />
              {uploadBusy ? "上传中..." : "上传批注版"}
            </button>
            <button onClick={() => setReaderMode("legacy")} title="使用旧版网页高亮/下划线">
              <Highlighter size={15} />
              旧版网页标注
            </button>
            <span className="pdf-annotation-hint">
              建议在新标签页用浏览器原生高亮/下划线，保存 PDF 后上传回来。
            </span>
            <input
              ref={uploadInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) onUploadAnnotatedPdf(file);
              }}
            />
          </div>
          <iframe className="pdf-frame pdf-native-frame" src={resolvePdfUrl(src)} title={`${title} PDF`} />
        </>
      ) : (
        <>
      <div className="pdf-annotation-toolbar">
        <button onClick={() => setReaderMode("native")} title="回到浏览器原生 PDF 阅读器">
          <ExternalLink size={15} />
          原生 PDF
        </button>
        <button className={mode === "select" ? "active" : ""} onClick={() => setMode("select")} title="普通选择">
          <MousePointer2 size={15} />
          选择
        </button>
        <button
          className={mode === "highlight" ? "active" : ""}
          onClick={() => setMode("highlight")}
          disabled={!canEdit}
          title={canEdit ? "选中文字后保存高亮" : "好友文献库只读"}
        >
          <Highlighter size={15} />
          高亮
        </button>
        <button
          className={mode === "underline" ? "active" : ""}
          onClick={() => setMode("underline")}
          disabled={!canEdit}
          title={canEdit ? "选中文字后保存下划线" : "好友文献库只读"}
        >
          <Underline size={15} />
          下划线
        </button>
        <button
          className={mode === "erase" ? "active" : ""}
          onClick={() => setMode("erase")}
          disabled={!canEdit || !normalizedAnnotations.length}
          title="点击已有标注删除"
        >
          <Eraser size={15} />
          删除
        </button>
        <span className="pdf-annotation-hint">
          {canEdit ? "高亮/下划线会保存到你的账号" : "当前文献库只读"}
        </span>
      </div>
      {error ? (
        <div className="pdf-reader-error">{error}</div>
      ) : !pdfDoc || !pages.length ? (
        <div className="pdf-reader-loading">正在加载 PDF...</div>
      ) : (
        <div className="pdf-reader-pages" aria-label={`${title} PDF`}>
          {pages.map((page, index) => (
            <PdfPageView
              key={index}
              page={page}
              pageNumber={index + 1}
              annotations={normalizedAnnotations.filter((annotation) => annotation.page === index + 1)}
              mode={mode}
              canEdit={canEdit}
              onAdd={addAnnotation}
              onDelete={deleteAnnotation}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function GiscusComments({ paper }: { paper: PaperItem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const discussionSearchUrl = `https://github.com/${giscusRepo}/discussions?discussions_q=${encodeURIComponent(paper.slug)}`;
  const [commentsHeight, setCommentsHeight] = useState(() => {
    const stored = Number(localStorage.getItem(commentsHeightKey));
    return Number.isFinite(stored) && stored >= 260 ? stored : defaultCommentsHeight;
  });

  const startCommentsResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = commentsHeight;

    const updateHeight = (clientY: number) => {
      const next = Math.min(1000, Math.max(260, startHeight + clientY - startY));
      setCommentsHeight(next);
      localStorage.setItem(commentsHeightKey, String(next));
    };
    const onPointerMove = (moveEvent: PointerEvent) => updateHeight(moveEvent.clientY);
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-comments");
    };

    document.body.classList.add("is-resizing-comments");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const resetCommentsHeight = () => {
    setCommentsHeight(defaultCommentsHeight);
    localStorage.setItem(commentsHeightKey, String(defaultCommentsHeight));
  };

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
    <section className="comments-section" id="paper-comments" style={{ minHeight: commentsHeight }}>
      <div
        className="comments-resizer"
        role="separator"
        aria-label="调整评论区高度"
        aria-orientation="horizontal"
        onPointerDown={startCommentsResize}
        onDoubleClick={resetCommentsHeight}
      />
      <div className="comments-heading">
        <h2>评论区</h2>
        <a href={discussionSearchUrl} target="_blank" rel="noreferrer">
          打开讨论页回复
        </a>
      </div>
      <div className="giscus-container" ref={containerRef} />
    </section>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [personalPapers, setPersonalPapers] = useState<PaperItem[]>([]);
  const [myPapers, setMyPapers] = useState<PaperItem[]>([]);
  const [activeSlug, setActiveSlug] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [originalMarkdown, setOriginalMarkdown] = useState("");
  const [viewMode, setViewMode] = useState<"reader" | "related">("reader");
  const [pendingCommentScroll, setPendingCommentScroll] = useState(false);
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [journalFilter, setJournalFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
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
  const [libraryScope, setLibraryScope] = useState<LibraryScope>({ type: "mine" });
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadJournal, setUploadJournal] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [uploadOriginal, setUploadOriginal] = useState<File | null>(null);
  const [uploadTranslation, setUploadTranslation] = useState<File | null>(null);
  const [uploadRelated, setUploadRelated] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [annotatedPdfBusy, setAnnotatedPdfBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
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
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(sidebarWidthKey));
    return Number.isFinite(stored) && stored >= 220 ? stored : defaultSidebarWidth;
  });
  const [notifications, setNotifications] = useState<CommentNotification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
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
  const [overviewColumnWidths, setOverviewColumnWidths] = useState<Record<SortKey, number>>(() => {
    const stored = localStorage.getItem(overviewColumnWidthsKey);
    if (!stored) return defaultOverviewColumnWidths;
    try {
      const parsed = JSON.parse(stored) as Partial<Record<SortKey, number>>;
      return {
        title: Number.isFinite(parsed.title) ? Math.max(220, parsed.title || defaultOverviewColumnWidths.title) : defaultOverviewColumnWidths.title,
        journal: Number.isFinite(parsed.journal) ? Math.max(120, parsed.journal || defaultOverviewColumnWidths.journal) : defaultOverviewColumnWidths.journal,
        date: Number.isFinite(parsed.date) ? Math.max(100, parsed.date || defaultOverviewColumnWidths.date) : defaultOverviewColumnWidths.date,
        rating: Number.isFinite(parsed.rating) ? Math.max(100, parsed.rating || defaultOverviewColumnWidths.rating) : defaultOverviewColumnWidths.rating,
        category: Number.isFinite(parsed.category) ? Math.max(110, parsed.category || defaultOverviewColumnWidths.category) : defaultOverviewColumnWidths.category,
        uploaded: Number.isFinite(parsed.uploaded) ? Math.max(120, parsed.uploaded || defaultOverviewColumnWidths.uploaded) : defaultOverviewColumnWidths.uploaded,
      };
    } catch {
      return defaultOverviewColumnWidths;
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
  const canEditReaderState = auth.authenticated && libraryScope.type === "mine";
  const viewedOwner = libraryScope.type === "friend" ? libraryScope.owner || "" : auth.login || "";

  useEffect(() => {
    if (!canEditReaderState) setMetaOpen(false);
  }, [canEditReaderState]);

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
      loadFriends();
      loadNotifications();
    }
    setAccountOpen(false);
  }, [auth.authenticated]);

  useEffect(() => {
    if (!auth.authenticated) {
      setNotifications([]);
      return;
    }
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 1000 * 60 * 3);
    return () => window.clearInterval(timer);
  }, [auth.authenticated, auth.login]);

  useEffect(() => {
    setSyncError("");
    if (!auth.authenticated) {
      setPersonalPapers([]);
      setMyPapers([]);
      setStates({});
      return;
    }
    loadReaderStates(libraryScope.type === "friend" ? viewedOwner : undefined);
    loadMyPapers();
    loadPersonalPapers(viewedOwner);
  }, [auth.authenticated, auth.login, libraryScope, viewedOwner]);

  useEffect(() => {
    if (!active) return;
    setAiMessages([]);
    setAiError("");
    setAiReady(false);
  }, [active?.slug]);

  useEffect(() => {
    if (!pendingCommentScroll || viewMode !== "reader" || !active) return;
    const timer = window.setTimeout(() => {
      document.getElementById("paper-comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingCommentScroll(false);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [pendingCommentScroll, viewMode, active?.slug]);

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

  const loadReaderStates = async (ownerLogin?: string) => {
    if (!aiApiBase || !auth.authenticated) return;
    try {
      const suffix = ownerLogin ? `?owner=${encodeURIComponent(ownerLogin)}` : "";
      const res = await fetch(`${aiApiBase}/states${suffix}`, { credentials: "include" });
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

  const loadNotifications = async () => {
    if (!aiApiBase || !auth.authenticated) {
      setNotifications([]);
      return;
    }
    try {
      const res = await fetch(`${aiApiBase}/notifications/comments`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `评论通知加载失败：${res.status}`);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "评论通知加载失败。");
    }
  };

  const markNotificationsRead = async () => {
    if (!aiApiBase || !auth.authenticated) return;
    setNotifications([]);
    try {
      await fetch(`${aiApiBase}/notifications/comments/read`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // The next refresh will restore unread state if the write failed.
    }
  };

  const openNotification = (item: CommentNotification) => {
    const slug = item.paperSlug || item.title.split(":")[0];
    const target = allPapers.find((paper) => paper.slug === slug);
    markNotificationsRead();
    setNotificationOpen(false);
    setAccountOpen(false);
    if (target) {
      setActiveSlug(target.slug);
      setViewMode("reader");
      setPendingCommentScroll(true);
      history.replaceState(null, "", `${baseUrl}?paper=${target.slug}`);
      return;
    }
    window.open(item.url, "_blank", "noopener,noreferrer");
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
      setSyncError("");
    } catch (err) {
      setPersonalPapers([]);
      setSyncError(err instanceof Error ? err.message : "个人文献库加载失败。");
    }
  };

  const loadMyPapers = async () => {
    if (!aiApiBase || !auth.authenticated || !auth.login) return;
    try {
      const res = await fetch(`${aiApiBase}/personal-papers?owner=${encodeURIComponent(auth.login)}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `我的文献库加载失败：${res.status}`);
      setMyPapers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "我的文献库加载失败。");
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
      await loadMyPapers();
      if (data.item?.slug) setActiveSlug(data.item.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败。";
      setSyncError(message.includes("GITHUB_CONTENT_TOKEN") ? "个人上传需要先配置 GitHub 写入 token；公共库不受影响。" : message);
    } finally {
      setUploadBusy(false);
    }
  };

  const uploadAnnotatedPdf = async (file: File) => {
    if (!active || !aiApiBase || !auth.authenticated) {
      setSyncError("请先登录后再上传批注版 PDF。");
      return;
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setSyncError("批注版文件必须是 PDF。");
      return;
    }
    const formData = new FormData();
    formData.set("pdf", file);
    formData.set("paperSlug", active.slug);
    formData.set("sourceOwner", active.ownerLogin || "");
    formData.set("title", active.title);
    formData.set("journal", active.journal || "");
    formData.set("date", active.date || "");
    formData.set("pdfPath", active.pdfPath || "");
    formData.set("markdownPath", active.markdownPath || "");
    formData.set("relatedReadingPath", active.relatedReadingPath || "");
    formData.set("originalType", "pdf");
    formData.set("translationType", active.translationType || "markdown");
    formData.set("relatedReadingType", active.relatedReadingType || "markdown");
    setAnnotatedPdfBusy(true);
    try {
      const res = await fetch(`${aiApiBase}/personal-papers/annotated-pdf`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `上传批注版 PDF 失败：${res.status}`);
      setLibraryScope({ type: "mine" });
      await loadPersonalPapers(auth.login || "");
      await loadMyPapers();
      if (data.item?.slug) setActiveSlug(data.item.slug);
      setSyncError("已保存批注版 PDF 到我的文献库。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传批注版 PDF 失败。";
      setSyncError(message.includes("GITHUB_CONTENT_TOKEN") ? "上传批注版 PDF 需要先配置 GitHub 写入 token。" : message);
    } finally {
      setAnnotatedPdfBusy(false);
    }
  };

  const paperInMyLibrary = (paper?: PaperItem) => {
    if (!paper) return false;
    return myPapers.some((item) =>
      item.slug === paper.slug ||
      item.pdfPath === paper.pdfPath ||
      item.markdownPath === paper.markdownPath,
    );
  };

  const copyFriendPaperToMine = async () => {
    if (!active || !active.ownerLogin || !aiApiBase || !auth.authenticated || libraryScope.type !== "friend") return;
    setCopyBusy(true);
    try {
      const res = await fetch(`${aiApiBase}/personal-papers/copy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: active.ownerLogin, slug: active.slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `加入失败：${res.status}`);
      await loadMyPapers();
      setSyncError("已加入我的文献库。");
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "加入我的文献库失败。");
    } finally {
      setCopyBusy(false);
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

  const savePdfAnnotations = (nextAnnotations: PdfAnnotation[]) => {
    if (!active || !canEditReaderState) return;
    const nextState: ReaderState = {
      ...(states[active.slug] || {}),
      pdfAnnotations: normalizePdfAnnotations(nextAnnotations),
    };
    setStates((prev) => ({ ...prev, [active.slug]: nextState }));
    saveReaderState(active.slug, nextState);
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

  const visibleLibraryPapers = useMemo(
    () => allPapers.filter((paper) => !states[paper.slug]?.hidden),
    [allPapers, states],
  );
  const journals = useMemo(() => uniq(visibleLibraryPapers.map((paper) => paper.journal)), [visibleLibraryPapers]);
  const dates = useMemo(() => uniq(visibleLibraryPapers.map((paper) => monthFromDate(paper.date))).reverse(), [visibleLibraryPapers]);
  const categories = useMemo(
    () => Array.from(new Set(Object.values(states).flatMap((state) => state.categories || []))).sort((a, b) => a.localeCompare(b)),
    [states],
  );

  const filtered = useMemo(() => {
    const parsedQuery = parseSearchQuery(query);
    const result = visibleLibraryPapers.filter((paper) => {
      const local = states[paper.slug] || {};
      const isRead = !!local.read || !!local.rating;
      if (!Number.isFinite(searchRank(paper, local, parsedQuery))) return false;
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
      const rankA = searchRank(a, stateA, parsedQuery);
      const rankB = searchRank(b, stateB, parsedQuery);
      if (rankA !== rankB) return rankA - rankB;
      let value = 0;
      if (sortKey === "date") value = a.date.localeCompare(b.date);
      if (sortKey === "uploaded") value = (a.uploadedAt || a.createdAt || "").localeCompare(b.uploadedAt || b.createdAt || "");
      if (sortKey === "title") value = a.title.localeCompare(b.title);
      if (sortKey === "journal") value = (a.journal || "").localeCompare(b.journal || "");
      if (sortKey === "rating") value = (stateA.rating || 0) - (stateB.rating || 0);
      if (sortKey === "category") {
        const categoryA = (stateA.categories || []).join(" ");
        const categoryB = (stateB.categories || []).join(" ");
        value = categoryA.localeCompare(categoryB);
      }
      return sortDirection === "asc" ? value : -value;
    });
  }, [categoryFilter, dateFilter, journalFilter, libraryScope.type, query, readFilter, sortDirection, sortKey, states, visibleLibraryPapers]);

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
    if (!canEditReaderState) return;
    const current = states[slug]?.rating || 0;
    const nextRating = current === rating ? 0 : rating;
    const next = { ...(states[slug] || {}), rating: nextRating, read: nextRating > 0 };
    setStates((prev) => ({ ...prev, [slug]: next }));
    saveReaderState(slug, next);
  };

  const saveNote = () => {
    if (!active || !canEditReaderState) return;
    const next = { ...(states[active.slug] || {}), note: noteDraft };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const saveCategories = () => {
    if (!active || !canEditReaderState) return;
    const next = { ...(states[active.slug] || {}), categories: parseTags(categoryDraft) };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const saveTags = () => {
    if (!active || !canEditReaderState) return;
    const next = { ...(states[active.slug] || {}), tags: parseTags(tagDraft) };
    setStates((prev) => ({ ...prev, [active.slug]: next }));
    saveReaderState(active.slug, next);
  };

  const hidePaper = (slug: string) => {
    if (!canEditReaderState) return;
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
  const isOverviewMode = !paneVisibility.pdf && !paneVisibility.text;
  const readerGridTemplate = visiblePaneKeys.length
    ? visiblePaneKeys
        .flatMap((key, index) => [
          `minmax(${key === "ai" ? 230 : 260}px, ${paneWeights[key]}fr)`,
          ...(index < visiblePaneKeys.length - 1 ? ["10px"] : []),
        ])
        .join(" ")
    : "1fr";
  const shellGridTemplate = sidebarOpen
    ? `${sidebarWidth}px 10px minmax(0, 1fr)`
    : "62px minmax(0, 1fr)";
  const overviewTableWidth = Object.values(overviewColumnWidths).reduce((sum, width) => sum + width, 0);

  const openPaperFromOverview = (slug: string) => {
    setActiveSlug(slug);
    setViewMode("reader");
    setPaneVisibility((prev) => ({ ...prev, pdf: true, text: true }));
    history.replaceState(null, "", `${baseUrl}?paper=${slug}`);
  };

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

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const updateWidth = (clientX: number) => {
      const next = Math.min(520, Math.max(220, startWidth + clientX - startX));
      setSidebarWidth(next);
      localStorage.setItem(sidebarWidthKey, String(next));
    };
    const onPointerMove = (moveEvent: PointerEvent) => updateWidth(moveEvent.clientX);
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-reader");
    };

    document.body.classList.add("is-resizing-reader");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(defaultSidebarWidth);
    localStorage.setItem(sidebarWidthKey, String(defaultSidebarWidth));
  };

  const startOverviewColumnResize = (event: ReactPointerEvent<HTMLDivElement>, key: SortKey) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = overviewColumnWidths[key];

    const updateWidth = (clientX: number) => {
      const minWidth = key === "title" ? 220 : 90;
      const next = {
        ...overviewColumnWidths,
        [key]: Math.min(820, Math.max(minWidth, startWidth + clientX - startX)),
      };
      setOverviewColumnWidths(next);
      localStorage.setItem(overviewColumnWidthsKey, JSON.stringify(next));
    };
    const onPointerMove = (moveEvent: PointerEvent) => updateWidth(moveEvent.clientX);
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("is-resizing-reader");
    };

    document.body.classList.add("is-resizing-reader");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  };

  const resetOverviewColumnWidth = (key: SortKey) => {
    const next = { ...overviewColumnWidths, [key]: defaultOverviewColumnWidths[key] };
    setOverviewColumnWidths(next);
    localStorage.setItem(overviewColumnWidthsKey, JSON.stringify(next));
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
  const unreadNotificationCount = notifications.filter((item) => item.unread).length;
  const hasNotifications = unreadNotificationCount > 0;
  const overviewColumns: Array<{ key: SortKey; label: string; className?: string }> = [
    { key: "title", label: "Title", className: "title-col" },
    { key: "journal", label: "Publication", className: "journal-col" },
    { key: "date", label: "Date", className: "date-col" },
    { key: "rating", label: "Rating", className: "rating-col" },
    { key: "category", label: "Category", className: "category-col" },
    { key: "uploaded", label: "Date Added", className: "uploaded-col" },
  ];

  return (
    <div className={isOverviewMode ? "shell overview-shell" : "shell"} style={{ gridTemplateColumns: shellGridTemplate }}>
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
            placeholder="搜索标题、期刊、日期、集合、类别、标签"
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
                      ["uploaded", "上传日期"],
                      ["journal", "期刊"],
                      ["title", "首字母"],
                      ["rating", "星级"],
                      ["category", "类别"],
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

          <div className={isOverviewMode ? "paper-list compact" : "paper-list"}>
            {filtered.map((paper) => {
              const local = states[paper.slug] || {};
              const isRead = !!local.read || !!local.rating;
              return (
                <div
                  key={paper.slug}
                  className={`paper-item ${paper.slug === activeSlug ? "active" : ""}`}
                >
                  <button className="paper-select" onClick={() => isOverviewMode ? openPaperFromOverview(paper.slug) : setActiveSlug(paper.slug)}>
                    <span>
                      <strong>{paper.title}</strong>
                      <small title={paper.journal || "Unknown journal"}>{displayJournalName(paper.journal)} · {paper.date}</small>
                    </span>
                    <span className={`status-dot ${isRead ? "read" : ""}`} />
                  </button>
                  {canEditReaderState && (
                    <button
                      className="paper-delete"
                      onClick={() => hidePaper(paper.slug)}
                      title="从我的列表隐藏"
                    >
                      ×
                    </button>
                  )}
                  {(canEditReaderState || local.rating || !!local.categories?.length) && (
                    <div className="rating-row" aria-label={`${paper.title} rating and categories`}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          className={rating <= (local.rating || 0) ? "star active" : "star"}
                          onClick={() => canEditReaderState && setRating(paper.slug, rating)}
                          disabled={!canEditReaderState}
                          title={`${rating} stars`}
                        >
                          {rating <= (local.rating || 0) ? "\u2605" : "\u2606"}
                        </button>
                      ))}
                      {!!local.categories?.length && (
                        <span className="inline-chip-row">
                          {local.categories.map((category) => (
                            <span className="category-chip" key={category}>{category}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                  {!!local.tags?.length && (
                    <div className="tag-row">
                      {local.tags.map((tag) => (
                        <span className="tag-chip" key={tag}>{tag}</span>
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

      {sidebarOpen && (
        <div
          className="shell-divider"
          role="separator"
          aria-label="调整文献列表宽度"
          aria-orientation="vertical"
          onPointerDown={startSidebarResize}
          onDoubleClick={resetSidebarWidth}
        />
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
                  <span title={active.journal || "Unknown journal"}>{displayJournalName(active.journal)}</span>
                  <span>{active.date}</span>
                </div>
                {syncError && <p className="sync-error">{syncError}</p>}
              </div>
              <div className="toolbar">
                <div className="toolbar-row toolbar-row-top">
                  {canEditReaderState && (
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
                  )}
                  {libraryScope.type === "friend" && active.personal && active.ownerLogin && (
                    <button
                      disabled={copyBusy || paperInMyLibrary(active)}
                      onClick={copyFriendPaperToMine}
                      title={paperInMyLibrary(active) ? "我的文献库已有这篇" : "同步到我的文献库"}
                    >
                      {paperInMyLibrary(active) ? "已在我的库" : copyBusy ? "加入中..." : "加入我的文献库"}
                    </button>
                  )}
                  {active.relatedReading && (
                    <button className={viewMode === "related" ? "active" : ""} onClick={openRelatedView}>
                      <BookOpen size={16} />
                      相关阅读
                    </button>
                  )}
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
                            <button
                              onClick={() => {
                                setNotificationOpen((open) => !open);
                                if (!notificationOpen) markNotificationsRead();
                              }}
                            >
                              通知
                              {hasNotifications && <span className="menu-dot" />}
                            </button>
                            {notificationOpen && (
                              <div className="notification-box">
                                {notifications.length ? (
                                  notifications.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className={item.unread ? "unread" : ""}
                                      onClick={() => openNotification(item)}
                                    >
                                      <strong>{item.title}</strong>
                                      <span>
                                        {item.latestAuthor ? `${item.latestAuthor} · ` : ""}
                                        {formatShortTime(item.updatedAt)} · {item.commentCount} 条评论
                                      </span>
                                      {item.latestBody && <small>{item.latestBody}</small>}
                                    </button>
                                  ))
                                ) : (
                                  <span className="notification-empty">暂无新评论</span>
                                )}
                              </div>
                            )}
                            <button onClick={() => setFriendOpen((open) => !open)}>好友</button>
                            {friendOpen && (
                              <div className="friend-box">
                                <div className="friend-list">
                                  {friends.length ? (
                                    friends.map((friend) => (
                                      <button
                                        key={friend.login}
                                        className={libraryScope.type === "friend" && libraryScope.owner === friend.login ? "active" : ""}
                                        onClick={() => {
                                          setLibraryScope({ type: "friend", owner: friend.login });
                                          setAccountOpen(false);
                                        }}
                                      >
                                        {friend.login}
                                      </button>
                                    ))
                                  ) : (
                                    <span>还没有好友</span>
                                  )}
                                </div>
                                <div className="friend-add">
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
                              </div>
                            )}
                            <button onClick={() => loadReaderStates(libraryScope.type === "friend" ? viewedOwner : undefined)}>同步</button>
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
                            <button onClick={() => setNotificationOpen((open) => !open)}>
                              通知
                              {hasNotifications && <span className="menu-dot" />}
                            </button>
                            {notificationOpen && (
                              <div className="notification-box">
                                <span className="notification-empty">登录后查看评论通知</span>
                              </div>
                            )}
                            <button onClick={loginWithGitHub}>登录</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </header>

            {isOverviewMode ? (
              <section className="overview-table-wrap" aria-label="paper overview">
                <table className="overview-table" style={{ width: `${overviewTableWidth}px`, minWidth: "100%" }}>
                  <colgroup>
                    {overviewColumns.map((column) => (
                      <col key={column.key} style={{ width: `${overviewColumnWidths[column.key]}px` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {overviewColumns.map((column) => (
                        <th key={column.key} className={column.className}>
                          <div className="overview-header-cell">
                            <button
                              className={sortKey === column.key ? "overview-sort active" : "overview-sort"}
                              onClick={() => changeSort(column.key)}
                              title={`Sort by ${column.label}`}
                            >
                              <span>{column.label}</span>
                              <span className="sort-mark">
                                {sortKey === column.key ? (sortDirection === "asc" ? "\u2191" : "\u2193") : ""}
                              </span>
                            </button>
                            <div
                              className="column-resizer"
                              role="separator"
                              aria-label={`Resize ${column.label}`}
                              aria-orientation="vertical"
                              onPointerDown={(event) => startOverviewColumnResize(event, column.key)}
                              onDoubleClick={() => resetOverviewColumnWidth(column.key)}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((paper) => {
                      const local = states[paper.slug] || {};
                      const rating = local.rating || 0;
                      const categories = local.categories || [];
                      const added = paper.uploadedAt || paper.createdAt || paper.taskDate || "";
                      return (
                        <tr
                          key={paper.slug}
                          className={paper.slug === activeSlug ? "active" : ""}
                          onClick={() => openPaperFromOverview(paper.slug)}
                        >
                          <td className="title-cell">
                            <FileText size={16} />
                            <span>{paper.title}</span>
                          </td>
                          <td title={paper.journal || "Unknown journal"}>{displayJournalName(paper.journal)}</td>
                          <td>{paper.date || "-"}</td>
                          <td className="overview-stars" aria-label={`${rating} stars`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span key={star} className={star <= rating ? "active" : ""}>
                                {star <= rating ? "\u2605" : "\u2606"}
                              </span>
                            ))}
                          </td>
                          <td className="overview-category" title={categories.join(", ")}>
                            {categories.length ? categories.join(", ") : <span className="muted">-</span>}
                          </td>
                          <td>{added ? formatShortTime(added) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ) : (
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
                        <PdfReader
                          src={resolveFileUrl(active.pdfPath)}
                          title={active.title}
                          annotations={states[active.slug]?.pdfAnnotations || []}
                          canEdit={canEditReaderState}
                          onChange={savePdfAnnotations}
                          onUploadAnnotatedPdf={uploadAnnotatedPdf}
                          uploadBusy={annotatedPdfBusy}
                        />
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
                          src={resolvePdfUrl(viewMode === "related" ? active.relatedReadingPath || "" : active.markdownPath)}
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
            )}
            {!isOverviewMode && viewMode === "reader" && <GiscusComments paper={active} />}
          </>
        )}
      </main>
    </div>
  );
}
