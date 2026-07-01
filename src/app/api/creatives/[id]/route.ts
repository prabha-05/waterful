import { NextResponse, type NextRequest } from "next/server";
import { getCreativeDetail } from "@/lib/data/creatives";
import { requireUser } from "@/lib/auth/guard";
import { signPaths } from "@/lib/storage";

/** Creative detail for the drawer. Any valid user can read (decisions §5). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const detail = await getCreativeDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sign the private file paths so the drawer can preview them.
  const urlMap = await signPaths(detail.files.map((f) => f.storagePath));
  const files = detail.files.map((f) => ({
    ...f,
    url: urlMap.get(f.storagePath) ?? null,
  }));

  return NextResponse.json({ ...detail, files });
}
