// Karim 2026-06-14 : les polls IMAP Gmail (inbound-imap-poll, payslip-imap-poll)
// échouaient par intermittence avec « Command failed » (erreur réseau/transitoire
// côté Gmail), ce qui faisait sortir le workflow GitHub Actions en erreur et
// envoyait un mail « All jobs have failed ». Ces erreurs sont transitoires : on
// les classe ici et on retente une fois avant d'abandonner. Les routes appelantes
// répondent 200 {ok:false, soft_error} sur transitoire (pas de fausse alerte),
// et gardent 5xx pour les vraies pannes (creds, code).

/** Vrai si l'erreur ressemble à un aléa réseau/IMAP transitoire (réessayable). */
export function isTransientImapError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const code = String((e as { code?: unknown })?.code ?? "").toLowerCase();
  const needles = [
    "command failed",
    "timeout",
    "timed out",
    "socket",
    "connection",
    "econnreset",
    "etimedout",
    "econnrefused",
    "ehostunreach",
    "enotfound",
    "epipe",
    "network",
  ];
  return needles.some((n) => msg.includes(n) || code.includes(n));
}

/**
 * Exécute `fn`, et en cas d'erreur IMAP transitoire la retente (`attempts`
 * tentatives au total) avec un backoff linéaire. Les erreurs non-transitoires
 * sont relancées immédiatement. `fn` DOIT être ré-entrante (recréer son client
 * IMAP à chaque tentative).
 */
export async function retryOnTransientImap<T>(
  fn: () => Promise<T>,
  attempts = 2,
  backoffMs = 1500,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const more = i < attempts - 1;
      if (more && isTransientImapError(e)) {
        await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
