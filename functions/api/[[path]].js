export function onRequest() {
  return new Response(JSON.stringify({error:'Not found'}), {status:404,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
