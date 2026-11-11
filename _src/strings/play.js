// Text for _src/pages/play.html, one block per language. Keys used as {{key}} in the
// template are plain text (HTML-escaped on build); keys used as {{{key}}} are raw HTML.
// resultVictory, resultDefeat, loading, pause and the feedback* words are the app's own strings
// (SkeepMain table: RESULT_VICTORY, RESULT_DEFEAT, LOADING, PAUSE, FEEDBACK_PERFECT, FEEDBACK_GOOD_1..3,
// FEEDBACK_ALERT_1..3, FEEDBACK_MISS), so the lite feed says the same. Get them with
// node _src/tools/loc.js SkeepMain "<keyRegex>".
module.exports = {
  en: {
    pageTitle: "skeep · Play",
    menuOpen: "Open menu",
    loading: "Loading...",
    howToLabel: "How to play",
    close: "Close",
    pause: "Pause",
    resultVictory: "Victory",
    resultDefeat: "Defeat",
    feedbackPerfect: "Perfect!",
    feedbackGood1: "Nice!",
    feedbackGood2: "Great!",
    feedbackGood3: "Well done!",
    feedbackAlert1: "Close one!",
    feedbackAlert2: "Careful!",
    feedbackAlert3: "Keep going!",
    feedbackMiss: "So close!",
    noscript: "skeep needs JavaScript to play.",
    gateLabel: "Enter the password to play",
    gateWrong: "Wrong password",
    gateEnter: "Play"
  },
  ca: {
    pageTitle: "skeep · Juga",
    menuOpen: "Obre el menú",
    loading: "Carregant...",
    howToLabel: "Com es juga",
    close: "Tanca",
    pause: "Pausa",
    resultVictory: "Victòria",
    resultDefeat: "Derrota",
    feedbackPerfect: "Perfecte!",
    feedbackGood1: "Bo!",
    feedbackGood2: "Genial!",
    feedbackGood3: "Molt bé!",
    feedbackAlert1: "Ui, just!",
    feedbackAlert2: "Compte!",
    feedbackAlert3: "Aguanta!",
    feedbackMiss: "Quasi!",
    noscript: "Per jugar a skeep cal JavaScript.",
    gateLabel: "Introdueix la contrasenya per jugar",
    gateWrong: "Contrasenya incorrecta",
    gateEnter: "Juga"
  },
  es: {
    pageTitle: "skeep · Juega",
    menuOpen: "Abrir menú",
    loading: "Cargando...",
    howToLabel: "Cómo se juega",
    close: "Cerrar",
    pause: "Pausa",
    resultVictory: "Victoria",
    resultDefeat: "Derrota",
    feedbackPerfect: "¡Perfecto!",
    feedbackGood1: "¡Bien!",
    feedbackGood2: "¡Genial!",
    feedbackGood3: "¡Muy bien!",
    feedbackAlert1: "¡Uf, justo!",
    feedbackAlert2: "¡Cuidado!",
    feedbackAlert3: "¡Aguanta!",
    feedbackMiss: "¡Casi!",
    noscript: "Para jugar a skeep necesitas JavaScript.",
    gateLabel: "Introduce la contraseña para jugar",
    gateWrong: "Contraseña incorrecta",
    gateEnter: "Jugar"
  }
};
