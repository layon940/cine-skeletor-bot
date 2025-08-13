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
const escapeMD = str => str.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

/* ---------- GEMINI ---------- */
async function askGemini(prompt) {
  try {
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '—';
  } catch {
    return '—';
  }
}

/* ---------- FUZZY SEARCH ---------- */
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function searchTMDb(query) {
  const q = normalize(query).replace(/[^\w\s]/g, ' ').trim();
  if (!q) return [];
  const [m, t] = await Promise.all([
    axios.get('/search/movie', { params: { api_key: TMDB_KEY, query: q, language: 'es' } }),
    axios.get('/search/tv',    { params: { api_key: TMDB_KEY, query: q, language: 'es' } })
  ]);
  return [...m.data.results, ...t.data.results].slice(0, 10);
}

/* ---------- MAPAS ---------- */
const genreMap = {
  28:'#Acción',12:'#Aventura',16:'#Animación',35:'#Comedia',80:'#Crimen',99:'#Documental',18:'#Drama',
  10751:'#Familia',14:'#Fantasía',36:'#Historia',27:'#Horror',10402:'#Musical',9648:'#Misterio',
  10749:'#Romance',878:'#Ciencia_ficción',53:'#Suspenso',10752:'#Guerra',37:'#Oeste'
};
const countryNames = {
  US:'United_States',GB:'United_Kingdom',ES:'Spain',FR:'France',DE:'Germany',IT:'Italy',
  JP:'Japan',KR:'South_Korea',MX:'Mexico',BR:'Brazil',CA:'Canada',AU:'Australia',
  RU:'Russia',IN:'India',CN:'China',AR:'Argentina',NL:'Netherlands',SE:'Sweden',
  DK:'Denmark',NO:'Norway',FI:'Finland',PT:'Portugal',CH:'Switzerland'
};
const flag = iso => ({
  US:'🇺🇸',GB:'🇬🇧',ES:'🇪🇸',FR:'🇫🇷',DE:'🇩🇪',IT:'🇮🇹',JP:'🇯🇵',KR:'🇰🇷',MX:'🇲🇽',BR:'🇧🇷',
  CA:'🇨🇦',AU:'🇦🇺',RU:'🇷🇺',IN:'🇮🇳',CN:'🇨🇳',AR:'🇦🇷',NL:'🇳🇱',SE:'🇸🇪',DK:'🇩🇰',NO:'🇳🇴',
  FI:'🇫🇮',PT:'🇵🇹',CH:'🇨🇭'}[iso] || '🏳️');

/* ---------- FICHA CON DATOS O VACÍOS ---------- */
function buildFicha(item, type) {
  const titleOrig = item.original_title || item.original_name || item.title || item.name;
  const titleES   = item.title || item.name;
  const year = type === 'movie'
    ? (item.release_date || '').slice(0, 4)
    : `${(item.first_air_date || '').slice(0, 4)} - ${(item.last_air_date || '').slice(0, 4) || ''}`;
  const country = item.origin_country?.[0] || item.production_countries?.[0]?.iso_3166_1 || '—';
  const countryName = countryNames[country] || country;
  const duration = type === 'movie'
    ? `${item.runtime || '—'}m`
    : `${item.episode_run_time?.[0] || '—'}m`;
  const seasons = item.number_of_seasons || '—';
  const episodes = item.number_of_episodes || '—';
  const rating = item.release_dates?.results?.find(r => r.iso_3166_1 === country)?.release_dates?.[0]?.certification ||
                 item.content_ratings?.results?.[0]?.rating || '—';
  const genresArr = item.genres || [];
  const genres = genresArr.map(g => `#${g.name.replace(/ /g, '_')}`).join(' ') || '—';
  const sinopsis = (item.overview || '').slice(0, 750).replace(/\s+/g, ' ').trim() || '—';

  return `🏷Título: *${escapeMD(titleOrig)}* | *${escapeMD(titleES)}*\n📅Año: *${escapeMD(year)}*\n` +
         `🗺País: ${flag(country)}#${countryName}\n⏰Duración: *${duration}*\n` +
         (type === 'tv' ? `⏳Temporadas: *${seasons}*\n🎞Episodios: *${episodes}*\n` : '') +
         `©Clasificación: *${escapeMD(rating)}*\n📝Género: ${genres}\n📃Sinopsis: ${escapeMD(sinopsis)}`;
}

