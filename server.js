const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "9139960225";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DATA_FILE = process.env.DATA_FILE || "/data/replies.json";
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const sessions = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;

if (!BOT_TOKEN || !ADMIN_PASSWORD || !WEBHOOK_SECRET) {
  console.error("Missing required environment variables: BOT_TOKEN, ADMIN_PASSWORD, WEBHOOK_SECRET");
  process.exit(1);
}

function ensureStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ replies: [], defaultReply: "", photoReply: "" }, null, 2));
}
function readStore() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(data.replies)) data.replies = [];
    if (typeof data.defaultReply !== "string") data.defaultReply = "";
    if (typeof data.photoReply !== "string") data.photoReply = "";
    if (typeof data.businessOwnerId !== "string" && typeof data.businessOwnerId !== "number") data.businessOwnerId = "";
    return data;
  } catch { return { replies: [], defaultReply: "", photoReply: "" }; }
}
function writeStore(data) {
  ensureStore();
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function cookieToken(req) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/(?:^|;\s*)drosak_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}
function requireAdmin(req, res, next) {
  const token = cookieToken(req);
  const expiry = sessions.get(token);
  if (!token || !expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "انتهت الجلسة، سجل الدخول مرة أخرى" });
  }
  sessions.set(token, Date.now() + SESSION_TTL);
  next();
}
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}
function normalize(s) { return String(s || "").trim().toLocaleLowerCase(); }
async function handleBusinessMessage(message) {
  if (!message || !message.business_connection_id || !message.chat) return;
  if (message.from && message.from.is_bot) return;
  // Ignore messages sent by the connected business account owner.
  const ownerId = readStore().businessOwnerId;
  if (ownerId && message.from && String(message.from.id) === String(ownerId)) return;
  const store = readStore();
  // Custom response for any incoming photo (with or without a caption).
  if (Array.isArray(message.photo) && message.photo.length) {
    const photoReply = String(store.photoReply || "").trim();
    if (photoReply) await telegram("sendMessage", { business_connection_id: message.business_connection_id, chat_id: message.chat.id, text: photoReply });
    return;
  }
  if (!message.text) return;
  const text = message.text.trim();
  if (!text || text.startsWith("/")) return;
  const found = store.replies.filter(r => r.enabled !== false && r.keyword && normalize(text).includes(normalize(r.keyword)))
    .sort((a, b) => normalize(b.keyword).length - normalize(a.keyword).length)[0];
  const reply = found ? found.reply : store.defaultReply;
  if (!reply || !reply.trim()) return;
  await telegram("sendMessage", { business_connection_id: message.business_connection_id, chat_id: message.chat.id, text: reply });
}

app.get("/", (_req, res) => res.send("Drosak Plus Auto Reply is running."));
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  if (!safeEqual(username, ADMIN_USER) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  res.cookie("drosak_session", token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: SESSION_TTL });
  res.json({ ok: true, username: ADMIN_USER });
});
app.get("/api/session", (req, res) => {
  const token = cookieToken(req); const expiry = sessions.get(token);
  if (!token || !expiry || expiry < Date.now()) return res.status(401).json({ authenticated: false });
  sessions.set(token, Date.now() + SESSION_TTL);
  res.json({ authenticated: true, username: ADMIN_USER });
});
app.post("/api/logout", (req, res) => {
  sessions.delete(cookieToken(req));
  res.clearCookie("drosak_session", { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  res.json({ ok: true });
});

app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, async (req, res) => {
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) return res.sendStatus(403);
  res.sendStatus(200);
  try {
    const update = req.body || {};
    // Telegram sends business_connection updates containing the owner's Telegram user ID.
    // Save it so outgoing messages written by the account owner are never auto-replied to.
    if (update.business_connection?.user?.id) {
      const store = readStore();
      store.businessOwnerId = String(update.business_connection.user.id);
      writeStore(store);
    }
    if (update.business_message) await handleBusinessMessage(update.business_message);
  } catch (err) { console.error("Update handling error:", err.message); }
});

app.use("/api", (req, res, next) => {
  if (["/login", "/session", "/logout"].includes(req.path)) return next();
  return requireAdmin(req, res, next);
});
app.get("/api/replies", (_req, res) => res.json(readStore()));
app.put("/api/replies", (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.replies)) return res.status(400).json({ error: "replies must be an array" });
  const replies = body.replies.map(r => ({
    id: String(r.id || Date.now() + Math.random().toString(16).slice(2)),
    keyword: String(r.keyword || "").trim().slice(0, 100),
    reply: String(r.reply || "").trim().slice(0, 4000),
    enabled: r.enabled !== false
  })).filter(r => r.keyword && r.reply);
  const defaultReply = String(body.defaultReply || "").trim().slice(0, 4000);
  const photoReply = String(body.photoReply || "").trim().slice(0, 4000);
  const previous = readStore();
  writeStore({ replies, defaultReply, photoReply, businessOwnerId: previous.businessOwnerId || "" });
  res.json({ ok: true, count: replies.length });
});

app.listen(PORT, async () => {
  console.log(`Auto reply server listening on ${PORT}`);
  ensureStore();
  // Send a one-time startup test to the configured admin Telegram account.
  try {
    await telegram("sendMessage", {
      chat_id: ADMIN_TELEGRAM_ID,
      text: "✅ اختبار اتصال بوت دروسك بلس\n\nوصلت الرسالة بنجاح. Telegram ID المسجل: " + ADMIN_TELEGRAM_ID
    });
    console.log("Admin Telegram test message sent.");
  } catch (err) {
    console.error("Could not send admin Telegram test message:", err.message);
  }
  if (PUBLIC_DOMAIN) {
    try {
      await telegram("setWebhook", {
        url: `https://${PUBLIC_DOMAIN}/telegram/webhook/${WEBHOOK_SECRET}`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["business_message", "business_connection"]
      });
      console.log("Telegram webhook configured.");
    } catch (err) { console.error("Could not configure Telegram webhook:", err.message); }
  } else console.warn("RAILWAY_PUBLIC_DOMAIN is not set; configure a Railway public domain and redeploy.");
});
process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", err => console.error(err));
