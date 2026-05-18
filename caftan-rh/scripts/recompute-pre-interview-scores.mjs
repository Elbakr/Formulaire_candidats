// Karim 18/05 : recalcule pre_interview_score pour tous les candidats
// ayant un pre_interview en status 'completed'. Persiste dans
// candidates.pre_interview_score + breakdown.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// --- bareme (duplique depuis lib pour rester standalone) ---
function avail(v) {
  if (v === "immediat") return { score: 25, label: "Immédiat (top)" };
  if (v === "1_2_sem") return { score: 20, label: "1-2 semaines" };
  if (v === "1_mois") return { score: 12, label: "1 mois" };
  if (v === "plus_tard") return { score: 5, label: "Plus tard" };
  return { score: 0, label: "—" };
}
function mob(v) {
  if (v === "oui_toutes") return { score: 20, label: "Toutes les boutiques" };
  if (v === "oui_certaines") return { score: 12, label: "Certaines uniquement" };
  if (v === "non") return { score: 4, label: "Un seul lieu" };
  return { score: 0, label: "—" };
}
function comm(arr) { return { score: Math.min(10, (arr?.length ?? 0) * 4), count: arr?.length ?? 0 }; }
function txtQ(responses) {
  const cfg = [{ s: 10, t: 50, d: 150 }, { s: 20, t: 50, d: 150 }, { s: 30, t: 30, d: 100 }, { s: 60, t: 20, d: 80 }];
  let total = 0;
  for (const q of cfg) {
    const r = responses.find((x) => x.so === q.s);
    const len = (r?.text ?? "").trim().length;
    if (len >= q.d) total += 6; else if (len >= q.t) total += 4; else if (len > 0) total += 2;
  }
  return Math.min(25, total);
}
function vid(responses) {
  let count = 0;
  for (const r of responses) if (r.kind === "video" && r.video) count++;
  return { score: Math.min(15, count * 5), count };
}
function eng(responses) {
  const q45 = responses.find(x => x.so === 45);
  const q70 = responses.find(x => x.so === 70);
  let p = 0;
  if ((q45?.text ?? "").trim()) p += 2;
  if (Array.isArray(q70?.choices) && q70.choices.length > 0) p += 3;
  return p;
}

// --- exec ---
const { rows: pis } = await c.query(`
  select pi.id, pi.application_id, a.candidate_id, c.full_name
  from pre_interviews pi
  join applications a on a.id=pi.application_id
  join candidates c on c.id=a.candidate_id
  where pi.status='completed'
`);
console.log(`\n${pis.length} pre-interviews completed a scorer.\n`);

for (const pi of pis) {
  const { rows: rs } = await c.query(`
    select q.sort_order as so, q.kind, r.answer_text as text, r.answer_choices as choices,
      r.answer_scale as scale, r.video_storage_path as video
    from pre_interview_responses r
    join pre_interview_questions q on q.id=r.question_id
    where r.pre_interview_id=$1
  `, [pi.id]);
  const a = avail(rs.find(x => x.so === 40)?.choices?.[0]);
  const m = mob(rs.find(x => x.so === 50)?.choices?.[0]);
  const cm = comm(rs.find(x => x.so === 70)?.choices);
  const t = txtQ(rs);
  const v = vid(rs);
  const e = eng(rs);
  const score = Math.min(100, a.score + m.score + cm.score + t + v.score + e);
  const breakdown = {
    availability: a.score, mobility: m.score, communication: cm.score,
    text_quality: t, videos: v.score, engagement: e,
    availability_label: a.label, mobility_label: m.label,
    channels_count: cm.count, videos_count: v.count,
  };
  await c.query(
    `update candidates set pre_interview_score = $1, pre_interview_breakdown = $2::jsonb, pre_interview_score_computed_at = now() where id = $3`,
    [score, JSON.stringify(breakdown), pi.candidate_id],
  );
  console.log(`  ${pi.full_name.padEnd(28)} | score=${score}/100 (avail=${a.score} mob=${m.score} comm=${cm.score} txt=${t} vid=${v.score} eng=${e})`);
}
console.log(`\n✅ ${pis.length} scores calcules.`);
await c.end();
