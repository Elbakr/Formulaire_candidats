#!/usr/bin/env node
// Génère une paire de clés VAPID pour la WebPush API.
// Usage : `npm run vapid:generate` — copie les 3 lignes dans .env.local.

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("# Copie ces 3 lignes dans caftan-rh/.env.local :");
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_SUBJECT=mailto:hr@caftanfactory.com");
