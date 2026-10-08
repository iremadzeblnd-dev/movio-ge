// Static SQL security review only: this test never executes SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('supabase-admin-orders.sql', 'utf8');
const ui = fs.readFileSync('admin.js', 'utf8');
assert.equal((sql.match(/if not public.movio_is_admin\(\)/g) || []).length, 2);
assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 2);
for (const signature of ['movio_admin_orders(integer)', 'movio_admin_order_status(uuid,text)']) {
  assert(sql.includes(`revoke all on function public.${signature} from public, anon, authenticated`));
  assert(sql.includes(`grant execute on function public.${signature} to authenticated`));
}
assert.match(sql, /where id=p_order_id for update/);
assert(sql.indexOf('for update') < sql.indexOf('stock=stock+item.quantity'));
assert(sql.indexOf('current_order.order_status=p_status') < sql.indexOf('stock=stock+item.quantity'));
assert.match(sql, /current_order.order_status in \('cancelled','completed'\)/);
assert.match(sql, /p_status='cancelled' and current_order.stock_restored_at is null/);
assert.match(sql, /order by product_id loop/);
assert.match(sql, /if not found then raise exception 'RESTOCK_PRODUCT_UNAVAILABLE'/);
assert.match(sql, /set stock_restored_at=now\(\)/);
const productUpdates = [...sql.matchAll(/update\s+public\.products\s+set\s+([\s\S]*?)\s+where\b/gi)];
assert.equal(productUpdates.length, 1, 'Cancellation has one product quantity update');
assert.match(productUpdates[0][1], /^stock\s*=\s*stock\s*\+\s*item\.quantity,\s*updated_at\s*=\s*now\(\)\s*$/i,
  'Restock changes only quantity and timestamp, preserving manually configured availability');
assert(!/\bstock_status\s*=/i.test(sql), 'Cancellation must never override product stock status');
assert(!/exception when|delete from|truncate|create policy|grant update|set payment_status/i.test(sql));
assert(!/checkout_token|request_payload|user_metadata|service_role_key/i.test(sql));
assert(!/MovioStore\.(getOrders|getCustomers|updateOrderStatus)/.test(ui));
assert.match(ui, /generation !== ordersGeneration/);
assert.match(ui, /movio_admin_order_status/);
console.log('PASS Admin orders static review: allowlist on both RPCs, restricted grants, customer RLS preserved, locked/idempotent transactional cancellation, configured stock status preserved, terminal states, no local/demo reads; NO SQL executed');
