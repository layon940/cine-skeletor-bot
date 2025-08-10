require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROUP_ID = Number(process.env.GROUP_ID);
const TMDB_KEY = process.env.TMDB_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const USERNAME = process.env.BOT_USERNAME;

axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* ---------- LLAMADA A GEMINI ---------- */
async function askGemini(prompt) {
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '¡Ni siquiera Gemini entiende tu gusto!';
  } catch {
    return 'Los servidores de Google se han rendido ante Skeletor… inténtalo luego.';
  }
}

/* ---------- 🎁 Extra – respuesta cuando piden recomendación sin título ---------- */

if (/recomienda|recomiendame/i.test(query) && !q) {
  const popular = await axios.get('/trending/movie/week', {
    params: { api_key: TMDB_KEY, language: 'es' }
  });
  const terror = popular.data.results
    .filter(m => m.genre_ids?.includes(27)) // 27 = Terror
    .slice(0, 3);
  if (terror.length) {
    const titles = terror.map(t => t.title).join(', ');
    return bot.sendMessage(
      GROUP_ID,
      `¡Escucha, gusano! Los mortales temen aún: ${titles}. ¡Escoge o perece!`
    );
  }
}
/* ---------- BUSCAR EN TMDb (limpia y flexible) ---------- */
async function searchTMDb(rawQuery, type = 'movie') {
  // quita año entre paréntesis o después de espacio
  let q = rawQuery.replace(/\b(19|20)\d{2}\b/g, '').trim();
  // quita signos de puntuación extra
  q = q.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;

  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const { data } = await axios.get(endpoint, {
    params: { api_key: TMDB_KEY, query: q, language: 'es' }
  });
  return data.results?.[0] || null;
}

/* ---------- CONSTRUIR PROMPT ---------- */
function buildPrompt(item) {
  if (!item) {
    return 'Actúa como Skeletor y responde con sarcasmo: no encontré ninguna película/serie con ese nombre en TMDb. Invita al usuario a escribir mejor o probar otra.';
  }
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = item.genre_ids?.map(id => genreMap[id]).filter(Boolean).join(' | ') || '';
  return `Actúa como Skeletor, crítico de cine sarcástico y teatral, sin inventar nada:\n\nTítulo: ${item.title || item.name}\nAño: ${year}\nGéneros: ${genres}\nSinopsis oficial: ${item.overview}`;
}

/* ---------- MAPA DE GÉNEROS ---------- */
const genreMap = {
  28:'Acción',12:'Aventura',16:'Animación',35:'Comedia',80:'Crimen',
  99:'Documental',18:'Drama',10751:'Familia',14:'Fantasía',36:'Historia',
  27:'Terror',10402:'Música',9648:'Misterio',10749:'Romance',
  878:'Ciencia ficción',53:'Suspenso',10752:'Bélica',37:'Western'
};

/* ---------- ESCUCHAR MENSAJES ---------- */
bot.on('message', async (msg) => {
  if (msg.chat.id !== GROUP_ID || !msg.text) return;

  const mentionRegex = new RegExp(`@${USERNAME}`, 'i');
  if (!mentionRegex.test(msg.text)) return;

  const query = msg.text.replace(`@${USERNAME}`, '').trim();
  if (!query) {
    return bot.sendMessage(GROUP_ID, '¿Hablas en lengua de cobayas? ¡Especifica la obra, mortal!');
  }

  const item = await searchTMDb(query) || await searchTMDb(query, 'tv');
  if (!item) {
    return bot.sendMessage(GROUP_ID, '¡Ni rastro de esa bazofia en el multiverso del cine!');
  }

  const prompt = buildPrompt(item);
  const skeletorText = await askGemini(prompt);

  const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  bot.sendPhoto(GROUP_ID, poster, { caption: skeletorText, parse_mode: 'Markdown' });
});

console.log('🎭 Skeletor con Gemini está en el grupo.');
