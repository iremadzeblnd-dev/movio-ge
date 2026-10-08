# MOVIO — გაშვების საბოლოო მომზადება

Current launch route: [FINAL-LAUNCH-CHECKLIST.md](FINAL-LAUNCH-CHECKLIST.md). The owner has chosen the existing Supabase and Vercel projects. Its single checklist supersedes the separate staging project procedure below; no new Supabase project or repeated migration/SQL check is required. Read-only checks cannot establish real checkout persistence.

მიმდინარე შედეგი: ადგილობრივი კოდი მზადაა საბოლოო კონფიგურაციისა და ავტორიზებული staging განთავსებისთვის. **production-ის უსაფრთხო გაშვება ჯერ არ არის დადასტურებული.** ამ სამუშაოში არ შეცვლილა production მონაცემები, არ შესრულებულა production მიგრაციები, commit, push ან deploy. დასრულებული აუდიტი და live SQL დიაგნოსტიკა არ გამეორებულა.

## `/api/orders` 404 — დადგენილი მიზეზი

Vercel-ის read-only API-დან დადასტურდა:

- `movio-ge.vercel.app` მიუთითებს `movio-10nnff8n5-giorgi11.vercel.app` განთავსებაზე, ID `dpl_2UfW1HcogBuKZUt9yQt97TLQbq83`.
- განთავსების წყაროა `redeploy`, Git რევიზია `0bdabbde8b2bd3186409d3c0b8d99da16e506720`, branch `main`.
- ამ ძველ კომიტში არც `api/orders.js` და არც `vercel.json` არ არსებობს — ეს დამატებით შემოწმდა ადგილობრივ Git ხეში.
- სამუშაოს მიმდინარე HEAD არის `9d9297a`, სადაც API უკვე არსებობს; დამატებითი ადგილობრივი ცვლილებები ჯერ დაუკომიტებელია.

ეს ძველი რევიზიის ხელახალი განთავსებაა, არა მიმდინარე API-ის არასწორი rewrite. ძველი deployment-ის Redeploy ვერ დაამატებს ფაილს, რომელიც მის რევიზიაში არ არსებობს. საჭიროა მიმდინარე კანდიდატის ახალი, ცალკე ავტორიზებული განთავსება. უცნობი ფუნქციის 404 არ უნდა გადაიფაროს SPA/static rewrite-ით.

მიმდინარე `vercel.json` ინარჩუნებს უსაფრთხოების სათაურებს და არ გადაფარავს API-ს. მიმდინარე ადგილობრივი `vercel build --prod --yes` წარმატებით დასრულდა. არტეფაქტში არსებობს `functions/api/orders.func`, handler `api/orders.js`, runtime `nodejs24.x`; ფუნქციის ფაილი ზუსტად ემთხვევა კანდიდატის კოდს. filesystem როუტინგი API fallback 404-მდე სრულდება; API-ის კოდი static ფაილად არ ქვეყნდება. კონფიდენციალური, სატესტო და დროებითი ფაილები static output-ში არ მოხვდა. არსებული production URL-ის read-only GET კვლავ 404-ს აბრუნებს; build არ არის deploy.

## შესრულებული მომზადება

- დაემატა `scripts/prepare-staging.cjs`: ქმნის ახალ, იზოლირებულ `tmp/staging-release` ასლს ცალკე Supabase-ის საჯარო URL/key-ით; production წყაროს არ ცვლის, `.vercel` კავშირს/საიდუმლო გარემოს/ბექაპებს/ტესტებს არ აკოპირებს და არაფერს განათავსებს.
- ხელსაწყო უარყოფს production catalog-ის პროექტს, არასწორ URL-ს, `sb_secret`/service-role გასაღებს და უკვე არსებულ output-ს. მხოლოდ public publishable ან legacy anon ფორმატის გასაღებს იღებს; გასაღების პროექტთან შესაბამისობა ამ ადგილობრივი შემოწმებით არ მტკიცდება.
- დაემატა staging მომზადებისა და Vercel build არტეფაქტის რეგრესიული ტესტები.
- `tests/orders-api.cjs` ახლა ამოწმებს ექვსივე სავალდებულო გარემოს ცვლადის ცალ-ცალკე არარსებობას: GET/POST უნდა დაიხუროს 503-ით და upstream მოთხოვნა არ გაიგზავნოს.
- ახალი application-ის დეფექტი არ დადასტურდა; დიზაინი, ფუნქციონალი, გადახდის მეთოდი და არსებული SQL მიგრაციები არ შეცვლილა.

