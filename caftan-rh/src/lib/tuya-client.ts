// Karim 2026-05-24 : client Tuya Cloud pour le projet "Caftan RH pointage CE"
// (Smart Home, data center Western Europe).
//
// Spec signature : https://developer.tuya.com/en/docs/iot/new-singnature
//   - sign = HMAC-SHA256(client_id + [access_token] + t + nonce + stringToSign, secret).hex.toUpperCase()
//   - stringToSign = METHOD + "\n" + SHA256(body).hex + "\n" + Signature_Headers + "\n" + URL_with_sorted_query
//   - Les query params doivent etre tries alphabetiquement avant signature ET envoi.
//
// Token : expire en 2h, cache en memoire.
//
// IMPORTANT : aucun secret en dur ici. Aucune empreinte biometrique ne transite
// par cette API (uniquement tuya_user_id opaque + timestamps).

import crypto from "node:crypto";

const TUYA_BASE_URL = process.env.TUYA_BASE_URL ?? "https://openapi.tuyaeu.com";

function clientId(): string {
  return process.env.TUYA_CLIENT_ID ?? "";
}
function clientSecret(): string {
  return process.env.TUYA_CLIENT_SECRET ?? "";
}

type CachedToken = {
  access_token: string;
  expire_at: number;
  refresh_token: string;
};
let cachedToken: CachedToken | null = null;

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
function hmacSha256HexUpper(key: string, message: string): string {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest("hex").toUpperCase();
}

// Tuya exige que les query params soient tries alphabetiquement pour la
// signature, et envoyes dans le meme ordre. Sinon code 1004 "sign invalid".
function sortQueryString(urlPath: string): string {
  const idx = urlPath.indexOf("?");
  if (idx < 0) return urlPath;
  const path = urlPath.slice(0, idx);
  const qs = urlPath.slice(idx + 1);
  if (!qs) return urlPath;
  const params = qs.split("&").filter(Boolean);
  params.sort((a, b) => a.split("=")[0].localeCompare(b.split("=")[0]));
  return path + "?" + params.join("&");
}

function tuyaSign(args: {
  accessToken: string;
  method: string;
  urlPath: string; // doit deja etre trie
  body: string;
  timestamp: string;
  nonce: string;
}): string {
  const bodyHash = sha256Hex(args.body);
  const stringToSign = `${args.method.toUpperCase()}\n${bodyHash}\n\n${args.urlPath}`;
  const signStr = clientId() + args.accessToken + args.timestamp + args.nonce + stringToSign;
  return hmacSha256HexUpper(clientSecret(), signStr);
}

function buildHeaders(args: {
  accessToken: string;
  method: string;
  urlPath: string; // deja trie
  body: string;
}): Record<string, string> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const sign = tuyaSign({ ...args, timestamp, nonce });
  const headers: Record<string, string> = {
    client_id: clientId(),
    sign,
    t: timestamp,
    sign_method: "HMAC-SHA256",
    nonce,
    "Content-Type": "application/json",
  };
  if (args.accessToken) headers["access_token"] = args.accessToken;
  return headers;
}

