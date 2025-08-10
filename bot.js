require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROUP_ID = parseInt(process.env.GROUP_ID);
const TMDB_KEY = process.env.TMDB_API_KEY;
axios.defaults.baseURL = 'https://api.themoviedb.org/3';

/* --- funciones aux --- */
async function getMovie(query) {
  const { data } = await axios.get(`/search/movie`, {
    params: { api_key: TMDB_KEY, query, language: 'es' }
  });
  return data.results[0] || null;
}

async function getShow(query) {
  const { data } = await axios.get(`/search/tv`, {
    params: { api_key: TMDB_KEY, query, language: 'es' }
  });
  return data.results[0] || null;
}

function buildCaption(item) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const genres = (item.genre_ids || [])
    .map(id => genreMap[id])
    .filter(Boolean)
    .join(' | ');
  return `${item.overview}\n\nGéneros: ${genres}\nAño: ${year}`;
}

/* --- mapa de géneros (solo los más comunes) --- */
const genreMap = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía',
  36: 'Historia', 27: 'Terror', 10402: 'Música', 9648: 'Misterio',
  10749: 'Romance', 878: 'Ciencia ficción', 10770: 'Película de TV',
  53: 'Suspenso', 10752: 'Bélica', 37: 'Western'
};

/* --- escucha mensajes --- */
bot.on('message', async (msg) => {
  if (msg.chat.id !== GROUP_ID || !msg.text) return;

  const text = msg.text.toLowerCase();
  const match = msg.text.match(/"(.+?)"/); // busca título entre comillas
  if (!match) return;

  const query = match[1];
  let item = await getMovie(query);
  if (!item) item = await getShow(query);
  if (!item) return;

  const poster = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  const caption = buildCaption(item);

  bot.sendPhoto(msg.chat.id, poster, { caption, parse_mode: 'Markdown' });
});

console.log('🎬 Bot listo y silencioso');
