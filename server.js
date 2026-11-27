const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PLATFORM_API_URL = String(process.env.PLATFORM_API_URL || "").replace(/\/$/, "");
const BOT_TRIAL_SECRET = process.env.BOT_TRIAL_SECRET;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "9139960225";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const DATA_FILE = process.env.DATA_FILE || "/data/replies.json";
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const sessions = new Map();
const trialFlow = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;

const DEFAULT_REPLIES = [
  ["اهلا", "أهلًا بيك في دروسك بلس ❤️ اسألني عن التجربة أو الاشتراك أو المحاضرات."],
  ["السلام عليكم", "وعليكم السلام ورحمة الله وبركاته ❤️ أهلًا بيك في دروسك بلس."],
  ["الباقات", "أهلًا بيك ❤️ لمعرفة الباقات الحالية اكتب «عايز أشترك»، ولو حولت بالفعل اكتب «أنا دفعت» وابعت صورة التحويل."],
  ["عايز اشترك", "تمام ❤️ اختار الباقة المناسبة من صفحة الاشتراك في المنصة. بعد التحويل اكتب «أنا دفعت» وابعت صورة الإيصال هنا."],
  ["انا دفعت", "تمام ❤️ ابعت صورة إيصال التحويل هنا في الشات علشان نراجع طلب اشتراكك."],
  ["انا حولت", "تمام ❤️ ابعت صورة إيصال التحويل هنا في الشات علشان نراجع طلب اشتراكك."],
  ["تجربة", "علشان تاخد التجربة المجانية لمدة ساعة، ابعت اسمك بالكامل وهطلب منك الشعبة وبعدها هبعتلك الكود هنا."],
  ["كود الدخول", "كود الدخول بيتبعت هنا بعد التجربة أو تفعيل الاشتراك. لو عندك مشكلة في الكود اكتب «التواصل مع الإدارة»."],
  ["الكود مش شغال", "ابعت كودك واكتب «التواصل مع الإدارة» علشان نراجع حالة الحساب وعدد الأجهزة."],
  ["نسيت الكود", "اكتب «التواصل مع الإدارة» وابعت بيانات حسابك أو رقم الطلب علشان نساعدك تسترجع الكود."],
  ["انتهى الاشتراك", "لو اشتراكك انتهى، تقدر تجدد من صفحة الباقات. بعد التحويل اكتب «أنا دفعت» وابعت الإيصال."],
  ["تجديد", "لتجديد الاشتراك، اختار الباقة المناسبة وبعد التحويل اكتب «أنا دفعت» وابعت صورة الإيصال."],
  ["المحاضرات مش ظاهرة", "افتح الشعبة والقسم الصحيح. لو المحاضرة لسه مش ظاهرة ابعت اسم الشعبة والقسم واسم المحاضرة للدعم."],
  ["الفيديو مش شغال", "جرّب تحديث الصفحة والتأكد من اتصال الإنترنت. لو المشكلة مستمرة ابعت اسم المحاضرة وصورة للمشكلة."],
  ["الملف مش بيفتح", "جرّب فتح الملف من متصفح حديث أو تحميل قارئ PDF. لو المشكلة مستمرة ابعت اسم الملف وصورة للخطأ."],
  ["الجدول", "لحد دلوقتي مفيش مواعيد مؤكدة أقدر أأكدها. تابع قناة التليجرام الرسمية لأي إعلان جديد."],
  ["الامتحانات", "لو عندك مشكلة في اختبار، ابعت اسم الاختبار والشعبة وصورة للمشكلة علشان نراجعها."],
  ["الشعبة", "المحتوى بيظهر حسب الشعبة المسجلة في حسابك. لو الشعبة غلط، اكتب «التواصل مع الإدارة» علشان نراجع بياناتك."],
  ["عدد الأجهزة", "كود الاشتراك بيشتغل على عدد الأجهزة المحدد للحساب. لو وصلت للحد المسموح اكتب «التواصل مع الإدارة»."],
  ["التواصل مع الادارة", "أكيد ❤️ ابعت كود الاشتراك بتاعك علشان الإدارة تعرف توصل لحسابك. لو مش معاك كود أو مش مشترك، اكتب «مش معايا»."],
  ["مواعيد", "لحد دلوقتي مفيش مواعيد مؤكدة أقدر أأكدها. تابع قناة التليجرام الرسمية لأي إعلان جديد."],
  ["عامل ايه", "الحمد لله بخير ❤️ إنت عامل إيه؟ محتاج أي مساعدة في دروسك بلس؟"],
  ["ازيك", "الحمد لله تمام ❤️ إنت أخبارك إيه؟"],
  ["محتاج محاضرة", "أكيد ❤️ ابعت اسم المادة واسم المدرس والمحاضرة اللي محتاجها، وهنساعدك توصلها."],
  ["فين المحاضرة", "ابعت اسم المادة والمدرس واسم المحاضرة، وقولنا شعبتك علشان نساعدك تلاقيها."],
  ["عندي مشكلة", "معلش على المشكلة ❤️ احكيلنا حصل إيه، ولو فيه رسالة خطأ ابعت صورة منها علشان نساعدك."],
  ["محتاج اسأل", "اتفضل اسأل براحتك ❤️ ابعت سؤالك وهنساعدك على قد ما نقدر."],
  ["عاوز اسأل", "اتفضل ❤️ اكتب سؤالك بطريقتك، وأنا هحاول أساعدك."],
  ["عايز اسال", "اتفضل ❤️ اكتب سؤالك بطريقتك، وأنا هحاول أساعدك."],
  ["مش فاهم", "ولا يهمك ❤️ قولنا إيه اللي مش واضح، اسم المادة أو المحاضرة، وهنساعدك."],
  ["المحاضرة ناقصة", "ابعت اسم المادة والمدرس والمحاضرة الناقصة والشعبة، علشان نراجعها."],
  ["الملفات مش ظاهرة", "جرّب تدخل على الشعبة والقسم الصحيح. لو الملفات لسه مش ظاهرة، ابعت اسم القسم وصورة للمشكلة."],
  ["المنصة بطيئة", "معلش ❤️ جرّب تحديث الصفحة وتأكد من الإنترنت. لو البطء مستمر ابعت نوع جهازك وصورة للمشكلة."],
  ["التجربة مش شغالة", "ابعتلنا صورة للمشكلة اللي ظهرت بعد طلب التجربة، واكتب «التواصل مع الإدارة» علشان نراجعها."],
  ["اشتراكي مش اتفعل", "معلش على التأخير ❤️ اكتب «أنا دفعت» وابعت صورة الإيصال هنا، وهنراجع طلب تفعيل الاشتراك."],
  ["عاوز اكلم حد", "أكيد ❤️ اكتب «التواصل مع الإدارة»، وهطلب منك كود الاشتراك أو تقدر تقول «مش معايا» لو مش مشترك."],
  ["العفو", "تحت أمرك ❤️ إحنا موجودين لو احتجت أي مساعدة."],
  ["صباح الخير", "صباح النور ❤️ يومك جميل إن شاء الله! محتاج مساعدة في إيه؟"],
  ["مساء الخير", "مساء النور ❤️ أهلًا بيك، محتاج أي مساعدة؟"]
].map(([keyword, reply], i) => ({ id: `builtin-${i + 1}`, keyword, reply, enabled: true }));

