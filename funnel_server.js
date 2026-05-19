const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || '';
const WHAPI_URL = 'https://gate.whapi.cloud';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '972504513838@s.whatsapp.net';
const CONFIG_FILE = './config.json';

// ── הגדרות דיפולט ──
const DEFAULT_CONFIG = {
  menuItems: [
    { key: '1', label: 'כניסה למשחקים', response: 'קישורי כניסה:\n\n🎰 קזינו: {casino}\n♠️ פוקר: {poker}\n📱 אפליקציה: {app}', type: 'links' },
    { key: '2', label: 'סימוני ספורט', response: '⚽ לסימוני הספורט היומיים הצטרף לקהילה:\nwa.me/972504513838\n\nהסוכן אסי 👑', type: 'text' },
    { key: '3', label: 'הפקדה מהירה', response: '', type: 'deposit' },
    { key: '4', label: 'נציג אנושי', response: '📞 כתוב במה נוכל לעזור?\n(הפקדה גדולה / בעיה טכנית / אחר)', type: 'admin' },
  ],
  messages: {
    welcome: '✨ ברוך הבא למועדון ה-VIP של אסי ✨\n\nכאן תקבל שירות מהיר 24/7.\n\nבחר אפשרות:\n\n1️⃣ כניסה למשחקים\n2️⃣ סימוני ספורט\n3️⃣ הפקדה מהירה\n4️⃣ נציג אנושי',
    screenshot: '✅ קיבלנו את האישור!\n\nנציג יבדוק ויאשר את ההפקדה תוך דקות. תודה! 🙏',
    adminDeposit: '🔔 התראת הפקדה!\n\nלקוח: {phone}\nשלח צילום מסך אישור הפקדה.\nנא לאשר! 💰',
    adminSupport: '🔔 לקוח {phone} מחכה לנציג אנושי!',
  },
  deposit: { bit: '', bank: '', crypto: '' },
  links: { casino: '', poker: '', app: '' }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch(e) {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// מצב שיחות
const userStates = new Map();

// ── שלח הודעה ──
async function sendMessage(to, text) {
  try {
    await axios.post(`${WHAPI_URL}/messages/text`, { to, body: text }, {
      headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}`, 'Content-Type': 'application/json' }
    });
  } catch(err) {
    console.error('❌ שגיאה:', err.response?.data || err.message);
  }
}

// ── בנה הודעת הפקדה ──
function buildDepositMessage(config) {
  const d = config.deposit || {};
  return `💰 פרטי הפקדה:\n\n📱 ביט: ${d.bit || 'לא הוגדר'}\n🏦 העברה בנקאית:\n${d.bank || 'לא הוגדר'}\n💎 קריפטו: ${d.crypto || 'לא הוגדר'}\n\nלאחר ההעברה שלח צילום מסך ונציג יאשר תוך דקות! ✅`;
}

// ── בנה הודעת קישורים ──
function buildLinksMessage(template, config) {
  const l = config.links || {};
  return template
    .replace('{casino}', l.casino || 'לא הוגדר')
    .replace('{poker}', l.poker || 'לא הוגדר')
    .replace('{app}', l.app || 'לא הוגדר');
}

// ── עיבוד הודעה ──
async function handleMessage(msg) {
  const config = loadConfig();
  const from = msg.from;
  const body = (msg.text?.body || msg.body || '').trim();
  const type = msg.type;

  if (from?.includes('@g.us') || msg.from_me) return;

  console.log(`📨 מ-${from}: "${body}" (${type})`);

  const state = userStates.get(from) || 'start';

  // תמונה = צילום מסך הפקדה
  if (type === 'image') {
    const screenshotMsg = config.messages?.screenshot || DEFAULT_CONFIG.messages.screenshot;
    await sendMessage(from, screenshotMsg);
    const adminMsg = (config.messages?.adminDeposit || DEFAULT_CONFIG.messages.adminDeposit)
      .replace('{phone}', from.replace('@s.whatsapp.net', ''));
    await sendMessage(ADMIN_PHONE, adminMsg);
    userStates.set(from, 'start');
    return;
  }

  // מילות פתיחה → תפריט
  const greetWords = ['היי', 'הי', 'שלום', 'בוקר', 'ערב', 'סוכן', 'hello', 'hi', 'start', 'התחל', 'menu', 'תפריט'];
  const isGreeting = greetWords.some(g => body.toLowerCase().includes(g));

  if (state === 'start' || isGreeting) {
    await sendMessage(from, config.messages?.welcome || DEFAULT_CONFIG.messages.welcome);
    userStates.set(from, 'menu');
    return;
  }

  // חיפוש אפשרות בתפריט
  const menuItems = config.menuItems || DEFAULT_CONFIG.menuItems;
  const selectedItem = menuItems.find(item => item.key === body);

  if (selectedItem) {
    if (selectedItem.type === 'deposit') {
      await sendMessage(from, buildDepositMessage(config));
      userStates.set(from, 'waiting_deposit');
    } else if (selectedItem.type === 'links') {
      await sendMessage(from, buildLinksMessage(selectedItem.response, config));
      userStates.set(from, 'start');
    } else if (selectedItem.type === 'admin') {
      await sendMessage(from, selectedItem.response || DEFAULT_CONFIG.messages.welcome);
      const adminMsg = (config.messages?.adminSupport || DEFAULT_CONFIG.messages.adminSupport)
        .replace('{phone}', from.replace('@s.whatsapp.net', ''));
      await sendMessage(ADMIN_PHONE, adminMsg);
      userStates.set(from, 'support');
    } else {
      await sendMessage(from, selectedItem.response || '');
      userStates.set(from, 'start');
    }
    return;
  }

  // ממתין להפקדה
  if (state === 'waiting_deposit') {
    await sendMessage(from, '📸 שלח צילום מסך של אישור ההעברה כדי שנוכל לאשר 🙏');
    return;
  }

  // לא מזוהה → תפריט
  await sendMessage(from, config.messages?.welcome || DEFAULT_CONFIG.messages.welcome);
  userStates.set(from, 'menu');
}

// ══════════════════════════════════════
// ROUTES
// ══════════════════════════════════════

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const messages = req.body.messages || [];
    for (const msg of messages) await handleMessage(msg);
  } catch(err) { console.error('❌ Webhook error:', err.message); }
});

app.get('/', (req, res) => {
  try { res.sendFile(__dirname + '/dashboard.html'); }
  catch(e) { res.status(404).send('Dashboard not found'); }
});

app.get('/api/config', (req, res) => res.json(loadConfig()));

app.post('/api/config', (req, res) => {
  try { saveConfig(req.body); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/status', async (req, res) => {
  try {
    const r = await axios.get(`${WHAPI_URL}/health`, {
      headers: { 'Authorization': `Bearer ${WHAPI_TOKEN}` }
    });
    res.json({ ready: true, status: r.data });
  } catch { res.json({ ready: false }); }
});

app.post('/api/send', async (req, res) => {
  const { to, message } = req.body;
  try {
    await sendMessage(to + '@s.whatsapp.net', message);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Funnel Bot פועל על פורט ${PORT}`);
});
