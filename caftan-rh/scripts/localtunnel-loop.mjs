// Boucle localtunnel : relance automatique si le client se deconnecte.
// Usage : node scripts/localtunnel-loop.mjs
import localtunnel from "localtunnel";

const PORT = 3000;
const SUBDOMAIN = "caftanrh";

async function runOnce() {
  console.log(`[lt-loop] connecting --subdomain ${SUBDOMAIN} --port ${PORT}`);
  const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
  console.log(`[lt-loop] up at ${tunnel.url}`);
  await new Promise((resolve) => {
    tunnel.on("close", () => {
      console.log("[lt-loop] tunnel closed");
      resolve();
    });
    tunnel.on("error", (e) => {
      console.log("[lt-loop] tunnel error:", e?.message ?? e);
      try {
        tunnel.close();
      } catch {
        /* noop */
      }
      resolve();
    });
  });
}

// setInterval garde l event loop occupe (sinon Node 22 detecte unsettled
// top-level await et termine le process avec exit 13).
const heartbeat = setInterval(() => {}, 60_000);

async function mainLoop() {
  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.log("[lt-loop] runOnce threw:", e?.message ?? e);
    }
    console.log("[lt-loop] reconnect in 3s");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

mainLoop().finally(() => clearInterval(heartbeat));