## რა არის შემოწმებული

- სერვერი სტუმარს უკავშირებს `user_id=null`-ს; ავტორიზებული მომხმარებლის ID-ს იღებს Supabase Auth-დან და არა browser payload-იდან.
- Turnstile secret მხოლოდ სერვერიდან Siteverify-ს გადაეცემა; მოწმდება `success === true`, `action=checkout`, origin-ის შესაბამისი hostname და Siteverify HTTP შედეგი. GET მხოლოდ public siteKey/deliveryRule-ს აბრუნებს.
- გაურკვეველი upstream/ქსელის შედეგი ინარჩუნებს თავდაპირველ token/payload-ს; შემდგომი 401/403/409 ძველ გაურკვეველ შედეგს არ აუქმებს.
- მიმდინარე SQL კონტრაქტი შეიცავს უნიკალურ checkout token-ს, ტრანზაქციულ ჩაკეტვას, authoritative ფასს/მიწოდებას, orders/items შენახვას, მარაგის დაკლებას, unavailable პროდუქტის უარყოფას და idempotent გაუქმებას/მარაგის აღდგენას.
- customer order history იყენებს საკუთარი შეკვეთების RLS-ს; Admin RPC-ები ავტორიზაციას PostgreSQL-ში ამოწმებს. checkout RPC browser როლებისთვის დახურული უნდა იყოს; legacy ხუთარგუმენტიანი ფუნქცია გამოყენებას უარყოფს.
- წინასწარი production metadata შედეგი **227 PASS / 5 REVIEW / 0 FAIL** და მოწოდებული live პროდუქტის/Admin პოლიტიკის შედეგები მიღებულია უკვე დასრულებულ მტკიცებულებად. იგივე SQL-ის ხელახალი გაშვება არ არის მოთხოვნილი. ფაილების არსებობა applied migration-ების მტკიცებულებად არ გამოყენებულა; დარჩენილი runtime/compatibility გეიტები რეალური staging გზით უნდა დადასტურდეს.

ამ პასში **14 შესაბამისი ტესტის ნაკრები PASS, 0 FAIL**: staging-preparation, orders-api, orders-http, checkout-retry, admin-security, admin-orders, product-delivery, free-shipping-migration, deployment-security, current-orders-sql, production-check (`--static`), orders-browser, customer-auth და vercel-build-output. Production build PASS.

`current-orders-sql` შესრულდა მხოლოდ ახალ, disposable in-memory PostgreSQL/PGlite-ში — production-ის არც მონაცემებს და არც მიგრაციებს არ შეხებია. Browser ტესტები მოიცავს 320/390/1280px ზომებს, guest/Auth, Admin, history, shipping და retry სცენარებს, მაგრამ Auth/checkout backend სიმულირებულია. ერთპროცესიანი SQL ტესტები არ ადასტურებს რეალურ მრავალკავშირიან concurrency-ს. წინარე სრული 19-suite აუდიტი არ გამეორებულა.

## უსაფრთხო staging მომზადების პროცედურა

ცალკე Supabase პროექტისა და **საჯარო** staging URL/key-ის მიღების შემდეგ, ადგილობრივ გარემოში მიუთითეთ `STAGING_SUPABASE_URL` და `STAGING_SUPABASE_PUBLISHABLE_KEY`, შემდეგ გაუშვით:

```powershell
node scripts/prepare-staging.cjs
```

შედეგი შეიქმნება ignored `tmp/staging-release` დირექტორიაში. production `supabaseClient.js` უცვლელი დარჩება. ხელსაწყო არ იღებს service-role ან Turnstile secret-ს. ის არც `.env`-ს ქმნის და არც Vercel პროექტს უკავშირდება. უკვე არსებული ასლი არ გადაიწერება. ახალ ასლში არ არსებობს პროდუქტის mock ან localStorage catalog fallback.

