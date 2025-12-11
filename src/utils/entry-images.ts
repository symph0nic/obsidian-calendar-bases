import {
  App,
  BasesEntry,
  BasesPropertyId,
  CachedMetadata,
  EmbedCache,
  FrontMatterCache,
  ListValue,
  TFile,
  Value,
} from "obsidian";
import { tryGetValue } from "./bases";

const IMAGE_FRONTMATTER_KEYS = [
  "cover",
  "image",
  "images",
  "thumbnail",
  "banner",
  "featured",
  "photo",
];

const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "svg",
  "webp",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
];

export interface EntryImageInfo {
  url: string;
  alt?: string;
  source?: string;
}

export function resolveEntryImage(
  app: App | undefined,
  entry: BasesEntry,
  imageProperty?: BasesPropertyId | null,
): EntryImageInfo | null {
  if (!app) return null;

  if (imageProperty) {
    const value = tryGetValue(entry, imageProperty);
    const viaProperty = value
      ? valueToImageInfo(app, entry, value)
      : null;
    if (viaProperty) {
      return { ...viaProperty, source: "property" };
    }
  }

  const cache = app.metadataCache.getFileCache(entry.file);
  if (!cache) return null;

  const viaFrontmatter = resolveFromFrontmatter(app, entry, cache.frontmatter);
  if (viaFrontmatter) {
    return { ...viaFrontmatter, source: "frontmatter" };
  }

  const viaEmbeds = resolveFromEmbeds(app, entry, cache);
  if (viaEmbeds) {
    return { ...viaEmbeds, source: "embed" };
  }

  return null;
}

function valueToImageInfo(
  app: App,
  entry: BasesEntry,
  value: Value,
): EntryImageInfo | null {
  if (value instanceof ListValue) {
    for (let i = 0; i < value.length(); i++) {
      const nested = value.get(i);
      const nestedImage = valueToImageInfo(app, entry, nested);
      if (nestedImage) {
        return nestedImage;
      }
    }
    return null;
  }

  const fileFromValue = getFileFromValue(value);
  if (fileFromValue) {
    return {
      url: app.vault.getResourcePath(fileFromValue),
      alt: fileFromValue.basename,
    };
  }

  const linkedReference = getReferenceFromValue(value);
  if (linkedReference) {
    return stringReferenceToImage(app, entry, linkedReference);
  }

  const raw = value.toString().trim();
  if (!raw) return null;
  return stringReferenceToImage(app, entry, raw);
}

function resolveFromFrontmatter(
  app: App,
  entry: BasesEntry,
  frontmatter?: FrontMatterCache,
): EntryImageInfo | null {
  if (!frontmatter) return null;

  for (const key of IMAGE_FRONTMATTER_KEYS) {
    const rawValue = frontmatter[key];
    if (!rawValue) continue;
    const candidates = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const candidate of candidates) {
      const normalized = normalizeFrontmatterCandidate(candidate);
      if (!normalized) continue;
      const image = stringReferenceToImage(app, entry, normalized);
      if (image) return image;
    }
  }

  return null;
}

function resolveFromEmbeds(
  app: App,
  entry: BasesEntry,
  metadata: CachedMetadata,
): EntryImageInfo | null {
  const embeds = metadata.embeds;
  if (!embeds || embeds.length === 0) return null;

  for (const embed of embeds) {
    const image = embedCacheToImage(app, entry, embed);
    if (image) return image;
  }

  return null;
}

function embedCacheToImage(
  app: App,
  entry: BasesEntry,
  embed: EmbedCache,
): EntryImageInfo | null {
  const link = embed.link;
  if (!link) return null;
  if (!looksLikeImageReference(link)) return null;
  return stringReferenceToImage(app, entry, link);
}

function stringReferenceToImage(
  app: App,
  entry: BasesEntry,
  reference: string,
): EntryImageInfo | null {
  const sanitized = sanitizeReference(reference);
  if (!sanitized) return null;

  if (isExternalImageUrl(sanitized)) {
    return { url: sanitized };
  }

  const file = resolveFileFromPath(app, entry, sanitized);
  if (file && isImageFile(file)) {
    return {
      url: app.vault.getResourcePath(file),
      alt: file.basename,
    };
  }

  return null;
}

function sanitizeReference(reference: string): string | null {
  let value = reference.trim();
  if (!value) return null;

  const wikilinkMatch = value.match(/^!?\[\[(.+?)\]\]$/);
  if (wikilinkMatch) {
    value = wikilinkMatch[1];
  }

  const mdImageMatch = value.match(/^!\[[^\]]*]\((.+?)\)$/);
  if (mdImageMatch) {
    value = mdImageMatch[1];
  }

  const pipeIndex = value.indexOf("|");
  if (pipeIndex !== -1) {
    value = value.slice(0, pipeIndex);
  }

  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex);
  }

  value = value.replace(/^['"]|['"]$/g, "").trim();
  return value || null;
}

function resolveFileFromPath(
  app: App,
  entry: BasesEntry,
  path: string,
): TFile | null {
  const fromCache = app.metadataCache.getFirstLinkpathDest(
    path,
    entry.file.path,
  );
  if (fromCache instanceof TFile) {
    return fromCache;
  }

  const abs = app.vault.getAbstractFileByPath(path);
  if (abs && abs instanceof TFile) {
    return abs;
  }

  return null;
}

function looksLikeImageReference(reference: string): boolean {
  return (
    isExternalImageUrl(reference) ||
    IMAGE_EXTENSIONS.some((ext) =>
      reference.toLowerCase().includes(`.${ext}`),
    )
  );
}

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
}

function isExternalImageUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("data:image");
}

function getFileFromValue(value: Value): TFile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const fileCandidate = (value as { file?: TFile | null }).file;
  if (fileCandidate instanceof TFile) {
    return fileCandidate;
  }
  return null;
}

function getReferenceFromValue(value: Value): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const keys = ["path", "link", "url", "src"];
  const record = value as unknown as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function normalizeFrontmatterCandidate(candidate: unknown): string | null {
  if (typeof candidate === "string") {
    return candidate;
  }

  if (Array.isArray(candidate)) {
    for (const nested of candidate) {
      const normalized = normalizeFrontmatterCandidate(nested);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (candidate && typeof candidate === "object") {
    const keys = ["path", "file", "link", "url", "src"];
    const record = candidate as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  }

  return null;
}
