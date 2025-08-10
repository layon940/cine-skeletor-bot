require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROUP_ID = parseInt(process.env.GROUP_ID);
const TMDB_KEY = process.env.TMDB_API_KEY;

/* ---------- Funciones de Skeletor ---------- */
const skeletorPhrases = {
  greet: "¡Ja, ja, ja! ¿Otra vez buscando películas, insignificante mortal?",
  recommend: "Por tus pobres gustos, te sugiero:",
  notFound: "¡Nada encontrado! ¡Ni el mismísimo Skeletor puede ayudarte con eso!",
};

/* ---------- Detectar frases clave ---------- */
function detectIntent(text) {
  const lower = text.toLowerCase();
  if (/¿alguien ha visto|recomienda|busco|quiero ver/i.test(lower)) return 'recommend';
  if (/estreno|cuándo se estrena|cuando sale/i.test(lower)) return 'release';
  if (/director|actriz|actor|protagonista/i.test(lower)) return 'cast';
  if (/donde ver|plataforma|netflix|prime|disney/i.test(lower)) return 'where';
  return null;
}

/* ---------- Llamadas a TMDb ---------- */
async function searchMovie(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
  const res = await axios.get(url);
  return res.data.results[0] || null;
}

/* ---------- Respuestas ---------- */
bot.on('message', async (msg) => {
  if (msg.chat.id !== GROUP_ID) return; // Solo grupo permitido
  if (!msg.text) return;

  const intent = detectIntent(msg.text);
  if (!intent) return;

  switch (intent) {
    case 'recommend': {
      const match = msg.text.match(/(?:película|pelicula|serie|algo de)\s+(.+)/i);
      const query = match ? match[1] : 'popular';
      const movie = await searchMovie(query);
      if (!movie) {
        return bot.sendMessage(GROUP_ID, skeletorPhrases.notFound);
      }
      bot.sendMessage(GROUP_ID,
        `${skeletorPhrases.recommend} *${movie.title}* (${movie.release_date?.slice(0, 4)})\n${movie.overview?.slice(0, 200)}...`,
        { parse_mode: 'Markdown' }
      );
      break;
    }
    case 'release': {
      bot.sendMessage(GROUP_ID, "¡Por el poder de Grayskull! Aún no implementé estrenos, pero llegará...");
      break;
    }
    default: break;
  }
});

console.log('🎬 Skeletor está vigilando el grupo...');
