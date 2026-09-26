-- Synthetic catalogue for performance testing: 260 categories, 300 brands, 30,000
-- products (90% live), ~60,000 variants with stock, 20,000 customers, 100,000 orders
-- with ~200,000 items, 40,000 approved reviews (~250 MB).
--
-- NEVER run this against a real database. Use a scratch database (see README.md):
--   createdb seshakart_perf && DATABASE_URL=.../seshakart_perf pnpm --filter @seshakart/api prisma:deploy
--   psql .../seshakart_perf -v ON_ERROR_STOP=1 -f tools/perf/seed.sql
\timing on
select setseed(0.42);
-- Categories: 10 roots x 5 children x 4 leaves
insert into categories (id,name,slug,depth,sort_order,updated_at)
select 'c'||r, 'Root '||r, 'root-'||r, 0, r, now() from generate_series(1,10) r;
insert into categories (id,name,slug,parent_id,depth,sort_order,updated_at)
select 'c'||r||'-'||c, 'Group '||r||'-'||c, 'group-'||r||'-'||c, 'c'||r, 1, c, now()
from generate_series(1,10) r, generate_series(1,5) c;
insert into categories (id,name,slug,parent_id,depth,sort_order,updated_at)
select 'c'||r||'-'||c||'-'||l, 'Leaf '||r||'-'||c||'-'||l, 'leaf-'||r||'-'||c||'-'||l, 'c'||r||'-'||c, 2, l, now()
from generate_series(1,10) r, generate_series(1,5) c, generate_series(1,4) l;
insert into brands (id,name,slug,updated_at) select 'b'||g, 'Brand '||g, 'brand-'||g, now() from generate_series(1,300) g;

-- 30k products (90% live)
insert into products (id,name,slug,sku,short_description,description,category_id,brand_id,status,is_featured,published_at,sold_count,rating_avg,rating_count,updated_at,tags)
select 'p'||g,
  (array['Wireless','Smart','Classic','Premium','Eco','Ultra','Compact','Pro'])[1+g%8]||' '||
  (array['Earbuds','Kettle','Shirt','Backpack','Serum','Speaker','Watch','Blender','Saree','Shoes'])[1+(g/8)%10]||' '||g,
  'product-'||g, 'SKU'||g, 'Short description '||g, repeat('Long description text. ',20),
  'c'||(1+g%10)||'-'||(1+(g/10)%5)||'-'||(1+(g/50)%4), 'b'||(1+g%300),
  (case when g%10=0 then 'DRAFT' else 'ACTIVE' end)::"ProductStatus", g%97=0,
  now() - (random()*730||' days')::interval, (random()*2000)::int, round((3+random()*2)::numeric,1), (random()*200)::int, now(),
  array['tag'||(g%50)]
from generate_series(1,30000) g;

-- 1-3 variants each, with inventory (triggers maintain product aggregates)
insert into product_variants (id,product_id,sku,name,options,mrp,price,is_default,position,updated_at)
select 'v'||g||'-'||k, 'p'||g, 'SKU'||g||'-'||k, 'Option '||k, jsonb_build_object('Size', 'S'||k),
  m.mrp, (m.mrp*(0.5+random()*0.5))::int, k=1, k, now()
from generate_series(1,30000) g
cross join lateral generate_series(1, 1+g%3) k
cross join lateral (select ((199+random()*20000)::int*100) as mrp) m;
insert into inventory (id,variant_id,stock,reserved,updated_at)
select 'i'||v.id, v.id, (random()*80)::int, 0, now() from product_variants v;
insert into product_images (id,product_id,url,alt,width,height,position)
select 'img'||g||'-'||k, 'p'||g, '/api/media/demo/x.webp', 'Image', 1000, 1000, k
from generate_series(1,30000) g, generate_series(0,1) k;

-- 20k customers, 100k orders over 12 months with 1-3 items
insert into users (id,name,email,updated_at) select 'u'||g, 'Customer '||g, 'customer'||g||'@example.com', now() from generate_series(1,20000) g;
insert into orders (id,order_number,user_id,email,phone,status,payment_method,shipping_address,billing_address,mrp_total,subtotal,grand_total,tax_total,placed_at,confirmed_at,delivered_at,cancelled_at,updated_at)
select 'o'||g, 'SK'||lpad(g::text,12,'0'), 'u'||(1+g%20000), 'customer'||(1+g%20000)||'@example.com', '98'||lpad((g%100000000)::text,8,'0'),
  s.st::"OrderStatus", (case when g%3=0 then 'COD' else 'PREPAID' end)::"PaymentMethod", '{}'::jsonb, '{}'::jsonb,
  a.amt, a.amt, a.amt, a.amt*18/118, t.ts,
  case when s.st in ('PAYMENT_PENDING') then null else t.ts + interval '2 minutes' end,
  case when s.st='DELIVERED' then t.ts + interval '4 days' end,
  case when s.st='CANCELLED' then t.ts + interval '1 hour' end, now()
from generate_series(1,100000) g
cross join lateral (select now() - (random()*365||' days')::interval as ts) t
cross join lateral (select ((500+random()*10000)::int*100) as amt) a
cross join lateral (select (array['DELIVERED','DELIVERED','DELIVERED','DELIVERED','SHIPPED','CONFIRMED','CANCELLED','PAYMENT_PENDING','PROCESSING','DELIVERED'])[1+g%10] as st) s;
insert into order_items (id,order_id,product_id,variant_id,product_name,variant_name,sku,mrp,unit_price,quantity,tax_rate,tax_amount,line_total)
select 'oi'||g||'-'||k, 'o'||g, 'p'||p.pid, 'v'||p.pid||'-1', 'Product '||p.pid, 'Option 1', 'SKU'||p.pid||'-1', 99900, 79900, 1+k%2, 18, 12189, 79900*(1+k%2)
from generate_series(1,100000) g
cross join lateral generate_series(1, 1+g%3) k
cross join lateral (select 1+((g*7+k*13)%30000) as pid) p;

insert into reviews (id,product_id,user_id,rating,body,status,is_verified_purchase,updated_at,created_at)
select 'r'||g, 'p'||(1+g%30000), 'u'||(1+(g + g/30000) % 20000), 1+g%5, 'Review body '||g, 'APPROVED', true, now(), now() - (random()*300||' days')::interval
from generate_series(1,40000) g on conflict do nothing;
analyze;
refresh materialized view search_vocab;
select (select count(*) from products) products, (select count(*) from product_variants) variants, (select count(*) from orders) orders, (select count(*) from order_items) items, (select count(*) from reviews) reviews;
