import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 1x1 transparent GIF
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b
]);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // path: /track-email/open, /track-email/confirm, /track-email/decline
  const pathParts = url.pathname.split("/").filter(Boolean);
  const action = pathParts[pathParts.length - 1]; // open | confirm | decline
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  if (action === "open") {
    // Only set opened_at if not already set
    await supabase
      .from("email_blast_recipients")
      .update({ opened_at: now })
      .eq("token", token)
      .is("opened_at", null);

    return new Response(PIXEL, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  }

  if (action === "confirm" || action === "decline") {
    const updates: Record<string, string> = {
      response: action === "confirm" ? "confirmed" : "declined",
      responded_at: now,
    };
    // Also mark as opened if not yet
    const { data: recipient } = await supabase
      .from("email_blast_recipients")
      .select("opened_at")
      .eq("token", token)
      .single();

    if (recipient && !recipient.opened_at) {
      updates.opened_at = now;
    }

    await supabase
      .from("email_blast_recipients")
      .update(updates)
      .eq("token", token);

    // Plain redirect to myredeal.com
    return new Response(null, {
      status: 302,
      headers: { Location: "https://www.myredeal.com" },
    });
  }

  return new Response("Not found", { status: 404 });
});
