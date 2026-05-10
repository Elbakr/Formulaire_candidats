#!/usr/bin/env node
// Seed des 6 groupes de chat par site (A..F) + ajout automatique :
//   - tous les profils direction (admin / rh / manager)
//   - tous les employés actifs ayant un profile_id et une assignation au site
//
// Idempotent : upsert par (kind='site_group', site_id), recalcule les membres.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Charger sites + direction + employés actifs
  const { data: sites } = await supabase
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("sort_order");
  if (!sites?.length) {
    console.error("Aucun site. Lance d'abord seed:sites.");
    process.exit(1);
  }

  const { data: direction } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["admin", "rh", "manager"]);
  const directionIds = (direction ?? []).map((p) => p.id);

  const { data: emps } = await supabase
    .from("employees")
    .select("id, profile_id, full_name, status")
    .eq("status", "active")
    .not("profile_id", "is", null);
  const empByProfile = new Map((emps ?? []).map((e) => [e.profile_id, e]));

  // Assignations actives (site → set<profile_id>)
  const todayISO = new Date().toISOString().slice(0, 10);
  const { data: assigns } = await supabase
    .from("site_assignments")
    .select("site_id, employee_id")
    .lte("start_date", todayISO)
    .or(`end_date.is.null,end_date.gte.${todayISO}`);
  const assignsBySite = new Map();
  for (const a of assigns ?? []) {
    const set = assignsBySite.get(a.site_id) ?? new Set();
    const emp = (emps ?? []).find((e) => e.id === a.employee_id);
    if (emp?.profile_id) set.add(emp.profile_id);
    assignsBySite.set(a.site_id, set);
  }

  let totalRooms = 0, totalMembers = 0;

  for (const s of sites) {
    // Upsert room
    const { data: existing } = await supabase
      .from("chat_rooms")
      .select("id")
      .eq("kind", "site_group")
      .eq("site_id", s.id)
      .maybeSingle();

    let roomId = existing?.id;
    if (!roomId) {
      const { data: created, error } = await supabase
        .from("chat_rooms")
        .insert({
          kind: "site_group",
          site_id: s.id,
          name: `Site ${s.code} — ${s.name}`,
          description: `Groupe de discussion pour l'équipe du site ${s.code}.`,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  ✗ ${s.code} : ${error.message}`);
        continue;
      }
      roomId = created.id;
      console.log(`  + Room créée pour ${s.code} (${s.name})`);
    } else {
      console.log(`  ↻ Room existante pour ${s.code}`);
    }
    totalRooms++;

    // Membres : direction + assignés au site
    const memberIds = new Set([
      ...directionIds,
      ...(assignsBySite.get(s.id) ?? []),
    ]);

    if (memberIds.size === 0) {
      console.log(`     (aucun membre à ajouter)`);
      continue;
    }

    const rows = [...memberIds].map((pid) => ({
      room_id: roomId,
      profile_id: pid,
      role: directionIds.includes(pid) ? "admin" : "member",
    }));

    // Upsert : on insert ON CONFLICT DO NOTHING
    const { error } = await supabase
      .from("chat_room_members")
      .upsert(rows, { onConflict: "room_id,profile_id", ignoreDuplicates: true });
    if (error) {
      console.error(`     ✗ ajout membres : ${error.message}`);
      continue;
    }
    console.log(`     ${rows.length} membre(s) (direction + assignés)`);
    totalMembers += rows.length;
  }

  console.log(
    `\nDone. ${totalRooms} room(s) site, ${totalMembers} ajouts membres (direction + employés assignés).`,
  );
  console.log(
    `Note : aucun employé n'a de site_assignment pour le moment — seuls les profils direction sont ajoutés. Ajoute des affectations via /planning/sites/[code] après onboarding.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
