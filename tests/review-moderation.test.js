const { assertReviewCommentAllowed } = require('../src/modules/reviews/review-moderation');

afterEach(() => jest.restoreAllMocks());

test.each(['PENDEJOS', 'cabro\u0301n', 'p3ndejooo', 'qué poca, culera'])(
  'rechaza lenguaje prohibido sin repetir el comentario (%s)', (comment) => {
    expect(() => assertReviewCommentAllowed(comment)).toThrow(expect.objectContaining({
      status: 422, code: 'REVIEW_PROHIBITED_LANGUAGE',
    }));
  }
);

test.each(['Fue puntual y respetuoso', 'Hablamos de la computadora', ''])(
  'acepta comentarios sin coincidencias completas (%s)', (comment) => {
    expect(() => assertReviewCommentAllowed(comment)).not.toThrow();
  }
);

test('permite agregar términos y frases al diccionario mediante configuración', () => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    REVIEW_PROHIBITED_TERMS: '  grosero, mala onda, , ',
  });
  expect(() => assertReviewCommentAllowed('Qué GROSERO')).toThrow();
  expect(() => assertReviewCommentAllowed('Muy mala, onda hoy')).toThrow();
  expect(() => assertReviewCommentAllowed('Esa onda no fue mala')).not.toThrow();
  expect(() => assertReviewCommentAllowed('idiota')).toThrow();
});

test('rechaza un comentario que no sea texto', () => {
  expect(() => assertReviewCommentAllowed(null)).toThrow(expect.objectContaining({ status: 400 }));
});