if (!BOT_TOKEN || !ADMIN_PASSWORD || !WEBHOOK_SECRET) {
  console.error("Missing required environment variables: BOT_TOKEN, ADMIN_PASSWORD, WEBHOOK_SECRET");
  process.exit(1);
}

function ensureStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ replies: DEFAULT_REPLIES, builtInRepliesSeeded: true, defaultReply: "", photoReply: "", paymentPending: {}, paymentRecords: [], paymentAdminFlows: {}, photoContext: {}, contactFlow: {}, imageReplies: [] }, null, 2));
}
function readStore() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(data.replies)) data.replies = [];
    {
      const existingIds = new Set(data.replies.map(r => String(r?.id || "")));
      const missingBuiltins = DEFAULT_REPLIES.filter(r => !existingIds.has(r.id));
      if (missingBuiltins.length || data.builtInRepliesSeeded !== true) {
        data.replies = [...data.replies, ...missingBuiltins];
        data.builtInRepliesSeeded = true;
        writeStore(data);
      }
    }
    if (typeof data.defaultReply !== "string") data.defaultReply = "";
    if (typeof data.photoReply !== "string") data.photoReply = "";
    if (typeof data.businessOwnerId !== "string" && typeof data.businessOwnerId !== "number") data.businessOwnerId = "";
    if (!data.paymentPending || typeof data.paymentPending !== "object") data.paymentPending = {};
    if (!Array.isArray(data.paymentRecords)) data.paymentRecords = [];
    if (!data.paymentAdminFlows || typeof data.paymentAdminFlows !== "object") data.paymentAdminFlows = {};
    if (!data.photoContext || typeof data.photoContext !== "object") data.photoContext = {};
    if (!data.contactFlow || typeof data.contactFlow !== "object") data.contactFlow = {};
    if (!Array.isArray(data.imageReplies)) data.imageReplies = [];
    return data;
  } catch { return { replies: [], defaultReply: "", photoReply: "", paymentPending: {}, paymentRecords: [], paymentAdminFlows: {}, photoContext: {}, contactFlow: {}, imageReplies: [] }; }
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
function normalize(s) {
  return String(s || "").toLocaleLowerCase().trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[ـ]/g, "").replace(/[؟?!.,،؛:()\[\]{}\-_/\\]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function trialKey(message) {
  return `${message.business_connection_id}:${message.chat.id}`;
}
async function sendBusinessText(message, text, reply_markup) {
  const payload = { business_connection_id: message.business_connection_id, chat_id: message.chat.id, text };
  if (reply_markup) payload.reply_markup = reply_markup;
  return telegram("sendMessage", payload);
}
async function createTrialCode(name, section, telegramUserId) {
  if (!PLATFORM_API_URL || !BOT_TRIAL_SECRET) throw new Error("Trial integration is not configured");
  const response = await fetch(`${PLATFORM_API_URL}/api/bot/trial`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bot-trial-secret": BOT_TRIAL_SECRET },
    body: JSON.stringify({ name, section, telegramUserId: String(telegramUserId), hours: 1, maxDevices: 1 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.code) {
    const error = new Error(data.error || `Platform trial API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data.code;
}
async function handleTrialFlow(message, text) {
  const key = trialKey(message);
  const state = trialFlow.get(key);
  const normalized = normalize(text);
  if (!state) {
    // Recognize common Egyptian Arabic requests to start a free trial.
    const trialIntent =
      normalized.includes("تجرب") ||
      normalized.includes("تجريب") ||
      normalized.includes("اجرب") ||
      normalized.includes("جرب") ||
      normalized.includes("trial");
    if (trialIntent) {
      trialFlow.set(key, { step: "name", createdAt: Date.now() });
      await sendBusinessText(message, "🎉 أهلاً بيك في منصة دروسك بلس!\n\nعلشان نطلعلك كود التجربة المجانية لمدة ساعة، ابعت اسمك بالكامل.");
      return true;
    }
    return false;
  }
  if (Date.now() - state.createdAt > 15 * 60 * 1000) {
    trialFlow.delete(key);
    await sendBusinessText(message, "انتهت مهلة طلب التجربة. ابعت «تجربة» وابدأ من جديد.");
    return true;
  }
  if (state.step === "name") {
    const name = text.trim().slice(0, 100);
    if (name.length < 2) {
      await sendBusinessText(message, "اكتب اسمك بشكل صحيح من فضلك.");
      return true;
    }
    state.name = name;
    state.step = "section";
    state.createdAt = Date.now();
    trialFlow.set(key, state);
    await sendBusinessText(message, "اختار شعبتك أو ابعتها كتابةً: علمي علوم، علمي رياضة، أدبي، أو أزهر.");
    return true;
  }
  if (state.step === "section") {
    const section = text.trim().slice(0, 80);
    if (section.length < 2) {
      await sendBusinessText(message, "ابعت اسم الشعبة بشكل صحيح.");
      return true;
    }
    trialFlow.delete(key);
    let code = "";
    try {
      code = await createTrialCode(state.name, section, message.from?.id);
    } catch (err) {
      console.error("Trial code creation failed:", err.message);
      if (err.status === 409) {
        await sendBusinessText(message, "معلش ❤️ التجربة المجانية متاحة مرة واحدة لكل حساب، ويظهر إنك استخدمتها قبل كده. لو محتاج اشتراك اكتب «عايز أشترك».");
      } else {
        await sendBusinessText(message, "حصلت مشكلة أثناء إنشاء كود التجربة. جرّب بعد قليل أو اكتب «التواصل مع الإدارة».");
      }
      return true;
    }

    const fullMessage = `🎉 أهلاً بيك في منصة دروسك بلس!\n\n👤 الاسم: ${state.name}\n📚 الشعبة: ${section}\n🔑 كود الدخول: ${code}\n\n🌟 هذا كود ساعة واحدة.\n\n💙 احنا موجودين معاك دائمًا لو محتاج أي حاجة ابعتلنا.\n\n🌐 رابط الدخول للمنصة:\nhttps://www.durosakplus.com/`;
    try {
      await sendBusinessText(message, fullMessage, {
        inline_keyboard: [
          [{ text: "📋 نسخ الكود", copy_text: { text: code } }],
          [{ text: "🌐 فتح المنصة", url: "https://www.durosakplus.com/" }]
        ]
      });
    } catch (sendErr) {
      console.error("Could not deliver trial code to student:", sendErr.message);
      try { await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `⚠️ تم إنشاء تجربة لكن تعذر إرسالها للطالب.\nالاسم: ${state.name}\nالشعبة: ${section}\nالكود: ${code}\nTelegram ID: ${message.from?.id || message.chat.id}\nالخطأ: ${sendErr.message}` }); } catch {}
      return true;
    }
    // Admin notification is best-effort and must not make the student delivery look failed.
    try {
      await telegram("sendMessage", {
        chat_id: ADMIN_TELEGRAM_ID,
        text: `🎁 تجربة مجانية جديدة\n👤 الاسم: ${state.name}\n📚 الشعبة: ${section}\n🔑 الكود: ${code}\n🆔 Telegram ID: ${message.from?.id || message.chat.id}`,
        reply_markup: { inline_keyboard: [[{ text: "👤 عرض حساب الطالب", url: `tg://user?id=${message.from?.id || message.chat.id}` }]] }
      });
    } catch (adminErr) { console.error("Trial admin notification failed:", adminErr.message); }
    return true;
  }
  trialFlow.delete(key);
  return false;
}

async function getTelegramPhotoBuffer(fileId) {
  const file = await telegram("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram file path missing");
  const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error(`Photo download failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > 8 * 1024 * 1024) throw new Error("Photo too large");
  return Buffer.from(arrayBuffer);
}

// Estimates receipt-likeness only; it cannot prove payment or reliably detect edits.
async function analyzePaymentImage(buffer) {
  if (!OPENAI_API_KEY) return { isReceipt: null, confidence: 0, provider: "غير محدد", warnings: "تحليل الصور غير مفعّل" };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Analyze whether the image visually resembles an Egyptian payment/transfer receipt. It may be from InstaPay, Vodafone Cash, Orange Cash, Etisalat Cash, Fawry, an app screenshot, or a photo of another phone screen. Return JSON keys is_receipt (boolean), confidence (number 0-100), provider (short Arabic string), visible_reference (string or empty), visual_warnings (short Arabic string). Confidence means visual resemblance to a receipt ONLY, not payment authenticity. Never claim payment is genuine or Photoshop-free; an image alone cannot prove that." },
        { role: "user", content: [{ type: "text", text: "صنّف الصورة كإيصال تحويل محتمل أو صورة عادية، واذكر علامات عدم الوضوح أو الاشتباه الظاهرة فقط." }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}`, detail: "high" } }] }
      ],
      max_tokens: 300
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Image analysis failed ${response.status}`);
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return {
    isReceipt: Boolean(parsed.is_receipt),
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    provider: String(parsed.provider || "غير محدد").slice(0, 80),
    visibleReference: String(parsed.visible_reference || "").slice(0, 120),
    warnings: String(parsed.visual_warnings || "").slice(0, 400)
  };
}


function findPaymentRecord(store, id) {
  return store.paymentRecords.find(r => String(r.id) === String(id));
}
async function notifyAdminPayment(record, photoFileId, duplicate) {
  const duplicateText = duplicate
    ? `\n🚨 تنبيه تكرار: نفس الصورة أو مرجع العملية سبق تسجيله. راجع الطلب قبل الموافقة.`
    : "";
  const caption = `📥 طلب مراجعة تحويل جديد\n🧾 رقم الطلب: ${record.id}\n👤 الاسم: ${record.name || "غير متوفر"}\n📚 الشعبة: ${record.section || "غير متوفر"}\n⏰ وقت التحويل: ${record.transferTime || "غير متوفر"}\n📱 رقم التحويل منه: ${record.senderPhone || "غير متوفر"}\n🆔 Telegram ID: ${record.telegramUserId}\n🔢 مرجع العملية الظاهر: ${record.visibleReference || "غير ظاهر"}\n🏦 المصدر الظاهر: ${record.provider || "غير محدد"}\n🖼️ تشابه الصورة مع إيصال: ${record.receiptConfidence || 0}% (ليس إثباتًا لصحة الدفع)\n⚠️ ملاحظات الصورة: ${record.visualWarnings || "لا توجد"}${duplicateText}\n\nتأكد من وصول المبلغ فعليًا قبل تفعيل الاشتراك.`;
  const reply_markup = { inline_keyboard: [
    [
      { text: "✅ تم الاستلام", callback_data: `pay:received:${record.id}` },
      { text: "❌ لم يتم الاستلام", callback_data: `pay:missing:${record.id}` }
    ],
    [{ text: "👤 عرض حساب الطالب", url: `tg://user?id=${record.telegramUserId}` }]
  ] };
  let sent;
  try {
    sent = await telegram("sendPhoto", { chat_id: ADMIN_TELEGRAM_ID, photo: photoFileId, caption: caption.slice(0, 1000), reply_markup });
  } catch (err) {
    console.error("Admin payment photo notification failed:", err.message);
    sent = await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: caption.slice(0, 3900), reply_markup });
  }
  if (sent?.message_id) {
    const store = readStore();
    const saved = findPaymentRecord(store, record.id);
    if (saved) { saved.adminMessageId = sent.message_id; writeStore(store); }
  }
}

