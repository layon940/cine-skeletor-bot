require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROUP_ID = Number(process.env.GROUP_ID);
const TMDB_KEY = process.env.TMDB_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const USERNAME = process.env.BOT_USERNAME;

axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* ---------- GEMINI ---------- */
async function askGemini(prompt) {
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '¡Ni siquiera Gemini entiende tu gusto!';
  } catch {
    return 'Los servidores de Google se han rendido ante Skeletor… inténtalo luego.';
  }
}

/* ---------- BUSCAR EN TMDb ---------- */
async function searchTMDb(rawQuery, type = 'movie') {
  const q = rawQuery
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return null;

  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const { data } = await axios.get(endpoint, {
    params: { api_key: TMDB_KEY, query: q, language: 'es' }
  });
  return data.results?.[0] || null;
}

/* ---------- PROMPT SKELETOR ---------- */
function buildPrompt(item) {
  if (!item) {
    return 'Actúa como Skeletor: no encontré esa obra en TMDb. Invita al usuario a verificar el título o probar otra.';
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

  let query = msg.text.replace(`@${USERNAME}`, '').trim();
  if (!query) {
    return bot.sendMessage(GROUP_ID, '¿Hablas en lengua de cobayas? ¡Especifica la obra, mortal!');
  }

  /* ---- RECOMENDACIÓN SIN TÍTULO ---- */
  if (/recomienda|recomiendame/i.test(query)) {
    try {
      const { data } = await axios.get('/trending/movie/week', {
        params: { api_key: TMDB_KEY, language: 'es' }
      });
      let list;
      if (/terror|miedo/i.test(query)) {
        list = data.results.filter(m => m.genre_ids?.includes(27));
      } else {
        list = data.results.slice(0, 5);
      }
      if (list.length) {
        const titles = list.map(t => t.title || t.name).join(', ');
        return bot.sendMessage(
          GROUP_ID,
          `¡Escucha, gusano! Los mortales disfrutan aún: *${titles}*. ¡Escoge o perece!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        return bot.sendMessage(GROUP_ID, '¡Ni el mismísimo Skeletor encuentra novedades hoy!');
      }
    } catch {
      return bot.sendMessage(GROUP_ID, 'Los dioses del streaming han fallado.');
    }
  }

  /* ---- BÚSQUEDA CONCRETA ---- */
  const item = await searchTMDb(query) || await searchTMDb(query, 'tv');
  if (!item) {
    return bot.sendMessage(GROUP_ID, '¡Ni rastro de esa bazofia en el multiverso del cine!');
  }

  const prompt = buildPrompt(item);
  const skeletorText = await askGemini(prompt);

    const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  const skeletorText = await askGemini(prompt);

  /* 1) Imagen sola */
  await bot.sendPhoto(GROUP_ID, poster);

  /* 2) Texto como respuesta al mensaje original */
  await bot.sendMessage(GROUP_ID, skeletorText, {
    parse_mode: 'Markdown',
    reply_to_message_id: msg.message_id
  });

console.log('🎭 Skeletor con Gemini listo.');
