/**
 * services/instagramSender.ts - Instagram (Meta) Graph API send helpers.
 *
 * Mirrors whatsappSender. Instagram messaging rides the same Graph API:
 *   - DM reply:        POST /{IG_ID}/messages  { recipient:{id}, message:{text} }
 *   - Comment reply:   POST /{COMMENT_ID}/replies  { message }
 *   - Comment → DM:    POST /{IG_ID}/messages  { recipient:{comment_id}, message:{text} }
 *
 * Env:
 *   META_IG_ACCESS_TOKEN          - Instagram Business Login / system-user token
 *   META_IG_BUSINESS_ACCOUNT_ID   - the IG account id (optional; falls back to "me")
 */

// Instagram API with Instagram Login uses graph.instagram.com (the IGAA… token
// returned by the Connect flow is rejected by graph.facebook.com). The send
// endpoints (/me/messages, /{comment-id}/replies) live here.
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

function getCreds(): { token: string; igId: string } | null {
  const token = process.env.META_IG_ACCESS_TOKEN;
  if (!token) return null;
  const igId = process.env.META_IG_BUSINESS_ACCOUNT_ID || 'me';
  return { token, igId };
}

type SendResult = { success: boolean; error?: string; messageId?: string; statusCode?: number };

async function postGraph(path: string, payload: Record<string, any>): Promise<SendResult> {
  const creds = getCreds();
  if (!creds) return { success: false, error: 'Missing META_IG_ACCESS_TOKEN' };
  try {
    const res = await fetch(`${GRAPH_API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const statusCode = res.status;
    const text = await res.text();
    if (!res.ok) {
      console.error(`[instagramSender] POST ${path} FAILED ${statusCode}:`, text);
      return { success: false, error: text, statusCode };
    }
    let body: any = {};
    try { body = JSON.parse(text); } catch { /* empty/ok */ }
    const messageId = body?.message_id || body?.id;
    console.log(`[instagramSender] POST ${path} OK ${statusCode} id=${messageId}`);
    return { success: true, messageId, statusCode };
  } catch (err: any) {
    console.error(`[instagramSender] POST ${path} EXCEPTION:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/** Send a Direct Message to an Instagram user (by their IGSID). */
export async function sendInstagramDM(recipientIgsid: string, text: string): Promise<SendResult> {
  const creds = getCreds();
  if (!creds) return { success: false, error: 'Missing META_IG_ACCESS_TOKEN' };
  return postGraph(`${creds.igId}/messages`, {
    recipient: { id: recipientIgsid },
    message: { text },
  });
}

/** Public reply under a comment. */
export async function sendInstagramCommentReply(commentId: string, text: string): Promise<SendResult> {
  return postGraph(`${commentId}/replies`, { message: text });
}

/**
 * Private reply (comment → DM): DMs the commenter, referencing the comment_id.
 * Allowed once per comment, within the messaging window. The lead-gen lever.
 */
export async function sendInstagramPrivateReply(commentId: string, text: string): Promise<SendResult> {
  const creds = getCreds();
  if (!creds) return { success: false, error: 'Missing META_IG_ACCESS_TOKEN' };
  return postGraph(`${creds.igId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
  });
}

/**
 * Resolve a human-friendly name for an IGSID. May return null for users who
 * haven't messaged us yet / when the token lacks profile access - callers
 * should fall back to "Instagram User".
 */
export async function fetchInstagramUsername(igsid: string): Promise<string | null> {
  const creds = getCreds();
  if (!creds) return null;
  try {
    const res = await fetch(
      `${GRAPH_API_BASE}/${igsid}?fields=username,name&access_token=${encodeURIComponent(creds.token)}`,
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.username || data?.name || null;
  } catch {
    return null;
  }
}

export function isInstagramConfigured(): boolean {
  return !!process.env.META_IG_ACCESS_TOKEN;
}
