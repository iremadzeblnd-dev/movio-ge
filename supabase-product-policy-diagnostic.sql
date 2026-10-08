-- READ ONLY: policy metadata, without product/customer records or function calls.
-- Include ALL policies: they also affect SELECT, INSERT, UPDATE and DELETE.
SELECT policyname, cmd AS operation, roles, permissive,
       qual AS using_expression, with_check AS with_check_expression
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'products'
ORDER BY cmd, policyname;
