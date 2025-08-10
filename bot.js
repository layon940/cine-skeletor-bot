require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROUP_ID  = Number(process.env.GROUP_ID);
const TMDB_KEY  = process.env.TMDB_API_KEY;
const KIMI_KEY  = process.env.KIMI_API_KEY;
const USERNAME  = process.env.BOT_USERNAME;   // SkeltorVideotecaBot

axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* ---------- LLAMADA A KIMI ---------- */
async function askKimi(prompt) {
  try {
    const { data } = await axios.post(
      'https://api.moonshot.cn/v1/chat/completions',
      {
        model: 'moonshot-v1-8k',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      },
      { headers: { Authorization: `Bearer ${KIMI_KEY}` } }
    );
    return data.choices?.[0]?.message?.content?.trim() || '¡Ni la mismísima Skeletor tiene palabras!';
  } catch {
    return 'Los dioses del streaming han fallado. Inténtalo más tarde, insignificante mortal.';
  }
}

/* ---------- BUSCAR EN TMDb ---------- */
async function searchTMDb(query, type = 'movie') {
  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const { data } = await axios.get(endpoint, {
    params: { api_key: TMDB_KEY, query, language: 'es' }
  });
  return data.results?.[0] || null;
}

/* ---------- CONSTRUIR PROMPT ---------- */
function buildPrompt(item) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = item.genre_ids?.map(id => genreMap[id]).filter(Boolean).join(' | ') || '';
  return `Eres Skeletor, crítico de cine arrogante y teatral. Resume y comenta con tono mordaz la siguiente obra sin inventar nada:\n\nTítulo: ${item.title || item.name}\nAño: ${year}\nGéneros: ${genres}\nSinopsis oficial: ${item.overview}`;
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

  // ¿Nos mencionaron?
  const mentionRegex = new RegExp(`@${USERNAME}`, 'i');
  if (!mentionRegex.test(msg.text)) return;

  // Extraer título: todo lo que venga después de la mención
  const query = msg.text.replace(`@${USERNAME}`, '').trim();
  if (!query) return bot.sendMessage(GROUP_ID, '¿Hablas en lenguaje de cobayas? ¡Especifica la obra, mortal!');

  const item = await searchTMDb(query) || await searchTMDb(query, 'tv');
  if (!item) {
    return bot.sendMessage(GROUP_ID, '¡Ni rastro de esa bazofia en el multiverso del cine! Vuelve cuando tengas buenos gustos.');
  }

  const prompt = buildPrompt(item);
  const skeletorText = await askKimi(prompt);

  const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  bot.sendPhoto(GROUP_ID, poster, { caption: skeletorText, parse_mode: 'Markdown' });
});

console.log('🎭 Skeletor vigila el grupo…');
