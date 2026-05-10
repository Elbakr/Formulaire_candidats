#!/usr/bin/env node
// Seed du référentiel des communes belges majeures avec coordonnées GPS
// approximatives (centroïdes). ~150 entrées. Idempotent.

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

// Données : postcode, nom, région, province, lat, lng
// Source : centroïdes approximatifs des communes belges (Wikipedia / Belgium.be).
// Couvre les 19 communes de Bruxelles + grandes villes wallonnes et flamandes
// + quelques communes périphérie Bxl.
const POSTCODES = [
  // Bruxelles-Capitale (19 communes)
  ["1000", "Bruxelles", "BRU", "Bruxelles", 50.8466, 4.3528],
  ["1020", "Laeken", "BRU", "Bruxelles", 50.8800, 4.3500],
  ["1030", "Schaerbeek", "BRU", "Bruxelles", 50.8678, 4.3781],
  ["1040", "Etterbeek", "BRU", "Bruxelles", 50.8350, 4.3870],
  ["1050", "Ixelles", "BRU", "Bruxelles", 50.8275, 4.3717],
  ["1060", "Saint-Gilles", "BRU", "Bruxelles", 50.8275, 4.3450],
  ["1070", "Anderlecht", "BRU", "Bruxelles", 50.8367, 4.3098],
  ["1080", "Molenbeek-Saint-Jean", "BRU", "Bruxelles", 50.8553, 4.3327],
  ["1081", "Koekelberg", "BRU", "Bruxelles", 50.8625, 4.3275],
  ["1082", "Berchem-Sainte-Agathe", "BRU", "Bruxelles", 50.8650, 4.2950],
  ["1083", "Ganshoren", "BRU", "Bruxelles", 50.8717, 4.3131],
  ["1090", "Jette", "BRU", "Bruxelles", 50.8800, 4.3300],
  ["1120", "Neder-Over-Heembeek", "BRU", "Bruxelles", 50.9000, 4.3833],
  ["1140", "Evere", "BRU", "Bruxelles", 50.8678, 4.4000],
  ["1150", "Woluwe-Saint-Pierre", "BRU", "Bruxelles", 50.8400, 4.4350],
  ["1160", "Auderghem", "BRU", "Bruxelles", 50.8167, 4.4250],
  ["1170", "Watermael-Boitsfort", "BRU", "Bruxelles", 50.8000, 4.4150],
  ["1180", "Uccle", "BRU", "Bruxelles", 50.8000, 4.3500],
  ["1190", "Forest", "BRU", "Bruxelles", 50.8133, 4.3300],
  ["1200", "Woluwe-Saint-Lambert", "BRU", "Bruxelles", 50.8500, 4.4267],
  ["1210", "Saint-Josse-ten-Noode", "BRU", "Bruxelles", 50.8533, 4.3700],

  // Périphérie Bxl (Brabant flamand)
  ["1700", "Dilbeek", "FLA", "Brabant flamand", 50.8500, 4.2667],
  ["1730", "Asse", "FLA", "Brabant flamand", 50.9100, 4.2000],
  ["1780", "Wemmel", "FLA", "Brabant flamand", 50.9050, 4.3083],
  ["1800", "Vilvoorde", "FLA", "Brabant flamand", 50.9283, 4.4267],
  ["1830", "Machelen", "FLA", "Brabant flamand", 50.8967, 4.4283],
  ["1850", "Grimbergen", "FLA", "Brabant flamand", 50.9333, 4.3667],
  ["1860", "Meise", "FLA", "Brabant flamand", 50.9483, 4.3300],
  ["1930", "Zaventem", "FLA", "Brabant flamand", 50.8833, 4.4733],
  ["1932", "Sint-Stevens-Woluwe", "FLA", "Brabant flamand", 50.8783, 4.4533],

  // Périphérie Bxl (Brabant wallon)
  ["1300", "Wavre", "WAL", "Brabant wallon", 50.7167, 4.6000],
  ["1310", "La Hulpe", "WAL", "Brabant wallon", 50.7333, 4.4833],
  ["1330", "Rixensart", "WAL", "Brabant wallon", 50.7167, 4.5333],
  ["1340", "Ottignies-Louvain-la-Neuve", "WAL", "Brabant wallon", 50.6700, 4.6100],
  ["1348", "Louvain-la-Neuve", "WAL", "Brabant wallon", 50.6683, 4.6117],
  ["1380", "Lasne", "WAL", "Brabant wallon", 50.7000, 4.4833],
  ["1400", "Nivelles", "WAL", "Brabant wallon", 50.5983, 4.3267],
  ["1410", "Waterloo", "WAL", "Brabant wallon", 50.7167, 4.4000],
  ["1420", "Braine-l'Alleud", "WAL", "Brabant wallon", 50.6833, 4.3667],
  ["1430", "Rebecq", "WAL", "Brabant wallon", 50.6700, 4.1383],
  ["1450", "Chastre", "WAL", "Brabant wallon", 50.6133, 4.6267],
  ["1470", "Genappe", "WAL", "Brabant wallon", 50.6133, 4.4500],

  // Hainaut
  ["6000", "Charleroi", "WAL", "Hainaut", 50.4108, 4.4445],
  ["6030", "Marchienne-au-Pont", "WAL", "Hainaut", 50.4133, 4.4083],
  ["6040", "Jumet", "WAL", "Hainaut", 50.4500, 4.4333],
  ["6060", "Gilly", "WAL", "Hainaut", 50.4333, 4.4667],
  ["7000", "Mons", "WAL", "Hainaut", 50.4542, 3.9514],
  ["7100", "La Louvière", "WAL", "Hainaut", 50.4783, 4.1850],
  ["7300", "Boussu", "WAL", "Hainaut", 50.4333, 3.7917],
  ["7500", "Tournai", "WAL", "Hainaut", 50.6056, 3.3886],
  ["7700", "Mouscron", "WAL", "Hainaut", 50.7444, 3.2076],
  ["7800", "Ath", "WAL", "Hainaut", 50.6283, 3.7783],
  ["7860", "Lessines", "WAL", "Hainaut", 50.7100, 3.8333],

  // Liège
  ["4000", "Liège", "WAL", "Liège", 50.6333, 5.5667],
  ["4020", "Liège (Bressoux)", "WAL", "Liège", 50.6483, 5.5933],
  ["4030", "Grivegnée", "WAL", "Liège", 50.6300, 5.6033],
  ["4040", "Herstal", "WAL", "Liège", 50.6633, 5.6300],
  ["4100", "Seraing", "WAL", "Liège", 50.6033, 5.5067],
  ["4400", "Flémalle", "WAL", "Liège", 50.6000, 5.4500],
  ["4500", "Huy", "WAL", "Liège", 50.5183, 5.2400],
  ["4600", "Visé", "WAL", "Liège", 50.7383, 5.6967],
  ["4700", "Eupen", "WAL", "Liège", 50.6286, 6.0386],
  ["4800", "Verviers", "WAL", "Liège", 50.5897, 5.8625],
  ["4900", "Spa", "WAL", "Liège", 50.4917, 5.8650],

  // Namur
  ["5000", "Namur", "WAL", "Namur", 50.4669, 4.8675],
  ["5100", "Jambes", "WAL", "Namur", 50.4583, 4.8667],
  ["5300", "Andenne", "WAL", "Namur", 50.4886, 5.0942],
  ["5500", "Dinant", "WAL", "Namur", 50.2603, 4.9128],
  ["5570", "Beauraing", "WAL", "Namur", 50.1117, 4.9550],

  // Luxembourg
  ["6700", "Arlon", "WAL", "Luxembourg", 49.6839, 5.8167],
  ["6800", "Libramont-Chevigny", "WAL", "Luxembourg", 49.9217, 5.3783],
  ["6900", "Marche-en-Famenne", "WAL", "Luxembourg", 50.2283, 5.3433],

  // Brabant wallon (autres)
  ["1480", "Tubize", "WAL", "Brabant wallon", 50.6900, 4.2050],
  ["1490", "Court-Saint-Étienne", "WAL", "Brabant wallon", 50.6450, 4.5683],

  // Anvers (province + ville + districts)
  ["2000", "Antwerpen", "FLA", "Anvers", 51.2194, 4.4025],
  ["2018", "Antwerpen (centre)", "FLA", "Anvers", 51.2147, 4.4202],
  ["2020", "Antwerpen", "FLA", "Anvers", 51.1983, 4.3900],
  ["2030", "Antwerpen", "FLA", "Anvers", 51.2367, 4.3683],
  ["2040", "Antwerpen", "FLA", "Anvers", 51.3300, 4.3300],
  ["2050", "Antwerpen", "FLA", "Anvers", 51.2117, 4.3700],
  ["2060", "Antwerpen", "FLA", "Anvers", 51.2283, 4.4150],
  ["2070", "Zwijndrecht", "FLA", "Anvers", 51.2167, 4.3333],
  ["2100", "Deurne", "FLA", "Anvers", 51.2233, 4.4633],
  ["2140", "Borgerhout", "FLA", "Anvers", 51.2150, 4.4333],
  ["2150", "Borsbeek", "FLA", "Anvers", 51.1983, 4.4783],
  ["2170", "Merksem", "FLA", "Anvers", 51.2533, 4.4400],
  ["2180", "Ekeren", "FLA", "Anvers", 51.2833, 4.4283],
  ["2200", "Herentals", "FLA", "Anvers", 51.1817, 4.8300],
  ["2300", "Turnhout", "FLA", "Anvers", 51.3220, 4.9447],
  ["2500", "Lier", "FLA", "Anvers", 51.1311, 4.5703],
  ["2600", "Berchem", "FLA", "Anvers", 51.1933, 4.4150],
  ["2610", "Wilrijk", "FLA", "Anvers", 51.1683, 4.3950],
  ["2620", "Hemiksem", "FLA", "Anvers", 51.1467, 4.3417],
  ["2640", "Mortsel", "FLA", "Anvers", 51.1700, 4.4500],
  ["2660", "Hoboken", "FLA", "Anvers", 51.1750, 4.3500],
  ["2800", "Mechelen", "FLA", "Anvers", 51.0259, 4.4775],
  ["2900", "Schoten", "FLA", "Anvers", 51.2533, 4.5000],

  // Flandre orientale
  ["9000", "Gent", "FLA", "Flandre orientale", 51.0543, 3.7174],
  ["9050", "Gentbrugge", "FLA", "Flandre orientale", 51.0367, 3.7517],
  ["9100", "Sint-Niklaas", "FLA", "Flandre orientale", 51.1644, 4.1437],
  ["9200", "Dendermonde", "FLA", "Flandre orientale", 51.0289, 4.1014],
  ["9300", "Aalst", "FLA", "Flandre orientale", 50.9367, 4.0411],
  ["9500", "Geraardsbergen", "FLA", "Flandre orientale", 50.7717, 3.8767],
  ["9600", "Ronse", "FLA", "Flandre orientale", 50.7456, 3.6033],
  ["9700", "Oudenaarde", "FLA", "Flandre orientale", 50.8500, 3.6028],
  ["9800", "Deinze", "FLA", "Flandre orientale", 50.9842, 3.5314],
  ["9900", "Eeklo", "FLA", "Flandre orientale", 51.1856, 3.5611],

  // Flandre occidentale
  ["8000", "Brugge", "FLA", "Flandre occidentale", 51.2093, 3.2247],
  ["8200", "Sint-Andries", "FLA", "Flandre occidentale", 51.1933, 3.1867],
  ["8210", "Loppem", "FLA", "Flandre occidentale", 51.1683, 3.2317],
  ["8300", "Knokke-Heist", "FLA", "Flandre occidentale", 51.3367, 3.2900],
  ["8400", "Oostende", "FLA", "Flandre occidentale", 51.2300, 2.9214],
  ["8500", "Kortrijk", "FLA", "Flandre occidentale", 50.8281, 3.2647],
  ["8600", "Diksmuide", "FLA", "Flandre occidentale", 51.0333, 2.8617],
  ["8700", "Tielt", "FLA", "Flandre occidentale", 51.0000, 3.3267],
  ["8800", "Roeselare", "FLA", "Flandre occidentale", 50.9467, 3.1267],
  ["8900", "Ieper", "FLA", "Flandre occidentale", 50.8514, 2.8856],

  // Brabant flamand (hors périphérie Bxl)
  ["3000", "Leuven", "FLA", "Brabant flamand", 50.8794, 4.7011],
  ["3001", "Heverlee", "FLA", "Brabant flamand", 50.8650, 4.6817],
  ["3010", "Kessel-Lo", "FLA", "Brabant flamand", 50.8800, 4.7233],
  ["3020", "Herent", "FLA", "Brabant flamand", 50.9100, 4.6783],
  ["3050", "Oud-Heverlee", "FLA", "Brabant flamand", 50.8333, 4.6500],
  ["3070", "Kortenberg", "FLA", "Brabant flamand", 50.8867, 4.5483],
  ["3080", "Tervuren", "FLA", "Brabant flamand", 50.8217, 4.5117],
  ["3090", "Overijse", "FLA", "Brabant flamand", 50.7700, 4.5300],
  ["3200", "Aarschot", "FLA", "Brabant flamand", 50.9867, 4.8333],
  ["3300", "Tienen", "FLA", "Brabant flamand", 50.8067, 4.9383],
  ["3400", "Landen", "FLA", "Brabant flamand", 50.7500, 5.0817],
  ["3500", "Hasselt", "FLA", "Limbourg", 50.9307, 5.3324],
  ["3600", "Genk", "FLA", "Limbourg", 50.9650, 5.5000],
  ["3700", "Tongeren", "FLA", "Limbourg", 50.7800, 5.4633],
  ["3800", "Sint-Truiden", "FLA", "Limbourg", 50.8167, 5.1833],
  ["3900", "Pelt", "FLA", "Limbourg", 51.2167, 5.4167],

  // Limbourg (suite)
  ["3910", "Pelt (Neerpelt)", "FLA", "Limbourg", 51.2167, 5.4333],
  ["3920", "Lommel", "FLA", "Limbourg", 51.2300, 5.3133],
];

async function main() {
  const rows = POSTCODES.map(([postcode, name, region, province, lat, lng]) => ({
    postcode,
    name,
    region,
    province,
    lat,
    lng,
  }));

  const { error, count } = await supabase
    .from("be_postcodes")
    .upsert(rows, { onConflict: "postcode", ignoreDuplicates: true, count: "exact" });

  if (error) {
    console.error(`Erreur upsert : ${error.message}`);
    process.exit(1);
  }

  console.log(`Done. ${rows.length} communes envoyées (idempotent — ignore duplicates).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
