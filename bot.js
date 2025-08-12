require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const OWNER_ID = Number(process.env.OWNER_ID);
const TMDB_KEY = process.env.TMDB_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* ---------- UTILS ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function askGemini(prompt) {
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch {
    return 'Error al contactar con Gemini.';
  }
}

/* ---------- MAPAS ---------- */
const genreMap = {
  28: '#Acción', 12: '#Aventura', 16: '#Animación', 35: '#Comedia', 80: '#Crimen',
  99: '#Documental', 18: '#Drama', 10751: '#Familia', 14: '#Fantasía', 36: '#Historia',
  27: '#Horror', 10402: '#Musical', 9648: '#Misterio', 10749: '#Romance',
  878: '#Ciencia_ficción', 53: '#Suspenso', 10752: '#Guerra', 37: '#Oeste',
  10770: '', 10759: '', 10762: '', 10763: '', 10764: '', 10765: '', 10766: '', 10767: '', 10768: ''
};

const countryFlag = {
  US: '🇺🇸', GB: '🇬🇧', ES: '🇪🇸', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', JP: '🇯🇵', KR: '🇰🇷', MX: '🇲🇽', BR: '🇧🇷',
  CA: '🇨🇦', AU: '🇦🇺', RU: '🇷🇺', IN: '🇮🇳', CN: '🇨🇳', AR: '🇦🇷', NL: '🇳🇱', SE: '🇸🇪', DK: '🇩🇰'
};

/* ---------- COMANDOS ---------- */
bot.on('message', async msg => {
  if (msg.from.id !== OWNER_ID || !msg.text) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;

  /* /ping */
  if (text === '/ping') return bot.sendMessage(chatId, 'Pong!');

  /* /skeltor <texto> */
  if (text.startsWith('/skeltor')) {
    const prompt = text.replace(/^\/skeltor\s*/i, '').trim();
    if (!prompt) return bot.sendMessage(chatId, '¿Qué deseas saber, mortal?');
    await bot.sendChatAction(chatId, 'typing');
    const resp = await askGemini(`Actúa como Skeletor breve y sin narración interna:\n\n${prompt}`);
    return bot.sendMessage(chatId, resp.slice(0, 1500), { parse_mode: 'Markdown' });
  }

  /* /movie <término> */
  if (text.startsWith('/movie')) {
    const term = text.replace(/^\/movie\s*/i, '').trim();
    if (!term) return bot.sendMessage(chatId, 'Ejemplo: /movie interestellar');

    await bot.sendChatAction(chatId, 'typing');
    const [movies, series] = await Promise.all([
      axios.get('/search/movie', { params: { api_key: TMDB_KEY, query: term, language: 'es' } }),
      axios.get('/search/tv',    { params: { api_key: TMDB_KEY, query: term, language: 'es' } })
    ]);

    const all = [...movies.data.results, ...series.data.results].slice(0, 10);
    if (!all.length) return bot.sendMessage(chatId, 'Sin resultados.');

    const buttons = all.map((item, idx) => ({
      text: `${idx + 1}. ${item.title || item.name}`,
      callback_data: `detail_${item.id}_${item.media_type || 'movie'}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 5) {
      inlineKeyboard.push(buttons.slice(i, i + 5));
    }

    return bot.sendMessage(chatId, 'Resultados:', { reply_markup: { inline_keyboard: inlineKeyboard } });
  }

  /* texto libre → asistente normal */
  await bot.sendChatAction(chatId, 'typing');
  const resp = await askGemini(`Responde como asistente virtual, sin inventar:\n\n${text}`);
  return bot.sendMessage(chatId, resp.slice(0, 1500), { parse_mode: 'Markdown' });
});

/* ---------- CALLBACK BOTONES ---------- */
bot.on('callback_query', async query => {
  if (query.from.id !== OWNER_ID) return;
  const [_, id, type] = query.data.split('_');

  await bot.answerCallbackQuery(query.id);
  await bot.sendChatAction(query.message.chat.id, 'typing');

  const { data } = await axios.get(`/${type}/${id}`, {
    params: { api_key: process.env.TMDB_KEY, language: 'es', append_to_response: 'release_dates,content_ratings' }
  });
  const item = data;

  const title = item.title || item.name;
  const titleES = item.title || item.name; // TMDb ya trae español si existe
  const year = type === 'movie'
    ? (item.release_date || '').slice(0, 4)
    : `${(item.first_air_date || '').slice(0, 4)} - ${(item.last_air_date || '').slice(0, 4) || ''}`;
  const country = item.origin_country?.[0] || item.production_countries?.[0]?.iso_3166_1 || 'US';
  const flag = countryFlag[country] || '🏳️';
  const duration = type === 'movie'
    ? `${item.runtime || 0}m`
    : `${item.episode_run_time?.[0] || 0}m`;
  const seasons = item.number_of_seasons || 1;
  const episodes = item.number_of_episodes || 1;
  const rating = item.release_dates?.results
    ?.find(r => r.iso_3166_1 === country)
    ?.release_dates?.[0]?.certification ||
    item.content_ratings?.results?.[0]?.rating ||
    'Sin clasificación';
  const genres = item.genres?.map(g => `#${g.name.replace(/ /g, '_')}`).join(' ') || '';
  const sinopsis = item.overview?.slice(0, 750) || 'Sin sinopsis.';

  const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  const ficha = `🏷Título: *${title}* | *${titleES}*\n` +
                `📅Año: *${year}*\n` +
                `🗺País: ${flag}#${country}\n` +
                `⏰Duración: *${duration}*\n` +
                (type === 'tv' ? `⏳Temporadas: *${seasons}*\n🎞Episodios: *${episodes}*\n` : '') +
                `©Clasificación: *${rating}*\n` +
                `📝Género: ${genres}\n\n` +
                `📃Sinopsis: ${sinopsis}`;

  await bot.sendPhoto(query.message.chat.id, poster);
  await bot.sendMessage(query.message.chat.id, ficha, { parse_mode: 'Markdown' });
});

console.log('🤖 Bot listo: comandos /ping /movie /skeltor');
