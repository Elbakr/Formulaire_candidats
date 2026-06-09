#!/usr/bin/env node
// Karim 2026-06-09 : test end-to-end Phase 1 (outbound_mails) + Phase 2
// (chat_messages) du systeme notif auto.
//
// Verifie pour chaque canal :
//   - une notification est creee avec le bon format
//   - le trigger push existant declenche le push (last_used_at maj)
//   - les garde-fous fonctionnent (status=failed skip, source mute skip)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const l of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m) continue;
  let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("=== Setup : profil de Karim + employee_id ===");
const karim = await c.query(`
  select p.id as profile_id, p.full_name, p.email, e.id as employee_id
  from public.profiles p
  left join public.employees e on e.profile_id = p.id
  where p.email = 'elbazikarim@gmail.com'
  limit 1
`);
if (karim.rows.length === 0) { console.error("Profile Karim introuvable"); process.exit(1); }
const { profile_id, employee_id, full_name } = karim.rows[0];
console.log(`  profile_id=${profile_id.slice(0,8)} employee_id=${employee_id?.slice(0,8) ?? 'null'} name=${full_name}`);

const countBefore = await c.query(`select count(*)::int as n from public.notifications`);
console.log(`Notifications avant : ${countBefore.rows[0].n}`);

// ============================================================================
// TEST 1 : Mail outbound vers Karim (employee_id) avec sender humain
// ============================================================================
console.log("\n=== TEST 1 : outbound_mails avec employee_id + sender humain ===");
// Note : sender_profile_id volontairement NULL pour eviter le skip auto-notif
// (sender == recipient car Karim s'envoie a lui-meme dans ce test). Le trigger
// utilisera sender_name="Caftan Factory" comme libelle.
const test1 = await c.query(`
  insert into public.outbound_mails
    (sender_name, from_email, recipient_email, recipient_name,
     employee_id, subject, body, source, status, delivery_provider)
  values ('Caftan Factory', 'hr@caftanfactory.com', 'elbazikarim@gmail.com',
          $1, $2, 'Test notif auto Phase 1', 'Ceci est un test du nouveau systeme de notifications automatiques. Si tu vois ce push sur ton telephone, le canal mail fonctionne.', 'test_notif_e2e', 'sent', 'emailjs')
  returning id, created_at
`, [full_name, employee_id]);
console.log(`  outbound_mails inseree id=${test1.rows[0].id.slice(0,8)}`);

// ============================================================================
// TEST 2 : Mail status=failed -> ne doit PAS creer de notif
// ============================================================================
console.log("\n=== TEST 2 : outbound_mails status=failed (skip attendu) ===");
const test2 = await c.query(`
  insert into public.outbound_mails
    (sender_name, from_email, recipient_email, employee_id, subject, body, source, status, delivery_provider, error_message)
  values ('Caftan Factory', 'hr@caftanfactory.com', 'elbazikarim@gmail.com',
          $1, 'Test failed mail', 'should not notify', 'test_notif_failed', 'failed', 'resend', 'simulated for test')
  returning id
`, [employee_id]);
console.log(`  outbound_mails(failed) inseree id=${test2.rows[0].id.slice(0,8)}`);

// ============================================================================
// TEST 3 : Mail avec source mutee -> ne doit PAS creer de notif
// ============================================================================
console.log("\n=== TEST 3 : outbound_mails avec source mutee (skip attendu) ===");
await c.query(`insert into public.notification_mute_sources (source, reason) values ('test_muted_source', 'pour test e2e')
               on conflict (source) do nothing`);
const test3 = await c.query(`
  insert into public.outbound_mails
    (sender_name, from_email, recipient_email, employee_id, subject, body, source, status, delivery_provider)
  values ('Caftan Factory', 'hr@caftanfactory.com', 'elbazikarim@gmail.com',
          $1, 'Test muted', 'should not notify', 'test_muted_source', 'sent', 'emailjs')
  returning id
`, [employee_id]);
console.log(`  outbound_mails(muted) inseree id=${test3.rows[0].id.slice(0,8)}`);

// ============================================================================
// TEST 4 : Mail vers email externe sans profile_id -> ne doit PAS creer de notif
// ============================================================================
console.log("\n=== TEST 4 : outbound_mails destinataire externe (skip attendu) ===");
const test4 = await c.query(`
  insert into public.outbound_mails
    (sender_name, from_email, recipient_email, subject, body, source, status, delivery_provider)
  values ('Caftan Factory', 'hr@caftanfactory.com', 'inconnu-externe-${Date.now()}@example.com',
          'Test externe', 'should not notify', 'test_external', 'sent', 'emailjs')
  returning id
`);
console.log(`  outbound_mails(external) inseree id=${test4.rows[0].id.slice(0,8)}`);

