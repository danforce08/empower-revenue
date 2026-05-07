import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { list, head, put } from "@vercel/blob";

const REPORTS_DIR = path.join(process.cwd(), "content", "reports");
const BLOB_PREFIX = "reports/";

export type PipelineData = {
  reps_onboarded_new_to_empower?: number;
  reps_by_dealer_org?: Record<string, number>;
  new_dealer_applications_submitted?: number;
  new_dealers_onboarded?: number;
  most_recent_dealer_application?: string;
  most_recent_dealer_onboarded?: string;
  rep_state_volume?: Record<string, number>;
};

export type ReportMeta = {
  slug: string;
  week: string;
  date_range?: string;
  generated_at?: string;
  word_count?: number;
  headline?: string;
  pipeline?: PipelineData;
};

export type Report = ReportMeta & {
  raw: string; // full markdown source (with frontmatter)
  content: string; // markdown body with `## Pipeline` stripped
  pipelineMarkdown?: string;
};

function blobsAvailable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function splitPipelineSection(markdown: string): {
  body: string;
  removed: string;
} {
  const lines = markdown.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Pipeline\b/i.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return { body: markdown, removed: "" };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const removed = lines.slice(start, end).join("\n");
  const body = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
  return { body, removed };
}

function extractHeadline(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  let pastH1 = false;
  const buf: string[] = [];
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      pastH1 = true;
      continue;
    }
    if (!pastH1) continue;
    if (line.startsWith("##")) break;
    if (line.trim().length > 0) {
      buf.push(line.trim());
    } else if (buf.length > 0) {
      break;
    }
  }
  const text = buf.join(" ").trim();
  return text.length > 0 ? text : undefined;
}

function metaFromRaw(slug: string, raw: string): ReportMeta {
  const { data, content } = matter(raw);
  return {
    slug,
    week: data.week ?? slug,
    date_range: data.date_range,
    generated_at: data.generated_at,
    word_count: data.word_count,
    headline: extractHeadline(content),
    pipeline: data.pipeline as PipelineData | undefined,
  };
}

async function fetchBlobText(url: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const res = await fetch(url, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.text();
}

async function readBlobReport(slug: string): Promise<string | null> {
  if (!blobsAvailable()) return null;
  const pathname = `${BLOB_PREFIX}${slug}.md`;
  try {
    const meta = await head(pathname);
    return await fetchBlobText(meta.url);
  } catch {
    return null;
  }
}

async function readFsReport(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(REPORTS_DIR, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
}

export async function listReports(): Promise<ReportMeta[]> {
  const seen = new Map<string, ReportMeta>();

  // Read filesystem (seed/fallback)
  try {
    const entries = await fs.readdir(REPORTS_DIR);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const slug = name.replace(/\.md$/, "");
      const raw = await fs.readFile(path.join(REPORTS_DIR, name), "utf-8");
      seen.set(slug, metaFromRaw(slug, raw));
    }
  } catch {
    // empty
  }

  // Blob overrides filesystem
  if (blobsAvailable()) {
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      for (const blob of blobs) {
        const slug = blob.pathname
          .replace(BLOB_PREFIX, "")
          .replace(/\.md$/, "");
        if (!slug) continue;
        try {
          const raw = await fetchBlobText(blob.url);
          if (!raw) continue;
          seen.set(slug, metaFromRaw(slug, raw));
        } catch {
          // skip individual blob failures
        }
      }
    } catch {
      // blob unreachable; filesystem result is what we have
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    b.slug.localeCompare(a.slug),
  );
}

export async function getReport(slug: string): Promise<Report | null> {
  const raw = (await readBlobReport(slug)) ?? (await readFsReport(slug));
  if (!raw) return null;
  const { data, content } = matter(raw);
  const { body, removed } = splitPipelineSection(content);
  return {
    slug,
    week: data.week ?? slug,
    date_range: data.date_range,
    generated_at: data.generated_at,
    word_count: data.word_count,
    headline: extractHeadline(content),
    pipeline: data.pipeline as PipelineData | undefined,
    raw,
    content: body,
    pipelineMarkdown: removed || undefined,
  };
}

/**
 * Save a report's full markdown source (frontmatter + body) to Blob.
 * Returns the Blob URL of the new version.
 */
export async function saveReport(
  slug: string,
  raw: string,
): Promise<{ url: string; pathname: string }> {
  if (!blobsAvailable()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN not configured — cannot save edits.",
    );
  }
  const pathname = `${BLOB_PREFIX}${slug}.md`;
  const result = await put(pathname, raw, {
    access: "private",
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: result.url, pathname: result.pathname };
}