async function matchSavedImageReply(buffer, imageReplies) {
  if (!OPENAI_API_KEY || !Array.isArray(imageReplies) || !imageReplies.length) return null;
  const candidates = imageReplies.filter(x => x && x.imageData && x.reply && x.enabled !== false).slice(0, 6);
  if (!candidates.length) return null;
  const content = [
    { type: "text", text: "الصورة الأولى هي صورة الطالب. الصور التالية صور مرجعية أضافها مسؤول البوت. حدد هل صورة الطالب مطابقة أو قريبة بصريًا بوضوح من إحدى الصور المرجعية. لا تخمن. أعد JSON فقط بالشكل {match_index: رقم يبدأ من 0 أو null, confidence: رقم من 0 إلى 100}. لا تعتبر إيصال التحويل صحيحًا ولا تتحقق من الدفع." },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString("base64")}`, detail: "low" } }
  ];
  for (let i = 0; i < candidates.length; i++) {
    const data = String(candidates[i].imageData);
    content.push({ type: "text", text: `الصورة المرجعية رقم ${i}` });
    content.push({ type: "image_url", image_url: { url: data.startsWith("data:") ? data : `data:image/jpeg;base64,${data}`, detail: "low" } });
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
      max_tokens: 100
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Image matching failed ${response.status}`);
  const result = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const index = Number(result.match_index);
  const confidence = Math.max(0, Math.min(100, Number(result.confidence) || 0));
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length || confidence < 78) return null;
  return candidates[index];
}
async function handlePaymentPhoto(message) {
  const bestPhoto = message.photo?.[message.photo.length - 1];
  if (!bestPhoto?.file_id) return;
  const key = trialKey(message);
  const store = readStore();
  const pending = store.paymentPending[key];

  // If the student started a payment request, the receipt photo begins the real review flow.
  if (pending?.step === "receipt") {
    try {
      const buffer = await getTelegramPhotoBuffer(bestPhoto.file_id);
      let analysis = { isReceipt: null, confidence: 0, provider: "غير محدد", visibleReference: "", warnings: "لم يتم تحليل الصورة" };
      try { analysis = await analyzePaymentImage(buffer); } catch (e) { console.warn("Payment image analysis failed:", e.message); }
      pending.fileId = bestPhoto.file_id;
      pending.imageHash = crypto.createHash("sha256").update(buffer).digest("hex");
      pending.provider = analysis.provider || "غير محدد";
      pending.visibleReference = analysis.visibleReference || "";
      pending.receiptConfidence = analysis.confidence || 0;
      pending.visualWarnings = analysis.warnings || "";
      pending.step = "time";
      pending.createdAt = Date.now();
      store.paymentPending[key] = pending;
      writeStore(store);
      await sendBusinessText(message, "وصلت صورة التحويل 📷\n\nالتحويل كان إمتى؟ اكتب مثلًا: النهارده، من ساعة، أو وقت التحويل التقريبي.");
      return;
    } catch (err) {
      console.error("Payment receipt processing failed:", err.message);
      await sendBusinessText(message, "حصلت مشكلة في استقبال الصورة. ابعتها تاني من فضلك.");
      return;
    }
  }

  // Reference-image replies are independent from payment processing.
  try {
    const buffer = await getTelegramPhotoBuffer(bestPhoto.file_id);
    const matched = await matchSavedImageReply(buffer, store.imageReplies);
    if (matched?.reply) {
      await sendBusinessText(message, String(matched.reply).slice(0, 4000));
      return;
    }
  } catch (err) {
    console.warn("Saved image reply matching failed:", err.message);
  }

  // Keep context for the owner to manually reply to the student's photo.
  store.photoContext[key] = {
    fileId: bestPhoto.file_id,
    messageId: message.message_id,
    businessConnectionId: message.business_connection_id,
    chatId: String(message.chat.id),
    telegramUserId: String(message.from?.id || message.chat.id),
    createdAt: Date.now()
  };
  writeStore(store);
  const responseText = String(store.photoReply || "").trim();
  if (responseText) await sendBusinessText(message, responseText);
}

