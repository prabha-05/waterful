"use server";

import { extractText, getDocumentProxy } from "unpdf";
import { requirePermission } from "@/lib/auth/guard";

export type PdfResult = { ok: true; text: string; pages: number } | { ok: false; error: string };

/** Anything larger is almost certainly not a script. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Pull the text out of an uploaded script PDF so a writer can paste a doc in
 * rather than retyping it. Server-side (unpdf wraps pdf.js without needing a
 * worker), so nothing is added to the browser bundle.
 *
 * Scanned/photographed PDFs have no selectable text — that is reported plainly
 * rather than silently writing an empty script. OCR is out of scope.
 */
export async function extractPdfText(form: FormData): Promise<PdfResult> {
  try {
    await requirePermission("script");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received." };

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { ok: false, error: "That isn't a PDF — export the doc as PDF and try again." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That PDF is over 8 MB. Scripts should be a few pages of text." };
  }

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    // mergePages=false so page breaks survive as paragraph breaks.
    const { text, totalPages } = await extractText(pdf, { mergePages: false });

    const pages = (Array.isArray(text) ? text : [text]).map((p) =>
      String(p)
        // pdf.js emits a lot of hard-wrapped lines; collapse runs of blanks but
        // keep single breaks, which is what makes a script readable.
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    );
    const merged = pages.filter(Boolean).join("\n\n").trim();

    if (!merged) {
      return {
        ok: false,
        error:
          "No selectable text in that PDF — it looks scanned or exported as images. Paste the text instead.",
      };
    }
    return { ok: true, text: merged, pages: totalPages };
  } catch (e) {
    return { ok: false, error: `Couldn't read that PDF: ${(e as Error).message}` };
  }
}
