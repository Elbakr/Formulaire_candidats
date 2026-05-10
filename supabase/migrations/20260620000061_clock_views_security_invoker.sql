-- Force les vues `clock_currently_in` et `clock_sessions` à appliquer
-- les policies RLS du caller (sinon elles bypassent en tant que postgres).
--
-- Idempotent.

alter view if exists clock_currently_in set (security_invoker = on);
alter view if exists clock_sessions set (security_invoker = on);

notify pgrst, 'reload schema';
