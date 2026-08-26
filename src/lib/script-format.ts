/**
 * The script decides the format now — Creative Format ("Ai Video", "Static /
 * Carousel") and Content Format ("UGC", "Skit") replaced the Type / Sub-type
 * pair the uploader used to pick. Those two columns are still what the Library
 * renders from (thumbnails branch on type === "Video", cards tint by it), so
 * this maps the tags back onto them.
 *
 * Pure and shared: the upload form uses it to know whether to accept a video or
 * an image, and the server uses it to decide what to store — they must agree.
 */

type TypeLike = { id: string; label: string; subtypes: { id: string; label: string }[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which of the old types a Creative Format belongs to. */
export function typeLabelFor(creativeFormat: string | null | undefined, fileCount = 1): string {
  const k = norm(creativeFormat ?? "");
  // Motion Static is animated — it arrives as a video file, not an image.
  if (k.includes("video") || k.includes("motion")) return "Video";
  if (k.includes("carousel")) return fileCount > 1 ? "Carousel" : "Static";
  return "Static";
}

/** Sub-types that exist under a different name than the Content Format tag. */
const SUBTYPE_ALIASES: Record<string, string> = {
  founderled: "founder",
  aestheticledproductshots: "product",
  streetreactionvoxpop: "ugc",
};

export function resolveFormat(
  types: TypeLike[],
  creativeFormat: string | null | undefined,
  contentFormat: string | null | undefined,
  fileCount = 1,
): { typeId: string | null; subtypeId: string | null; typeLabel: string } {
  const wantType = typeLabelFor(creativeFormat, fileCount);
  const type =
    types.find((t) => norm(t.label) === norm(wantType)) ??
    types.find((t) => norm(t.label) === "video") ??
    types[0];
  if (!type) return { typeId: null, subtypeId: null, typeLabel: wantType };

  const wanted = norm(contentFormat ?? "");
  const aliased = SUBTYPE_ALIASES[wanted] ?? wanted;
  const sub =
    type.subtypes.find((s) => norm(s.label) === wanted) ??
    type.subtypes.find((s) => norm(s.label) === aliased) ??
    // Every type carries "Other / Untyped" — the honest landing spot for a
    // Content Format with no sub-type of its own (Skit, ASMR, Meme…).
    type.subtypes.find((s) => norm(s.label).startsWith("other")) ??
    type.subtypes[0];

  return { typeId: type.id, subtypeId: sub?.id ?? null, typeLabel: type.label };
}

/** The label a script carries for one dimension, by group key. */
export function tagLabelFor(
  groups: { key: string; options: { id: string; label: string }[] }[],
  tagIds: string[],
  groupKey: string,
): string | null {
  const g = groups.find((x) => x.key === groupKey);
  if (!g) return null;
  return g.options.find((o) => tagIds.includes(o.id))?.label ?? null;
}
