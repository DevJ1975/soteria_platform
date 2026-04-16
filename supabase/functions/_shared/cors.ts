/**
 * CORS helper for Edge Functions called directly from the browser.
 *
 * Two of our three Stripe functions (`create-checkout-session` and
 * `create-portal-session`) are invoked from the Angular client via
 * `supabase.functions.invoke(...)`. The webhook endpoint (called by
 * Stripe) is server-to-server and doesn't need CORS.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Short-circuits a preflight OPTIONS request. Call this at the top of
 * every browser-facing function — Supabase Edge Functions run behind
 * a gateway that doesn't add CORS headers for you.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
