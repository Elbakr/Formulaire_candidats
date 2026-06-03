-- Karim 2026-06-03 : log conversations chat IA (anonymisable, RGPD).

CREATE TABLE IF NOT EXISTS public.chat_ai_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_message    text,
  assistant_reply text,
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_ai_logs_user ON public.chat_ai_logs(user_id, created_at DESC);

ALTER TABLE public.chat_ai_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_ai_admin ON public.chat_ai_logs;
CREATE POLICY chat_ai_admin ON public.chat_ai_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS chat_ai_own ON public.chat_ai_logs;
CREATE POLICY chat_ai_own ON public.chat_ai_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