// ============================================================================
// TEST 5 : Chat message dans une room ou Karim est membre (avec author != Karim)
// ============================================================================
console.log("\n=== TEST 5 : chat_messages dans une room avec Karim membre ===");
const room = await c.query(`
  select cr.id as room_id, cr.name as room_name,
         (select count(*) from public.chat_room_members where room_id = cr.id) as members,
         (select profile_id from public.chat_room_members where room_id = cr.id and profile_id != $1 limit 1) as other_member
  from public.chat_rooms cr
  join public.chat_room_members crm on crm.room_id = cr.id
  where crm.profile_id = $1
    and cr.is_archived = false
    and (select count(*) from public.chat_room_members where room_id = cr.id) >= 2
  order by (select count(*) from public.chat_room_members where room_id = cr.id) asc
  limit 1
`, [profile_id]);

let test5Id = null;
if (room.rows.length === 0 || !room.rows[0].other_member) {
  console.log("  ⚠️ Karim n'est pas membre d'une room avec un autre membre, skip TEST 5");
} else {
  const { room_id, room_name, members, other_member } = room.rows[0];
  console.log(`  room ${room_name} (${members} membres), author = ${other_member.slice(0,8)}`);
  const test5 = await c.query(`
    insert into public.chat_messages (room_id, author_profile_id, body, attachments)
    values ($1, $2, 'Test notif chat auto - si tu vois ce push sur ton telephone le canal chat fonctionne', '[]'::jsonb)
    returning id
  `, [room_id, other_member]);
  test5Id = test5.rows[0].id;
  console.log(`  chat_messages inseree id=${test5Id.slice(0,8)}`);
}

// ============================================================================
// Attente trigger + push
// ============================================================================
console.log("\nAttente 6 sec pour que tous les triggers + endpoints completent...");
await sleep(6000);

// ============================================================================
// Verifications
// ============================================================================
const countAfter = await c.query(`select count(*)::int as n from public.notifications`);
console.log(`\n=== RESULTATS ===`);
console.log(`Notifications avant : ${countBefore.rows[0].n}, apres : ${countAfter.rows[0].n}, delta : ${countAfter.rows[0].n - countBefore.rows[0].n}`);

const created = await c.query(`
  select id, recipient_id, kind, title, body, link, data->>'source_table' as src_tbl, data->>'mail_source' as src
  from public.notifications
  where created_at > now() - interval '30 seconds'
    and recipient_id = $1
  order by created_at desc
`, [profile_id]);
console.log("\nNotifs creees pour Karim cette session :");
console.table(created.rows.map(r => ({
  kind: r.kind,
  title: r.title?.slice(0, 60),
  body: r.body?.slice(0, 60),
  src_table: r.src_tbl,
  mail_source: r.src
})));

const subs = await c.query(`
  select endpoint, last_used_at, is_active
  from public.push_subscriptions
  where profile_id = $1 and is_active = true
`, [profile_id]);
console.log("\nPush subscriptions actives de Karim (last_used_at devrait etre tres recent) :");
console.table(subs.rows.map(r => ({
  endpoint_prefix: r.endpoint?.slice(8, 40),
  last_used_at: r.last_used_at,
  is_active: r.is_active
})));

// Cleanup mute source de test
await c.query(`delete from public.notification_mute_sources where source = 'test_muted_source'`);

// Verifications structurelles
console.log("\n=== ASSERTIONS ===");
const expected_mail_notif = created.rows.find(r => r.kind === 'mail_received' && r.src === 'test_notif_e2e');
console.log(`  TEST 1 - notif mail creee : ${expected_mail_notif ? '✅ OK' : '❌ MANQUE'}`);
const wrong_failed_notif = created.rows.find(r => r.src === 'test_notif_failed');
console.log(`  TEST 2 - skip status=failed : ${wrong_failed_notif ? '❌ NOTIF CREEE A TORT' : '✅ OK'}`);
const wrong_muted_notif = created.rows.find(r => r.src === 'test_muted_source');
console.log(`  TEST 3 - skip source mutee : ${wrong_muted_notif ? '❌ NOTIF CREEE A TORT' : '✅ OK'}`);
const wrong_external_notif = created.rows.find(r => r.src === 'test_external');
console.log(`  TEST 4 - skip destinataire externe : ${wrong_external_notif ? '❌ NOTIF CREEE A TORT' : '✅ OK'}`);
if (test5Id) {
  const expected_chat_notif = created.rows.find(r => r.kind === 'chat_message');
  console.log(`  TEST 5 - notif chat creee : ${expected_chat_notif ? '✅ OK' : '❌ MANQUE'}`);
}
const subs_used = subs.rows.filter(r => r.last_used_at && new Date(r.last_used_at).getTime() > Date.now() - 30000);
console.log(`  PUSH e2e : ${subs_used.length}/${subs.rows.length} subscriptions ont last_used_at < 30s : ${subs_used.length > 0 ? '✅ OK' : '❌ AUCUN PUSH RECENT'}`);

await c.end();