/* ---------- ROUTER ---------- */
bot.on('message', async msg => {
  if (msg.from.id !== OWNER_ID || !msg.text) return;

  const text = msg.text.trim();
  const chatId = msg.chat.id;

  if (text === '/ping') return bot.sendMessage(chatId, 'Pong!');

  if (text.startsWith('/movie')) {
    const term = text.replace(/^\/movie\s*/i, '').trim();
    if (!term) return bot.sendMessage(chatId, 'Ejemplo: `/movie interestellar`');

    const results = await searchTMDb(term);
    if (!results.length) return bot.sendMessage(chatId, 'Sin resultados.');

    let list = 'Resultados:\n';
    const buttons = results.map((item, idx) => {
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const typeEmoji = item.media_type === 'tv' || item.first_air_date ? '📺' : '🎬';
      const typeText  = item.media_type === 'tv' || item.first_air_date ? 'Serie' : 'Película';
      list += `${idx + 1}. ${typeEmoji} ${item.title || item.name} [${year}] - ${typeText}\n`;
      return {
        text: `${idx + 1}`,
        callback_data: `detail_${item.id}_${item.media_type || (item.first_air_date ? 'tv' : 'movie')}`
      };
    });

    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 5) keyboard.push(buttons.slice(i, i + 5));

    return bot.sendMessage(chatId, list, { reply_markup: { inline_keyboard: keyboard } });
  }

  if (text.startsWith('/skeltor')) {
    const prompt = text.replace(/^\/skeltor\s*/i, '').trim();
    if (!prompt) return bot.sendMessage(chatId, '¿Qué deseas saber, mortal?');
    await bot.sendChatAction(chatId, 'typing');
    const resp = await askGemini(`Actúa como Skeletor breve y sin narración interna:\n\n${prompt}`);
    return bot.sendMessage(chatId, resp.slice(0, 1500), { parse_mode: 'Markdown' });
  }

  await bot.sendChatAction(chatId, 'typing');
  const resp = await askGemini(`Responde como asistente virtual:\n\n${text}`);
  return bot.sendMessage(chatId, resp.slice(0, 1500), { parse_mode: 'Markdown' });
});

/* ---------- CALLBACK BOTONES ---------- */
bot.on('callback_query', async query => {
  if (query.from.id !== OWNER_ID) return;
  const [prefix, id, type] = query.data.split('_');
  if (prefix !== 'detail') return;

  await bot.answerCallbackQuery(query.id);
  await bot.sendChatAction(query.message.chat.id, 'typing');

  try {
    const { data } = await axios.get(`/${type}/${id}`, {
      params: { api_key: TMDB_KEY, language: 'es', append_to_response: 'release_dates,content_ratings' }
    });

    const ficha = buildFicha(data, type);
    const poster = `https://image.tmdb.org/t/p/w500${data.poster_path}`;

    await bot.sendPhoto(query.message.chat.id, poster);
    await bot.sendMessage(query.message.chat.id, ficha, { parse_mode: 'Markdown' });
  } catch (e) {
    await bot.sendMessage(query.message.chat.id, 'No pude generar la ficha.');
  }
});

console.log('🤖 Bot final y pulido');
/* ---------- NEWS ---------- */
const got = require('got');               // npm install got
const cheerio = require('cheerio');       // npm install cheerio
const schedule = require('node-schedule'); // npm install node-schedule

const CHANNEL_ID = process.env.CHANNEL_ID;

// Extraer noticias de una URL
async function scrapeIMDbNews(url, type) {
  const html = await got(url).text();
  const $ = cheerio.load(html);
  const items = [];

  $('.ipc-list-card').slice(0, 5).each((_, el) => {
    const title = $(el).find('.ipc-list-card__title').text().trim();
    const summary = $(el).find('.ipc-list-card__content').text().trim();
    const img = $(el).find('img').attr('src');
    const link = $(el).find('a').attr('href');
    if (title && summary) {
      items.push({
        title,
        summary: summary.slice(0, 700).replace(/\s+/g, ' '),
        img: img || 'https://via.placeholder.com/640x360.png?text=No+Image',
        link: link ? `https://www.imdb.com${link}` : '',
        type
      });
    }
  });
  return items;
}

/* Genera hashtag inteligente */
function generateHashtags(text, type) {
  const tags = new Set();
  const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
  words.forEach(w => {
    if (!['the', 'and', 'for', 'with', 'from', 'that', 'this'].includes(w)) {
      tags.add(`#${w}`);
    }
  });
  tags.add(type === 'tv' ? '#Series' : '#Película');
  return [...tags].slice(0, 10).join(' ');
}

/* Crear y programar publicaciones */
async function publishNews() {
  const [tvNews, movieNews] = await Promise.all([
    scrapeIMDbNews('https://www.imdb.com/news/tv/', 'tv'),
    scrapeIMDbNews('https://www.imdb.com/news/movie/', 'movie')
  ]);

  const combined = [];
  for (let i = 0; i < 5; i++) {
    combined.push(tvNews[i], movieNews[i]);
  }

  for (let i = 0; i < combined.length; i++) {
    const { title, summary, img, type } = combined[i];
    const hashtags = generateHashtags(title + ' ' + summary, type);
    const caption = `${summary}\n—\n${hashtags}`;

    schedule.scheduleJob(Date.now() + i * 60 * 60 * 1000, async () => {
      try {
        await bot.sendPhoto(CHANNEL_ID, img, { caption, parse_mode: 'Markdown' });
      } catch (e) {
        await bot.sendMessage(CHANNEL_ID, `Error al publicar: ${e.message}`);
      }
    });
  }
}

/* Comando /news */
bot.on('message', async (msg) => {
  if (msg.from.id !== OWNER_ID) return;
  if (msg.text.trim() === '/news') {
    await bot.sendMessage(msg.chat.id, '🔍 Recopilando noticias…');
    await publishNews();
    await bot.sendMessage(msg.chat.id, '✅ 10 publicaciones programadas (1 por hora).');
  }
});
