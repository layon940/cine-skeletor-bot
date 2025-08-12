require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const OWNER_ID = Number(process.env.OWNER_ID);
const GEMINI_KEY = process.env.GEMINI_API_KEY;

axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* ---------- UTILS ---------- */
async function typing(chatId) {
  await bot.sendChatAction(chatId, 'typing');
  await new Promise(r => setTimeout(r, 1500));
}

async function askGemini(prompt) {
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Sin respuesta.';
  } catch {
    return 'No pude contactar con Gemini.';
  }
}

async function searchTMDb(rawQuery, type = 'movie') {
  const q = rawQuery
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return null;

  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const { data } = await axios.get(endpoint, {
    params: { api_key: process.env.TMDB_API_KEY, query: q, language: 'es' }
  });
  return data.results?.[0] || null;
}

const genreMap = {
  28:'Acción',12:'Aventura',16:'Animación',35:'Comedia',80:'Crimen',
  99:'Documental',18:'Drama',10751:'Familia',14:'Fantasía',36:'Historia',
  27:'Terror',10402:'Música',9648:'Misterio',10749:'Romance',
  878:'Ciencia ficción',53:'Suspenso',10752:'Bélica',37:'Western'
};

/* ---------- ESCUCHAR ---------- */
bot.on('message', async (msg) => {
  if (msg.from.id !== OWNER_ID) return;

  let query = msg.text?.trim() || '';
  if (query === '/ping') return bot.sendMessage(msg.chat.id, 'Pong!');

  /* ---- COMANDO /skeltor ---- */
  let useSkeltor = false;
  if (query.startsWith('/skeltor')) {
    useSkeltor = true;
    query = query.replace(/^\/skeltor\s*/i, '').trim();
  }
  if (!query) return bot.sendMessage(msg.chat.id, '¿Qué necesitas saber?');

  /* ---- RECOMENDACIÓN ---- */
  if (/recomienda|recomiendame/i.test(query)) {
    await typing(msg.chat.id);
    try {
      const { data } = await axios.get('/trending/movie/week', {
        params: { api_key: process.env.TMDB_API_KEY, language: 'es' }
      });
      let list;
      if (/terror|miedo/i.test(query)) {
        list = data.results.filter(m => m.genre_ids?.includes(27));
      } else {
        list = data.results.slice(0, 5);
      }
      const titles = list.map(t => t.title || t.name).join(', ');
      return bot.sendMessage(msg.chat.id, titles || 'No hay tendencias.');
    } catch {
      return bot.sendMessage(msg.chat.id, 'No pude obtener recomendaciones.');
    }
  }

  /* ---- BÚSQUEDA CONCRETA ---- */
  await typing(msg.chat.id);
  let item = await searchTMDb(query) || await searchTMDb(query, 'tv');
  if (!item) {
    const fallbackPrompt = useSkeltor
      ? 'Actúa como Skeletor brevemente: no encontré esa obra en TMDb.'
      : 'No encontré información sobre esa obra.';
    const text = await askGemini(fallbackPrompt);
    return bot.sendMessage(msg.chat.id, text);
  }

  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = item.genre_ids?.map(id => genreMap[id]).filter(Boolean).join(' | ') || '';

  const prompt = useSkeltor
    ? `Actúa como Skeletor, breve y sin narración interna (≤1500 chars). Sin inventar:\n\nTítulo: ${item.title || item.name}\nAño: ${year}\nGéneros: ${genres}\nSinopsis: ${item.overview}`
    : `Responde con información veraz y concisa:\n\nTítulo: ${item.title || item.name}\nAño: ${year}\nGéneros: ${genres}\nSinopsis: ${item.overview}`;

  const text = (await askGemini(prompt)).slice(0, 1500);
  const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

  await bot.sendPhoto(msg.chat.id, poster);
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

console.log('🤖 Bot personal activo.');