export async function getTuyaAccessToken(): Promise<string> {
  if (!clientId() || !clientSecret()) {
    throw new Error("Tuya credentials manquantes (TUYA_CLIENT_ID / TUYA_CLIENT_SECRET).");
  }
  if (cachedToken && cachedToken.expire_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }
  const urlPath = "/v1.0/token?grant_type=1";
  const headers = buildHeaders({ accessToken: "", method: "GET", urlPath, body: "" });
  const res = await fetch(TUYA_BASE_URL + urlPath, { method: "GET", headers });
  if (!res.ok) throw new Error(`Tuya token HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    success: boolean;
    msg?: string;
    code?: number;
    result?: { access_token: string; expire_time: number; refresh_token: string };
  };
  if (!json.success || !json.result) {
    throw new Error(`Tuya token error (code ${json.code}): ${json.msg ?? "unknown"}`);
  }
  cachedToken = {
    access_token: json.result.access_token,
    expire_at: Date.now() + json.result.expire_time * 1000,
    refresh_token: json.result.refresh_token,
  };
  return cachedToken.access_token;
}

export async function tuyaApiGet<T = unknown>(pathWithQuery: string): Promise<T> {
  const accessToken = await getTuyaAccessToken();
  const sortedPath = sortQueryString(pathWithQuery);
  const headers = buildHeaders({ accessToken, method: "GET", urlPath: sortedPath, body: "" });
  const res = await fetch(TUYA_BASE_URL + sortedPath, { method: "GET", headers });
  if (!res.ok) throw new Error(`Tuya GET ${sortedPath} HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { success: boolean; msg?: string; code?: number; result?: T };
  if (!json.success) {
    throw new Error(`Tuya API error on ${sortedPath} (code ${json.code}): ${json.msg ?? "unknown"}`);
  }
  return json.result as T;
}

export type TuyaDeviceDetail = {
  id: string;
  uuid?: string;
  custom_name: string;
  product_name?: string;
  category: string;
  is_online: boolean;
  active_time: number;
  create_time: number;
  bind_space_id?: string;
  icon?: string;
};

export async function getTuyaDeviceDetail(deviceId: string): Promise<TuyaDeviceDetail | null> {
  try {
    const r = await tuyaApiGet<TuyaDeviceDetail>(`/v2.0/cloud/thing/${encodeURIComponent(deviceId)}`);
    return r;
  } catch (e) {
    console.error(`[tuya] getTuyaDeviceDetail(${deviceId}):`, e);
    return null;
  }
}

export type TuyaUnlockLog = {
  code: string; // ex "unlock_fingerprint_kit", "unlock_password_kit", "unlock_method_create"
  event_id?: number;
  event_time: number; // ms epoch
  event_from?: string;
  status?: string;
  value: string; // base64 - format depend du code (voir parseUnlockValue)
};

/**
 * Recupere les unlock events d un terminal (smart lock / access control).
 * type=7 = unlock log type chez Tuya.
 */
export async function fetchUnlockLogs(args: {
  deviceId: string;
  startTime: number;
  endTime?: number;
  size?: number;
  codes?: string;
}): Promise<TuyaUnlockLog[]> {
  const end = args.endTime ?? Date.now();
  // Tuya cape size a 50 (au-dela : 40000303 "Parameter error").
  const size = Math.min(50, Math.max(1, args.size ?? 50));
  // Karim 2026-05-24 : les terminaux access control LCD (mk) utilisent les
  // codes unlock_fingerprint_kit / unlock_password_kit / unlock_card_kit
  // (PAS unlock_method_create qui est pour les smart-locks ms).
  const codes = args.codes ?? "unlock_fingerprint_kit,unlock_password_kit,unlock_card_kit";

  // Karim 2026-05-24 (agent autonome) : pagination via has_next + next_row_key.
  // L API retourne 50 events max par page ; en cas de backfill sur 7-30j,
  // ca depasse souvent. Si on ne pagine pas, on rate les events les plus
  // anciens dans la fenetre.
  const out: TuyaUnlockLog[] = [];
  let rowKey: string | undefined;
  for (let page = 0; page < 50; page++) {
    let path = `/v1.0/devices/${encodeURIComponent(args.deviceId)}/logs?codes=${codes}&end_time=${end}&size=${size}&start_time=${args.startTime}&type=7`;
    if (rowKey) path += `&start_row_key=${encodeURIComponent(rowKey)}`;
    try {
      const r = await tuyaApiGet<{
        logs?: TuyaUnlockLog[];
        list?: TuyaUnlockLog[];
        has_next?: boolean;
        next_row_key?: string;
      }>(path);
      const list = r.logs ?? r.list ?? [];
      out.push(...list);
      if (!r.has_next || !r.next_row_key) break;
      rowKey = r.next_row_key;
    } catch (e) {
      console.error(`[tuya] fetchUnlockLogs(${args.deviceId}) page=${page}:`, e);
      break;
    }
  }
  return out;
}

/**
 * Decode le champ `value` (base64) d un unlock log Tuya.
 * Format typique :
 *   byte 0      : version (0x01)
 *   byte 1      : unlock_method (1=fingerprint, 2=password, 3=card, 4=face,
 *                 5=temporary password, 6=remote unlock, 9=app, 0xff=admin)
 *   bytes 2-3   : status / result
 *   bytes 4-7   : timestamp ou metadata
 *   bytes 8-11  : tuya_user_id (le numero d enrollement sur le terminal)
 * Le format exact varie selon le firmware ; on extrait au mieux.
 */
/**
 * Decode le `value` (base64) d un unlock event Tuya.
 *
 * Deux formats coexistent selon le firmware du terminal :
 *
 * Format COURT (6 bytes) - access control LCD (mk) avec codes unlock_*_kit :
 *   bytes 0-3 : tuya_user_id (uint32 BE)
 *   bytes 4-5 : ?
 *   La methode est deduite du `code` Tuya (unlock_fingerprint_kit, etc.)
 *   au lieu d etre encodee dans le buffer.
 *
 * Format LONG (12+ bytes) - smart locks (ms) avec code unlock_method_create :
 *   byte 0    : version
 *   byte 1    : method (1=fingerprint, 2=password, ...)
 *   bytes 8-11 : tuya_user_id
 */
export function parseUnlockValue(b64: string, code?: string): {
  raw_hex: string;
  method?: number;
  method_label?: string;
  user_id_in_device?: number;
} {
  let buf: Buffer;
  try { buf = Buffer.from(b64, "base64"); } catch { return { raw_hex: "" }; }
  const hex = buf.toString("hex");

  // Format COURT pour les codes unlock_*_kit (LCD access control)
  if (code && code.endsWith("_kit") && buf.length >= 4) {
    const user_id_in_device = buf.readUInt32BE(0);
    const kitLabels: Record<string, string> = {
      unlock_fingerprint_kit: "fingerprint",
      unlock_password_kit: "password",
      unlock_card_kit: "card",
      unlock_face_kit: "face",
      unlock_temporary_kit: "temporary_password",
      unlock_remote_kit: "remote",
    };
    return {
      raw_hex: hex,
      method_label: kitLabels[code] ?? code,
      user_id_in_device,
    };
  }

  // Format LONG (smart lock)
  if (buf.length >= 12) {
    const method = buf[1];
    const user_id_in_device = buf.readUInt32BE(8);
    const methodLabels: Record<number, string> = {
      1: "fingerprint",
      2: "password",
      3: "card",
      4: "face",
      5: "temporary_password",
      6: "remote_unlock",
      9: "app",
      255: "admin",
    };
    return {
      raw_hex: hex,
      method,
      method_label: methodLabels[method] ?? `unknown_${method}`,
      user_id_in_device,
    };
  }

  return { raw_hex: hex };
}

/**
 * Liste les utilisateurs enrôlés sur un terminal (avec leur nom).
 * Endpoint /v1.0/devices/{id}/users retourne pour chaque user :
 *   { user_id: "4v7cfu", nick_name: "fatna", device_id, birthday, contact, height, sex, weight }
 *
 * ATTENTION : `user_id` (chaîne) NE CORRESPOND PAS au tuya_user_id_in_device
 * (entier) qui apparait dans les unlock logs - ce dernier est un slot local
 * du terminal, non expose par cette API. Cette fonction sert juste a aider
 * l admin a reconnaitre qui est enrôlé sur le terminal.
 */
export async function listDeviceUsers(deviceId: string): Promise<
  Array<{ user_id: string; nick_name: string }>
> {
  const path = `/v1.0/devices/${encodeURIComponent(deviceId)}/users`;
  try {
    const r = await tuyaApiGet<Array<{ user_id: string; nick_name: string }>>(path);
    return r ?? [];
  } catch (e) {
    console.error("[tuya] listDeviceUsers failed:", e);
    return [];
  }
}

/**
 * Test connectivite : token + detail des devices configures.
 */
export async function testTuyaConnection(deviceIds: string[]): Promise<{
  ok: boolean;
  error?: string;
  devices: Array<{ device_id: string; ok: boolean; name?: string; category?: string; online?: boolean; error?: string }>;
}> {
  try {
    await getTuyaAccessToken();
    const devices = await Promise.all(
      deviceIds.map(async (id) => {
        const d = await getTuyaDeviceDetail(id);
        if (!d) return { device_id: id, ok: false, error: "detail unavailable" };
        return {
          device_id: id,
          ok: true,
          name: d.custom_name,
          category: d.category,
          online: d.is_online,
        };
      }),
    );
    return { ok: true, devices };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      devices: [],
    };
  }
}
