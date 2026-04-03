interface Env {
  GEMINI_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(context.request.url);
  const model = url.searchParams.get('model') || 'gemini-2.5-flash';

  const body = await context.request.arrayBuffer();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const referer = context.request.headers.get('Referer');
  if (referer) {
    headers['Referer'] = referer;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers,
      body,
    }
  );

  const responseBody = await res.arrayBuffer();

  return new Response(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });
};