function isPaymentIntent(text) {
  const n = normalize(text).replace(/[أإآ]/g, "ا");
  return /(انا دفعت|دفعت|حولت|انا حولت|أنا حولت|تم التحويل|اشتركت|دفعت الفلوس|دفعت المبلغ|تم الدفع|عايز افعل|عاوز افعل|تفعيل اشتراك|تجديد اشتراك|فعل الاشتراك)/i.test(n);
}
async function handlePaymentIntent(message, text) {
  const key = trialKey(message);
  const store = readStore();
  const current = store.paymentPending[key];
  if (current && Date.now() - current.createdAt < 24 * 60 * 60 * 1000) {
    if (current.step === "receipt") {
      await sendBusinessText(message, "أنا معاك ❤️ ابعت صورة إيصال التحويل هنا علشان نكمل مراجعة الاشتراك.");
      return true;
    }
    return false;
  }
  const normalized = normalize(text).replace(/[أإآ]/g, "ا");
  if (/(سعر|بكام|كام|الباقات|الاسعار|عايز اعرف|عاوز اعرف)/.test(normalized)) return false;
  if (!isPaymentIntent(text)) return false;
  store.paymentPending[key] = {
    step: "receipt",
    businessConnectionId: message.business_connection_id,
    chatId: String(message.chat.id),
    telegramUserId: String(message.from?.id || message.chat.id),
    createdAt: Date.now()
  };
  writeStore(store);
  await sendBusinessText(message, "تمام ❤️ علشان نراجع اشتراكك، ابعت صورة إيصال التحويل هنا في الشات.\n\nبعد الصورة هسألك وقت التحويل ورقم التليفون والاسم والشعبة، وبعدها هبعت البيانات للإدارة.");
  return true;
}

