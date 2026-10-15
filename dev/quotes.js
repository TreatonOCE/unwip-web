// Unwip - short quotes from writers, to keep going. Public-domain writers only (see below).
window.UnwipQuotes = (function () {
  // Only writers whose words are out of copyright everywhere Unwip is sold: they died long enough ago (before 1956)
  // and the line comes from a book, play, letter or interview published before 1931. Translations are left out (the
  // translator's wording can be someone else's), and so are lines usually pinned on the wrong person.
  const Q = [
    ['Begin at the beginning, and go on till you come to the end: then stop.', 'Lewis Carroll'],
    ['Why, sometimes I’ve believed as many as six impossible things before breakfast.', 'Lewis Carroll'],
    ['It’s no use going back to yesterday, because I was a different person then.', 'Lewis Carroll'],
    ['I am no bird; and no net ensnares me.', 'Charlotte Brontë'],
    ['I dwell in Possibility.', 'Emily Dickinson'],
    ['A word is dead when it is said, some say. I say it just begins to live that day.', 'Emily Dickinson'],
    ['A good novel tells us the truth about its hero; but a bad novel tells us the truth about its author.', 'G. K. Chesterton'],
    ['If a thing is worth doing, it is worth doing badly.', 'G. K. Chesterton'],
    ['Write while the heat is in you.', 'Henry David Thoreau'],
    ['Not that the story need be long, but it will take a long while to make it short.', 'Henry David Thoreau'],
    ['How vain it is to sit down to write when you have not stood up to live.', 'Henry David Thoreau'],
    ['To produce a mighty book, you must choose a mighty theme.', 'Herman Melville'],
    ['You can’t wait for inspiration. You have to go after it with a club.', 'Jack London'],
    ['Let other pens dwell on guilt and misery.', 'Jane Austen'],
    ['The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.', 'Jane Austen'],
    ['I’m not afraid of storms, for I’m learning how to sail my ship.', 'Louisa May Alcott'],
    ['The difference between the almost right word and the right word is really a large matter — ’tis the difference between the lightning-bug and the lightning.', 'Mark Twain'],
    ['Get your facts first, and then you can distort them as you please.', 'Mark Twain'],
    ['Experience was merely the name men gave to their mistakes.', 'Oscar Wilde'],
    ['To define is to limit.', 'Oscar Wilde'],
    ['There is no such thing as a moral or an immoral book. Books are well written, or badly written. That is all.', 'Oscar Wilde'],
    ['I was working on the proof of one of my poems all the morning, and took out a comma. In the afternoon I put it back again.', 'Oscar Wilde'],
    ['There is then creative reading as well as creative writing.', 'Ralph Waldo Emerson'],
    ['The difficulty of literature is not to write, but to write what you mean.', 'Robert Louis Stevenson'],
    ['What is written without effort is in general read without pleasure.', 'Samuel Johnson'],
    ['The greatest part of a writer’s time is spent in reading, in order to write; a man will turn over half a library to make one book.', 'Samuel Johnson'],
    ['No man but a blockhead ever wrote, except for money.', 'Samuel Johnson'],
    ['The only end of writing is to enable the readers better to enjoy life, or better to endure it.', 'Samuel Johnson'],
    ['Most of the basic material a writer works with is acquired before the age of fifteen.', 'Willa Cather'],
    ['There are only two or three human stories, and they go on repeating themselves as fiercely as if they had never happened before.', 'Willa Cather'],
    ['Brevity is the soul of wit.', 'William Shakespeare'],
    ['Omit needless words.', 'William Strunk Jr.'],
    ['Vigorous writing is concise.', 'William Strunk Jr.'],
    ['Fill your paper with the breathings of your heart.', 'William Wordsworth'],
    ['Either write something worth reading or do something worth writing.', 'Benjamin Franklin'],
    ['The pen is mightier than the sword.', 'Edward Bulwer-Lytton'],
    ['True ease in writing comes from art, not chance, as those move easiest who have learned to dance.', 'Alexander Pope'],
    ['There are books of which the backs and covers are by far the best parts.', 'Charles Dickens'],
    ['“Fool,” said my Muse to me, “look in thy heart, and write.”', 'Sir Philip Sidney']
  ];
  // A shuffled deck: every quote comes up once before any repeats, and the deck is remembered between sessions.
  const KEY = 'unwip-quote-deck';
  function next(not) {
    let st; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { st = null; }
    if (!st || !Array.isArray(st.deck) || st.n !== Q.length) st = { deck: [], last: -1, n: Q.length };
    if (!st.deck.length) {
      st.deck = Q.map((_, i) => i);
      for (let i = st.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]]; }
      if (st.deck[st.deck.length - 1] === st.last) st.deck.unshift(st.deck.pop());   // never the same one twice in a row
    }
    let i = st.deck.pop();
    if (not && Q[i] === not && st.deck.length) { const j = st.deck.pop(); st.deck.unshift(i); i = j; }
    st.last = i;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
    return Q[i];
  }
  const today = () => next();
  const random = not => next(not);
  return { all: Q, today, random };
})();
