const DEFAULT_TERMS = [
  'idiota', 'estupido', 'estupida', 'imbecil', 'pendejo', 'pendeja',
  'cabron', 'cabrona', 'puto', 'puta', 'mierda', 'culero', 'culera',
  'maldito', 'maldita', 'chinga', 'chingada', 'chingado', 'chingar',
  'verga', 'zorra',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const WORD = /[\p{L}\p{M}\p{N}@$]+/gu;

function tokenize(text) {
  return (text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').match(WORD) || [])
    .map((word) => word.replace(/[013457@$]/g, (char) => LEET[char]).replace(/(.)\1+/gu, '$1'));
}

function compileDictionary(terms) {
  const dictionary = new Map();
  for (const term of terms) {
    const words = tokenize(term);
    if (!words.length) continue;
    const phrases = dictionary.get(words[0]) || [];
    phrases.push(words.slice(1));
    dictionary.set(words[0], phrases);
  }
  return dictionary;
}

const defaults = compileDictionary(DEFAULT_TERMS);

function containsTerm(words, dictionary) {
  return words.some((word, index) => {
    const forms = [word, word.replace(/s$/u, ''), word.replace(/es$/u, '')];
    return forms.some((form) => (dictionary.get(form) || []).some((rest) =>
      rest.length === 0 ||
      (form === word && rest.every((part, offset) => words[index + offset + 1] === part))
    ));
  });
}

function assertReviewCommentAllowed(comment) {
  if (typeof comment !== 'string') {
    const error = new Error('El comentario debe ser texto');
    error.status = 400;
    throw error;
  }

  const words = tokenize(comment);
  const extraTerms = (process.env.REVIEW_PROHIBITED_TERMS || '').split(',');
  if (containsTerm(words, defaults) || containsTerm(words, compileDictionary(extraTerms))) {
    const error = new Error('Tu reseña contiene lenguaje no permitido. Edita el comentario e inténtalo de nuevo.');
    error.status = 422;
    error.code = 'REVIEW_PROHIBITED_LANGUAGE';
    throw error;
  }
}

module.exports = { assertReviewCommentAllowed };