function builtInFaqReply(text) {
  const n = normalize(text);
  if (/^(عامل ايه|عامله ايه|ازيك|اخبارك ايه|كيفك)$/.test(n)) return "الحمد لله بخير ❤️ إنت عامل إيه؟ محتاج أي مساعدة في دروسك بلس؟";
  if (/^(صباح الخير|صباح النور)$/.test(n)) return "صباح النور ❤️ يومك جميل إن شاء الله! محتاج مساعدة في إيه؟";
  if (/^(مساء الخير|مساء النور)$/.test(n)) return "مساء النور ❤️ أهلًا بيك، محتاج أي مساعدة؟";
  if (/^(السلام عليكم|سلام عليكم|السلام عليكو)$/.test(n)) return "وعليكم السلام ورحمة الله وبركاته ❤️ أهلًا بيك في دروسك بلس.";
  if (/^(شكرا|شكراً|تسلم|تسلمي|متشكر|تمام|حلو)$/.test(n)) return "العفو ❤️ إحنا موجودين دايمًا لو احتجت أي حاجة.";
  if (/(محتاج|محتاجه|عايز|عاوز|عاوزه|فين|مش لاقي|مش لاقيه).*(محاضره|محاضرة|درس|ملف|pdf|فيديو)/.test(n) || /(محاضره ناقصه|محاضره مش ظاهره|المحاضره مش موجوده)/.test(n)) return "أكيد ❤️ ابعت اسم المادة واسم المدرس والمحاضرة اللي محتاجها، وقولنا شعبتك علشان نساعدك توصلها.";
  if (/(عندي مشكله|في مشكله|محتاج مساعده|عايز مساعده|عاوز مساعده|مش فاهم|مش عارف اعمل|المنصه فيها عطل)/.test(n)) return "معلش على المشكلة ❤️ احكيلنا حصل إيه، ولو فيه رسالة خطأ ابعت صورة منها، وهنساعدك.";
  if (/(عايز اسال|عاوز اسال|محتاج اسال|عندي سؤال|عايز استفسر|عاوز استفسر|استفسار عن حاجه)/.test(n)) return "اتفضل اسأل براحتك ❤️ اكتب سؤالك بطريقتك وهنحاول نساعدك.";
  if (/(ازاي|كيف).*(تجرب|تجربه)|تجربه مجانيه|كود تجربه|عايز اجرب|عاوز اجرب/.test(n)) return "للتجربة المجانية اكتب «تجربة» أو «عايز أجرب»، وهطلب منك اسمك وشعبتك وبعدها أبعتلك كود التجربة هنا في الشات. التجربة متاحة مرة واحدة لكل حساب.";
  if (/(سعر|بكام|كام|الاسعار|الباقات|اشتراك شهر|اشتراك سنه|اشتراك سنوي)/.test(n)) return "أهلًا بيك ❤️ لمعرفة الباقات الحالية وتفاصيل الاشتراك اكتب «الباقات» أو «عايز أشترك»، ولو حولت بالفعل اكتب «أنا دفعت» وابعت صورة التحويل.";
  if (/(مش شغال|مش شغاله|مش بيفتح|مش بيفتحش|عطل|مشكله|بيعلق|تحميل بطيء|مش ظاهر|مش ظاهره)/.test(n)) return "معلش على المشكلة ❤️ ابعت اسم القسم اللي فيه العطل وصورة للشاشة لو تقدر، واكتب «التواصل مع الإدارة» علشان نوصلك بالدعم.";
  if (/(الكود|كود الدخول|نسيت الكود|الكود مش شغال|الكود منتهي)/.test(n)) return "كود الدخول بيتبعتلك هنا بعد التجربة أو تفعيل الاشتراك. لو الكود مش شغال، اكتب «التواصل مع الإدارة» وابعت كودك علشان نراجع الحساب.";
  if (/(مدرس|المدرسين|المحاضرات|المحاضره|الفيديو|الفيديوهات|الملفات|pdf|الملخصات|الكويز|الامتحان)/.test(n)) return "المحتوى بيتقسم حسب الشعبة والقسم داخل منصة دروسك بلس. ابعت اسم المادة والمدرس والمحاضرة اللي بتدور عليها، ولو مش ظاهرة اكتب «التواصل مع الإدارة».";
  if (/(ميعاد|جدول|مواعيد|هينزل امتى|تنزل امتى)/.test(n)) return "لحد دلوقتي مفيش مواعيد مؤكدة أقدر أأكدها. تابع قناة التليجرام الرسمية علشان أي إعلان جديد.";
  if (/(تواصل|اكلم|كلم الادمن|الدعم|خدمه العملاء|التواصل مع الاداره)/.test(n)) return "أكيد ❤️ اكتب «التواصل مع الإدارة» وهطلب منك كود الاشتراك علشان نراجع حسابك ونوصل طلبك للمسؤول.";
  return null;
}