მხოლოდ ცალკე ავტორიზაციის შემდეგ დაუკავშირეთ ეს ასლი **ახალ staging Vercel პროექტს** და არა `movio-ge`-ს. staging სერვერის Supabase URL/public key უნდა ემთხვეოდეს ამ ასლის browser კონფიგურაციას; პრივილეგირებული გასაღებები მხოლოდ ამ staging პროექტის სერვერულ გარემოში ჩასვით. გამოიყენეთ რეალური, staging hostname-ზე დაშვებული Turnstile widget. ამ სამუშაოში real-key staging ასლი არ შექმნილა, რადგან ცალკე პროექტის საჯარო კონფიგურაცია არ არის მოწოდებული; ტესტები იზოლირებულ fixtures-ს იყენებდა.

## თქვენი ჩართულობის მოკლე, ერთიანი სია — თანმიმდევრობით

1. **Supabase:** მოამზადეთ ცალკე staging პროექტი, ცარიელი/ხელოვნური პროდუქტები, Admin და ორი customer test account. გამოიყენეთ უკვე შემოწმებული სქემის effects; არსებულ ბაზაზე დასრულებული მიგრაციები არ გაიმეოროთ. თუ ახალი staging სქემა migration ფაილებიდან იქმნება, თითოეული პირველად მხოლოდ იქ შესრულდეს, nationwide-free-shipping ბოლოს. production მონაცემები/ანგარიშები staging-ში არ გადაიტანოთ. staging-ის საჯარო URL/key საჭიროა ასლის მოსამზადებლად; საიდუმლო გასაღებები აქ არ გააზიაროთ.
2. **Vercel + Cloudflare:** staging პროექტში და საბოლოო production კონფიგურაციაში Dashboard-იდან გადაამოწმეთ ექვსი სახელი/მნიშვნელობა: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_ALLOWED_ORIGINS`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Production-ში სახელები უკვე დადასტურებულია; მნიშვნელობები არა. უზრუნველყავით პროექტის/გასაღებების შესაბამისობა, ზუსტი origin-ები, Turnstile hostname/action, Auth redirects/email და პლატფორმის rate limits. Production secret მნიშვნელობები არ უნდა გადმოიტანოთ staging ასლში.
3. **Staging deployment-ის ცალკე ავტორიზაცია:** განათავსეთ მომზადებული მიმდინარე კანდიდატი მხოლოდ იზოლირებულ staging პროექტში. `/api/orders` GET უნდა იყოს 200 და აჩვენებდეს მხოლოდ siteKey/deliveryRule-ს; deployment-ში Node 24 ფუნქცია უნდა ჩანდეს. ძველი `0bdabbd` deployment-ის Redeploy არ გამოიყენოთ. placeholders-ით შექმნილი ადგილობრივი build არ განათავსოთ prebuilt რეჟიმში.
4. **Staging acceptance:** ხელოვნური მონაცემებით შეამოწმეთ რეალური Turnstile/guest/Auth შეკვეთები, orders/items, Admin management, customer A/B isolation, ფასისა და უფასო/ფასიანი/შერეული მიწოდების totals, ბოლო ერთეულის პარალელური გაყიდვა, დაკარგული პასუხის retry, გაუქმება/restock მხოლოდ ერთხელ და deleted/unavailable პროდუქტის უარყოფა. შეამოწმეთ ელფოსტა და Safari/iOS. production-ზე სატესტო შეკვეთები არ შექმნათ.
5. **საბოლოო გაშვების ავტორიზაცია:** staging შედეგების შემდეგ დაამტკიცეთ საჭირო ბიზნეს/პოლიტიკის კონტენტი და ცალკე გასცეთ commit/push/deploy-ის ნებართვა. ახალი deployment უნდა შეიცავდეს მიმდინარე კანდიდატს და არა ძველ რევიზიას; საბოლოოდ გადაამოწმეთ API route, revision და რეალური კატალოგი. ბანკის ინტეგრაცია ამ სამუშაოს ნაწილი არ არის.

**დასკვნა:** ამ პასში დადასტურებული კოდის ბლოკერი არ დარჩა. 404-ის გამოსწორების დარჩენილი მოქმედება სწორი რევიზიის ავტორიზებული განთავსებაა; რეალური კონფიგურაცია და staging acceptance ჯერ ღიაა. ამიტომ MOVIO-ს უსაფრთხო production გაშვებაზე დადებითი დასკვნა ჯერ ვერ გაიცემა.
