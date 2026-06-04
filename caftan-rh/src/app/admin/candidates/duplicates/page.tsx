// Karim 2026-06-04 : page admin de purge des doublons candidates.
// Detection multi-critere : email exact, telephone exact (>6 digits),
// nom+date_naissance exacts. Groupes affiches dans tableau avec selection
// keeper + merge en 1 clic.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { DuplicateGroupTable } from "./duplicate-group-table";

type Candidate = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  birth_date: string | null;
  postal_code: string | null;
  city: string | null;
  source: string | null;
  applied_at: string | null;
  created_at: string | null;
  gf_entry_id: string | null;
  profile_id: string | null;
  cv_url: string | null;
};

type DuplicateGroup = {
  criterion: string;
  key: string;
  candidates: Candidate[];
};

function digitsOnly(s: string | null): string {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeName(s: string | null): string {
  return (s ?? "").toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

function dataCount(c: Candidate): number {
  let n = 0;
  for (const v of [c.email, c.full_name, c.phone, c.birth_date, c.postal_code, c.city, c.cv_url, c.profile_id, c.gf_entry_id]) {
    if (v) n += 1;
  }
  return n;
}

export default async function CandidatesDuplicatesPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: candsRaw } = await admin
    .from("candidates")
    .select("id, email, full_name, phone, birth_date, postal_code, city, source, applied_at, created_at, gf_entry_id, profile_id, cv_url")
    .order("applied_at", { ascending: false })
    .limit(5000);
  const candidates = (candsRaw ?? []) as Candidate[];

  // Index multi-critere
  const byEmail = new Map<string, Candidate[]>();
  const byPhone = new Map<string, Candidate[]>();
  const byNameBirth = new Map<string, Candidate[]>();

  for (const c of candidates) {
    if (c.email) {
      const k = c.email.toLowerCase().trim();
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k)!.push(c);
    }
    const ph = digitsOnly(c.phone);
    if (ph.length >= 7) {
      // normalise BE : si commence par 0032 -> 0, sinon garde tel quel
      const n = ph.startsWith("0032") ? "0" + ph.slice(4) : ph.startsWith("32") && ph.length >= 11 ? "0" + ph.slice(2) : ph;
      if (!byPhone.has(n)) byPhone.set(n, []);
      byPhone.get(n)!.push(c);
    }
    if (c.full_name && c.birth_date) {
      const k = `${normalizeName(c.full_name)}|${c.birth_date}`;
      if (!byNameBirth.has(k)) byNameBirth.set(k, []);
      byNameBirth.get(k)!.push(c);
    }
  }

  const groups: DuplicateGroup[] = [];
  const seenIds = new Set<string>(); // pour ne pas re-grouper un meme ensemble 2x

  function addGroup(criterion: string, key: string, list: Candidate[]) {
    if (list.length < 2) return;
    // Skip si tous les ids ont deja ete groupes (meme ensemble)
    const ids = list.map((c) => c.id).sort();
    const idsKey = ids.join(",");
    if (seenIds.has(idsKey)) return;
    seenIds.add(idsKey);
    // Trie : keeper par defaut = le plus rempli + plus recent
    list.sort((a, b) => {
      const da = dataCount(a) - dataCount(b);
      if (da !== 0) return -da;
      const ta = a.applied_at ? new Date(a.applied_at).getTime() : 0;
      const tb = b.applied_at ? new Date(b.applied_at).getTime() : 0;
      return tb - ta;
    });
    groups.push({ criterion, key, candidates: list });
  }

  for (const [k, list] of byEmail) addGroup("Email identique", k, list);
  for (const [k, list] of byPhone) addGroup("Téléphone identique", k, list);
  for (const [k, list] of byNameBirth) addGroup("Nom + date naissance", k, list);

  // Trie groupes par taille desc, puis par criterion
  groups.sort((a, b) => b.candidates.length - a.candidates.length);

  const totalDups = groups.reduce((s, g) => s + (g.candidates.length - 1), 0);

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold">Purge doublons candidats</h1>
        <p className="text-xs text-ink-3 mt-1">
          {groups.length} groupe(s) detecte(s) · {totalDups} doublon(s) potentiel(s) sur {candidates.length} candidats.
          Le keeper recommande (en vert) est celui avec le plus de donnees remplies + applied_at le plus recent.
          Les autres rows seront supprimees mais leurs FK (applications, documents, screening, employees, mails...)
          sont transferees vers le keeper avant DELETE — aucune perte de donnee metier.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="border border-emerald-300 bg-emerald-50 rounded p-4 text-sm text-emerald-900">
          ✓ Aucun doublon detecte selon les critères : email, téléphone, nom+date naissance.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <DuplicateGroupTable
              key={`${g.criterion}-${g.key}`}
              criterion={g.criterion}
              groupKey={g.key}
              candidates={g.candidates}
            />
          ))}
        </div>
      )}

      <div className="text-[10px] text-ink-3 border-t pt-2">
        <strong>Comment ca marche</strong> — Pour chaque groupe, choisis le candidate à conserver (radio).
        Click sur &quot;Fusionner&quot; transfère toutes les références FK (applications, documents, screening,
        shifts, employees, mails, etc.) du/des doublon(s) vers le keeper, puis supprime les duplicates.
        Tout est loggé dans activity_log (action=candidates_merged) pour audit.
      </div>
    </div>
  );
}