async function handlePaymentForm(message, text) {
  const key = trialKey(message);
  const store = readStore();
  const pending = store.paymentPending[key];
  if (!pending || Date.now() - pending.createdAt > 24 * 60 * 60 * 1000) {
    if (pending) { delete store.paymentPending[key]; writeStore(store); }
    return false;
  }
  const value = String(text || "").trim().slice(0, 150);
  if (pending.step === "time") {
    if (value.length < 2) {
      await sendBusinessText(message, "اكتب وقت التحويل بشكل تقريبي، مثال: النهارده الساعة 5 أو من ساعة.");
      return true;
    }
    pending.transferTime = value;
    pending.step = "phone";
    pending.createdAt = Date.now();
    store.paymentPending[key] = pending; writeStore(store);
    await sendBusinessText(message, "تمام ❤️ ابعت رقم التليفون اللي حولت منه الفلوس.");
    return true;
  }
  if (pending.step === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      await sendBusinessText(message, "رقم الهاتف مش واضح. ابعت رقم الهاتف اللي حولت منه الفلوس بشكل صحيح.");
      return true;
    }
    pending.senderPhone = value;
    pending.step = "name";
    pending.createdAt = Date.now();
    store.paymentPending[key] = pending; writeStore(store);
    await sendBusinessText(message, "👤 تمام، ابعت اسمك بالكامل.");
    return true;
  }
  if (pending.step === "name") {
    if (value.length < 2) {
      await sendBusinessText(message, "اكتب اسمك بالكامل بشكل صحيح.");
      return true;
    }
    pending.name = value.slice(0, 100);
    pending.step = "section";
    pending.createdAt = Date.now();
    store.paymentPending[key] = pending; writeStore(store);
    await sendBusinessText(message, "🎓 ابعت شعبتك، مثال: علمي علوم أو علمي رياضة أو أدبي أو أزهر.");
    return true;
  }
  if (pending.step === "section") {
    if (value.length < 2) {
      await sendBusinessText(message, "ابعت اسم الشعبة بشكل صحيح.");
      return true;
    }
    const duplicate = store.paymentRecords.find(r =>
      (pending.imageHash && r.imageHash === pending.imageHash) ||
      (pending.visibleReference && r.visibleReference && String(r.visibleReference).trim() === String(pending.visibleReference).trim())
    );
    const record = {
      id: crypto.randomUUID(),
      name: pending.name,
      section: value.slice(0, 80),
      senderPhone: pending.senderPhone,
      transferTime: pending.transferTime || "",
      telegramUserId: pending.telegramUserId,
      businessConnectionId: pending.businessConnectionId,
      chatId: pending.chatId,
      imageHash: pending.imageHash,
      visibleReference: pending.visibleReference || "",
      provider: pending.provider || "غير محدد",
      receiptConfidence: pending.receiptConfidence || 0,
      visualWarnings: pending.visualWarnings || "",
      duplicate: Boolean(duplicate),
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
    store.paymentRecords.push(record);
    if (store.paymentRecords.length > 2000) store.paymentRecords.splice(0, store.paymentRecords.length - 2000);
    delete store.paymentPending[key];
    writeStore(store);
    await notifyAdminPayment(record, pending.fileId, duplicate);
    await sendBusinessText(message, "✅ تمام، وصلتني صورة التحويل بكل تفاصيلها.\n\nتم إرسال بياناتك للإدارة للمراجعة والتأكد من وصول المبلغ.\n\n⏳ الرجاء عدم إرسال أي رسائل أخرى، وسيتم الرد عليك في أسرع وقت.\n\n💙 شكرًا لاشتراكك في دروسك بلس.");
    return true;
  }
  return false;
}
async function callPlatformPaymentApproval(record, duration) {
  if (!PLATFORM_API_URL || !BOT_TRIAL_SECRET) throw new Error("تكامل إصدار الاشتراك غير مضبوط");
  const response = await fetch(`${PLATFORM_API_URL}/api/bot/payment/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bot-trial-secret": BOT_TRIAL_SECRET },
    body: JSON.stringify({
      requestId: record.id,
      name: record.name,
      section: record.section,
      phone: record.senderPhone,
      telegramUserId: record.telegramUserId,
      duration,
      adminTelegramId: String(ADMIN_TELEGRAM_ID)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.code) throw new Error(data.error || `Platform API returned ${response.status}`);
  return data;
}
async function finishPaymentApproval(record, duration) {
  const result = await callPlatformPaymentApproval(record, duration);
  const store = readStore();
  const saved = findPaymentRecord(store, record.id);
  if (saved) {
    saved.status = "approved";
    saved.approvedAt = new Date().toISOString();
    saved.studentCode = result.code;
    saved.subscriptionExpiresAt = result.expiresAt || null;
    saved.subscriptionAction = result.action || "created";
    saved.durationLabel = result.durationLabel || duration.type || "مخصص";
  }
  delete store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)];
  writeStore(store);
  const studentMessage = {
    business_connection_id: record.businessConnectionId,
    chat: { id: Number(record.chatId) || record.chatId }
  };
  await sendBusinessText(studentMessage, `🎉 تم تأكيد استلام التحويل وتفعيل اشتراكك في دروسك بلس.\n\n👤 الاسم: ${record.name}\n📚 الشعبة: ${record.section}\n🔑 كود الدخول: ${result.code}\n📅 مدة الاشتراك: ${result.durationLabel || "حسب المدة المحددة"}\n🗓️ تاريخ الانتهاء: ${result.expiresAtText || "ظاهر داخل المنصة"}\n\n💙 احنا موجودين معاك دائمًا، لو محتاج أي حاجة ابعتلنا.`, {
    inline_keyboard: [
      [{ text: "📋 نسخ الكود", copy_text: { text: String(result.code) } }],
      [{ text: "🌐 عرض الحساب", url: "https://www.durosakplus.com/" }]
    ]
  });
  await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `✅ تم تفعيل الاشتراك بنجاح.\nالطالب: ${record.name}\nالكود: ${result.code}\nالعملية: ${result.action || "إصدار/تجديد"}\nالمدة: ${result.durationLabel || duration.type}\nتاريخ الانتهاء: ${result.expiresAtText || result.expiresAt || "—"}` });
}
async function handlePaymentAdminText(message, text) {
  if (String(message.from?.id) !== String(ADMIN_TELEGRAM_ID)) return false;
  const store = readStore();
  const flow = store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)];
  if (!flow && message.reply_to_message?.message_id) {
    const repliedRecord = store.paymentRecords.find(r => Number(r.adminMessageId) === Number(message.reply_to_message.message_id));
    const normalizedText = normalize(text);
    if (repliedRecord && repliedRecord.status === "pending_review" && (normalizedText === "تم الاستلام" || normalizedText.includes("تم الاستلام") && !normalizedText.includes("لم يتم الاستلام"))) {
      repliedRecord.status = "awaiting_duration";
      repliedRecord.reviewedAt = new Date().toISOString();
      store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)] = { recordId: repliedRecord.id, step: "duration", createdAt: Date.now() };
      writeStore(store);
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `✅ تم تأكيد استلام التحويل.
الطالب: ${repliedRecord.name}
الشعبة: ${repliedRecord.section}

حدد مدة الاشتراك:`, reply_markup: { inline_keyboard: [
        [{ text: "شهر", callback_data: `pay:duration:${repliedRecord.id}:month` }, { text: "سنة", callback_data: `pay:duration:${repliedRecord.id}:year` }],
        [{ text: "أيام مخصصة", callback_data: `pay:duration:${repliedRecord.id}:days` }, { text: "حتى تاريخ", callback_data: `pay:duration:${repliedRecord.id}:date` }]
      ]}});
      return true;
    }
    if (repliedRecord && repliedRecord.status === "pending_review" && (normalizedText.includes("لم يتم الاستلام") || normalizedText.includes("لم يصل"))) {
      repliedRecord.status = "payment_not_received";
      repliedRecord.reviewedAt = new Date().toISOString();
      writeStore(store);
      await sendBusinessText({ business_connection_id: repliedRecord.businessConnectionId, chat: { id: Number(repliedRecord.chatId) || repliedRecord.chatId } }, `❌ لم يتم تأكيد وصول التحويل حتى الآن.\n\nيرجى مراجعة بيانات التحويل والتواصل مع الإدارة إذا كنت ترى أن هناك خطأ.`);
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `تم تسجيل عدم الاستلام للطلب ${repliedRecord.id} (${repliedRecord.name}).` });
      return true;
    }
  }
  if (!flow) return false;
  const record = findPaymentRecord(store, flow.recordId);
  if (!record) {
    delete store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)]; writeStore(store);
    await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "الطلب غير موجود أو انتهت صلاحيته." });
    return true;
  }
  if (flow.step === "days") {
    const days = Number(String(text).trim());
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "اكتب عدد أيام صحيح من 1 إلى 3650." });
      return true;
    }
    try { await finishPaymentApproval(record, { type: "days", days }); }
    catch (e) { await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `تعذر تفعيل الاشتراك: ${e.message}` }); }
    return true;
  }
  if (flow.step === "date") {
    const raw = String(text).trim();
    const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!match) {
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "اكتب التاريخ بصيغة يوم/شهر/سنة، مثال: 1/4/2027" });
      return true;
    }
    const date = `${match[3]}-${String(match[2]).padStart(2,"0")}-${String(match[1]).padStart(2,"0")}`;
    const check = new Date(`${date}T23:59:59+02:00`);
    if (Number.isNaN(check.getTime()) || check.getDate() !== Number(match[1]) || check.getMonth() + 1 !== Number(match[2]) || check.getFullYear() !== Number(match[3]) || check.getTime() <= Date.now()) {
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "التاريخ غير صحيح أو انتهى. ابعت تاريخًا مستقبليًا بصيغة يوم/شهر/سنة." });
      return true;
    }
    try { await finishPaymentApproval(record, { type: "date", date }); }
    catch (e) { await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `تعذر تفعيل الاشتراك: ${e.message}` }); }
    return true;
  }
  return false;
}
async function handlePaymentCallback(query) {
  const adminId = String(query.from?.id || "");
  if (adminId !== String(ADMIN_TELEGRAM_ID)) {
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "هذا الزر مخصص للإدارة فقط.", show_alert: true });
    return;
  }
  const parts = String(query.data || "").split(":");
  const action = parts[1];
  const recordId = parts[2];
  const store = readStore();
  const record = findPaymentRecord(store, recordId);
  if (!record) {
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "الطلب غير موجود." });
    return;
  }
  if (action === "missing") {
    if (record.status !== "pending_review") {
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "تم التعامل مع الطلب بالفعل." });
      return;
    }
    record.status = "payment_not_received";
    record.reviewedAt = new Date().toISOString();
    writeStore(store);
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "تم تسجيل عدم الاستلام." });
    await sendBusinessText({ business_connection_id: record.businessConnectionId, chat: { id: Number(record.chatId) || record.chatId } }, "❌ لم يتم تأكيد وصول التحويل حتى الآن.\n\nيرجى مراجعة بيانات التحويل والتواصل مع الإدارة إذا كنت ترى أن هناك خطأ.");
    await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `تم تسجيل أن التحويل لم يصل للطلب ${record.id} (${record.name}).` });
    return;
  }
  if (action === "received") {
    if (record.status !== "pending_review") {
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "تم التعامل مع الطلب بالفعل." });
      return;
    }
    record.status = "awaiting_duration";
    record.reviewedAt = new Date().toISOString();
    store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)] = { recordId: record.id, step: "duration", createdAt: Date.now() };
    writeStore(store);
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "تم تأكيد الاستلام. حدد مدة الاشتراك." });
    await telegram("sendMessage", {
      chat_id: ADMIN_TELEGRAM_ID,
      text: `✅ تم تأكيد استلام التحويل.\nالطالب: ${record.name}\nالشعبة: ${record.section}\n\nحدد مدة الاشتراك:`,
      reply_markup: { inline_keyboard: [
        [{ text: "شهر", callback_data: `pay:duration:${record.id}:month` }, { text: "سنة", callback_data: `pay:duration:${record.id}:year` }],
        [{ text: "أيام مخصصة", callback_data: `pay:duration:${record.id}:days` }, { text: "حتى تاريخ", callback_data: `pay:duration:${record.id}:date` }]
      ]}
    });
    return;
  }
  if (action === "duration") {
    const mode = parts[3];
    const flow = store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)];
    if (record.status !== "awaiting_duration" || !flow || flow.recordId !== record.id) {
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "اختار مدة الاشتراك من طلب قيد المراجعة." });
      return;
    }
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "تم اختيار المدة." });
    if (mode === "month" || mode === "year") {
      try { await finishPaymentApproval(record, { type: mode }); }
      catch (e) { await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: `تعذر تفعيل الاشتراك: ${e.message}` }); }
    } else if (mode === "days") {
      flow.step = "days"; store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)] = flow; writeStore(store);
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "✏️ ابعت عدد الأيام المطلوبة (من 1 إلى 3650)." });
    } else if (mode === "date") {
      flow.step = "date"; store.paymentAdminFlows[String(ADMIN_TELEGRAM_ID)] = flow; writeStore(store);
      await telegram("sendMessage", { chat_id: ADMIN_TELEGRAM_ID, text: "📆 ابعت تاريخ انتهاء الاشتراك بصيغة يوم/شهر/سنة، مثال: 1/4/2027" });
    }
  }
}


async function handleOwnerBusinessReply(message, store) {
  const replyTo = message.reply_to_message;
  if (!replyTo || !message.text) return false;
  const contextEntry = Object.entries(store.photoContext || {}).find(([, ctx]) =>
    String(ctx.messageId) === String(replyTo.message_id) &&
    String(ctx.chatId) === String(message.chat.id)
  );
  if (!contextEntry) return false;
  const [key, ctx] = contextEntry;
  const text = normalize(message.text);
  const transferIntent = /(اشتركتك|اشتراكك|دي رساله التحويل|دي رسالة التحويل|رساله التحويل|رسالة التحويل|انا دفعت|أنا دفعت|دفعت|انا حولت|أنا حولت|حولت|تم التحويل|تحويل)/i.test(text);
  if (!transferIntent) return false;
  store.paymentPending[key] = {
    fileId: ctx.fileId,
    businessConnectionId: ctx.businessConnectionId,
    chatId: ctx.chatId,
    telegramUserId: ctx.telegramUserId,
    step: "time",
    createdAt: Date.now()
  };
  delete store.photoContext[key];
  writeStore(store);
  await telegram("sendMessage", {
    business_connection_id: ctx.businessConnectionId,
    chat_id: ctx.chatId,
    text: "تمام ❤️ التحويل كان إمتى؟ لو النهارده أو من ساعة أو من شوية، قولّي الوقت علشان أطلب منك رقم التليفون اللي حولت منه."
  });
  return true;
}

function isContactIntent(text) {
  return /(كلم|اكلم|أكلم|تواصل|اتواصل|أتواصل|الادمن|الأدمن|المسؤول|المسؤل|الدعم|خدمة العملاء|عاوز حد|عايز حد|محتاج حد)/i.test(normalize(text));
}
async function handleContactFlow(message, text) {
  const key = trialKey(message);
  const store = readStore();
  const pending = store.contactFlow[key];
  if (!pending && isContactIntent(text)) {
    store.contactFlow[key] = {
      businessConnectionId: message.business_connection_id,
      chatId: String(message.chat.id),
      telegramUserId: String(message.from?.id || message.chat.id),
      createdAt: Date.now()
    };
    writeStore(store);
    await sendBusinessText(message, "أكيد ❤️ ابعت كود الاشتراك بتاعك علشان الإدارة تعرف توصل لحسابك. لو مش معاك كود أو مش مشترك، اكتب «مش معايا».");
    return true;
  }
  if (!pending) return false;
  const value = String(text || "").trim().slice(0, 120);
  const noCode = /(مش معايا|مش معاي|مش مشترك|لسه مشترك|لسه مشتركتش|بدون كود|من غير كود)/i.test(normalize(value));
  const code = noCode ? "" : value;
  const adminText = `📩 طلب تواصل مع الإدارة\n🆔 Telegram ID: ${pending.telegramUserId}\n🔑 كود الطالب: ${code || "لا يوجد / غير مشترك"}\n💬 الرسالة: ${noCode ? "الطالب لا يملك كودًا أو غير مشترك" : "الطالب طلب التواصل مع الإدارة"}\n\nافتح حساب الطالب من الزر بالأسفل وتواصل معه يدويًا.`;
  await telegram("sendMessage", {
    chat_id: ADMIN_TELEGRAM_ID,
    text: adminText,
    reply_markup: { inline_keyboard: [[{ text: "👤 عرض حساب الطالب", url: `tg://user?id=${pending.telegramUserId}` }]] }
  });
  delete store.contactFlow[key];
  writeStore(store);
  await sendBusinessText(message, "تمام ❤️ بعت طلبك للإدارة، وهيتم التواصل معاك في أقرب وقت.");
  return true;
}
async function handleBusinessMessage(message) {
  if (!message || !message.business_connection_id || !message.chat) return;
  if (message.from && message.from.is_bot) return;
  const store = readStore();
  const ownerId = store.businessOwnerId;
  if (ownerId && message.from && String(message.from.id) === String(ownerId)) {
    await handleOwnerBusinessReply(message, store);
    return;
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    await handlePaymentPhoto(message);
    return;
  }
  if (!message.text) return;
  const text = message.text.trim();
  if (!text || text.startsWith("/")) return;
  if (await handlePaymentForm(message, text)) return;
  if (await handleTrialFlow(message, text)) return;
  if (await handleContactFlow(message, text)) return;
  if (await handlePaymentIntent(message, text)) return;
  // Exact greetings are answered once per chat window, not on every repeated hello.
  const normalizedGreeting = normalize(text);
  if (/^(اهلا|اهلا بيك|اهلا وسهلا|ازيك|عامل ايه|عامله ايه|السلام عليكم|سلام عليكم|صباح الخير|مساء الخير)$/.test(normalizedGreeting)) {
    store.greetingAt = store.greetingAt && typeof store.greetingAt === "object" ? store.greetingAt : {};
    const greetingKey = String(message.chat.id);
    const lastGreetingAt = Number(store.greetingAt[greetingKey] || 0);
    if (Date.now() - lastGreetingAt < 2 * 60 * 60 * 1000) return;
    store.greetingAt[greetingKey] = Date.now();
    writeStore(store);
  }
  const found = store.replies.filter(r => r.enabled !== false && r.keyword && normalize(text).includes(normalize(r.keyword)))
    .sort((a, b) => normalize(b.keyword).length - normalize(a.keyword).length)[0];
  const faqReply = builtInFaqReply(text);
  let reply = found ? found.reply : faqReply;
  if (!reply && store.defaultReply && store.defaultReply.trim()) reply = store.defaultReply.trim();
  if (!reply) reply = "ممكن توضحلي محتاج إيه بالضبط؟ ❤️ تقدر تسأل عن محاضرة، مشكلة في المنصة، الاشتراك أو أي استفسار.";
  // Prevent the same fallback/default welcome from flooding the student's chat.
  if (!found && !faqReply) {
    store.fallbackReplyAt = store.fallbackReplyAt && typeof store.fallbackReplyAt === "object" ? store.fallbackReplyAt : {};
    const fallbackKey = String(message.chat.id);
    const lastAt = Number(store.fallbackReplyAt[fallbackKey] || 0);
    if (Date.now() - lastAt < 10 * 60 * 1000) return;
    store.fallbackReplyAt[fallbackKey] = Date.now();
    const keys = Object.keys(store.fallbackReplyAt);
    if (keys.length > 2000) for (const oldKey of keys.slice(0, keys.length - 1500)) delete store.fallbackReplyAt[oldKey];
    writeStore(store);
  }
  if (!reply || !reply.trim()) return;
  await sendBusinessText(message, reply);
}
async function handleRegularMessage(message) {
  if (!message || !message.from || message.from.is_bot) return;
  if (String(message.from.id) !== String(ADMIN_TELEGRAM_ID) || !message.text) return;
  await handlePaymentAdminText(message, message.text.trim());
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
    if (update.message) await handleRegularMessage(update.message);
    if (update.callback_query) await handlePaymentCallback(update.callback_query);
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
  const imageReplies = Array.isArray(body.imageReplies) ? body.imageReplies.slice(0, 6).map(x => ({
    id: String(x.id || Date.now() + Math.random().toString(16).slice(2)),
    label: String(x.label || "صورة مرجعية").trim().slice(0, 100),
    reply: String(x.reply || "").trim().slice(0, 4000),
    imageData: String(x.imageData || "").slice(0, 500000),
    enabled: x.enabled !== false
  })).filter(x => x.imageData && x.reply) : [];
  const previous = readStore();
  writeStore({ ...previous, replies, builtInRepliesSeeded: true, defaultReply, photoReply, imageReplies,
    businessOwnerId: previous.businessOwnerId || "",
    paymentPending: previous.paymentPending || {},
    paymentRecords: previous.paymentRecords || [],
    paymentAdminFlows: previous.paymentAdminFlows || {},
    photoContext: previous.photoContext || {},
    contactFlow: previous.contactFlow || {}
  });
  res.json({ ok: true, count: replies.length });
});

app.listen(PORT, async () => {
  console.log(`Auto reply server listening on ${PORT}`);
  ensureStore();
  if (PUBLIC_DOMAIN) {
    try {
      await telegram("setWebhook", {
        url: `https://${PUBLIC_DOMAIN}/telegram/webhook/${WEBHOOK_SECRET}`,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["business_message", "business_connection", "message", "callback_query"]
      });
      console.log("Telegram webhook configured.");
    } catch (err) { console.error("Could not configure Telegram webhook:", err.message); }
  } else console.warn("RAILWAY_PUBLIC_DOMAIN is not set; configure a Railway public domain and redeploy.");
});
process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", err => console.error(err));
