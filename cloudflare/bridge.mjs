// Request-scoped bindings only: never copy secrets into process.env or assets.
const securityHeaders = {
  'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};
export async function runApi(handler, request, env, limit = 20000) {
  const headers = new Headers(securityHeaders);
  const failure = status => new Response(JSON.stringify({error:'მოთხოვნა ვერ შესრულდა.'}), {status, headers});
  try {
    let body = '';
    if (request.body) {
      const reader = request.body.getReader(), decoder = new TextDecoder();
      let size = 0;
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return failure(413); }
        body += decoder.decode(value, {stream:true});
      }
      body += decoder.decode();
    }
    let status = 200, response;
    const res = {
      setHeader(name, value) { headers.set(name, value); },
      status(code) { status = code; return this; },
      json(value) { response = new Response(JSON.stringify(value), {status, headers}); return response; },
    };
    await handler({method:request.method, headers:Object.fromEntries(request.headers), body}, res, env);
    return response || failure(503);
  } catch { return failure(503); } // No credentials, request bodies or upstream diagnostics.
}
