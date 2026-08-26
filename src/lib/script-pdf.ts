/**
 * Script → PDF. Both download buttons (the drawer and the Approved-scripts
 * card) go through here so a script reads the same wherever it is saved from.
 *
 * jsPDF is imported dynamically: it is a browser-only library and a fair bit of
 * bytes, and nobody pays for it until they actually click Download.
 */

export type PrintableScript = {
  code: string;
  title: string;
  writer: string;
  body: string;
  hookLine?: string | null;
  angle?: string | null;
  personas?: string[];
  format?: string | null;
  runtime?: number | null;
  words?: number;
  version?: number;
  noteTitle?: string | null;
  noteTone?: string | null;
  updatedAt?: string;
};

const A4 = { w: 210, h: 297 };
const MARGIN = 18;
const WIDTH = A4.w - MARGIN * 2;

/** Builds the document and the filename. Split out from the download so the
 *  layout can be exercised outside a browser. */
export async function buildScriptPdf(script: PrintableScript) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  /** Draw wrapped text, breaking pages as needed. Returns nothing; tracks y. */
  const write = (
    text: string,
    { size = 11, style = "normal" as "normal" | "bold" | "italic", gap = 5, grey = false } = {},
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(grey ? 110 : 20);
    const lineHeight = size * 0.52;
    for (const line of doc.splitTextToSize(text, WIDTH) as string[]) {
      if (y + lineHeight > A4.h - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
    y += gap;
  };

  const rule = () => {
    if (y + 4 > A4.h - MARGIN) { doc.addPage(); y = MARGIN; }
    doc.setDrawColor(215);
    doc.line(MARGIN, y, MARGIN + WIDTH, y);
    y += 6;
  };

  // Header — code line, title, then the tagging in one grey line.
  const head = [
    script.code,
    script.version ? `v${script.version}` : null,
    script.writer,
    script.words ? `${script.words} words` : null,
    script.runtime ? `~${script.runtime}s` : null,
  ].filter(Boolean).join("  ·  ");
  write(head, { size: 9, grey: true, gap: 2 });
  write(script.title, { size: 17, style: "bold", gap: 3 });

  const tagging = [
    script.angle,
    script.personas?.length ? script.personas.join(", ") : null,
    script.format,
  ].filter(Boolean).join("  ·  ");
  if (tagging) write(tagging, { size: 9, grey: true, gap: 3 });
  rule();

  if (script.hookLine) {
    write("HOOK", { size: 8, style: "bold", grey: true, gap: 1.5 });
    write(script.hookLine, { size: 11.5, style: "italic", gap: 6 });
  }

  // Body — blank lines in the script are real beats, so they survive.
  for (const para of script.body.split(/\n/)) {
    if (para.trim() === "") { y += 3; continue; }
    write(para, { size: 11, gap: 1.5 });
  }

  if (script.noteTitle) {
    y += 3;
    rule();
    write(`NOTE — ${script.noteTitle}${script.noteTone ? ` (${script.noteTone})` : ""}`, {
      size: 10, style: "bold", gap: 4,
    });
  }

  // Footer on every page, so a loose printed sheet still says where it is from.
  const pages = doc.getNumberOfPages();
  const stamp = [
    `Written by ${script.writer}`,
    script.updatedAt ? `updated ${new Date(script.updatedAt).toLocaleDateString("en-IN")}` : null,
  ].filter(Boolean).join("  ·  ");
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(stamp, MARGIN, A4.h - 10);
    doc.text(`${p} / ${pages}`, MARGIN + WIDTH, A4.h - 10, { align: "right" });
  }

  // Windows rejects \ / : * ? " < > | in filenames.
  const safe = `${script.code} ${script.title}`.replace(/[\/:*?"<>|]/g, "-").trim();
  return { doc, filename: `${safe}.pdf` };
}

export async function downloadScriptPdf(script: PrintableScript) {
  const { doc, filename } = await buildScriptPdf(script);
  doc.save(filename);
}
