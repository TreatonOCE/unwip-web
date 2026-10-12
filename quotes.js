// Unwip - short quotes from writers, to keep going. Kept to well-sourced lines.
window.UnwipQuotes = (function () {
  const Q = [
    ['The first draft is just you telling yourself the story.', 'Terry Pratchett'],
    ['You can always edit a bad page. You can’t edit a blank page.', 'Jodi Picoult'],
    ['If there’s a book that you want to read, but it hasn’t been written yet, then you must write it.', 'Toni Morrison'],
    ['First, forget inspiration. Habit is more dependable.', 'Octavia E. Butler'],
    ['You don’t start out writing good stuff. You start out writing crap and thinking it’s good stuff, and then gradually you get better at it.', 'Octavia E. Butler'],
    ['Amateurs sit and wait for inspiration, the rest of us just get up and go to work.', 'Stephen King'],
    ['The scariest moment is always just before you start.', 'Stephen King'],
    ['If you want to be a writer, you must do two things above all others: read a lot and write a lot.', 'Stephen King'],
    ['The road to hell is paved with adverbs.', 'Stephen King'],
    ['This is how you do it: you sit down at the keyboard and you put one word after another until it’s done.', 'Neil Gaiman'],
    ['Tomorrow may be hell, but today was a good writing day, and on the good writing days nothing else matters.', 'Neil Gaiman'],
    ['There is no greater agony than bearing an untold story inside you.', 'Maya Angelou'],
    ['You can’t use up creativity. The more you use, the more you have.', 'Maya Angelou'],
    ['Start writing, no matter what. The water does not flow until the faucet is turned on.', 'Louis L’Amour'],
    ['A professional writer is an amateur who didn’t quit.', 'Richard Bach'],
    ['I love deadlines. I love the whooshing noise they make as they go by.', 'Douglas Adams'],
    ['Writing is like driving at night in the fog. You can only see as far as your headlights, but you can make the whole trip that way.', 'E. L. Doctorow'],
    ['Just write every day of your life. Read intensely. Then see what happens.', 'Ray Bradbury'],
    ['You fail only if you stop writing.', 'Ray Bradbury'],
    ['We write to taste life twice, in the moment and in retrospect.', 'Anaïs Nin'],
    ['Write what should not be forgotten.', 'Isabel Allende'],
    ['Fill your paper with the breathings of your heart.', 'William Wordsworth'],
    ['Either write something worth reading or do something worth writing.', 'Benjamin Franklin'],
    ['One day I will find the right words, and they will be simple.', 'Jack Kerouac'],
    ['Don’t get it right, just get it written.', 'James Thurber'],
    ['Ideas are like rabbits. You get a couple and learn how to handle them, and pretty soon you have a dozen.', 'John Steinbeck'],
    ['A word after a word after a word is power.', 'Margaret Atwood'],
    ['Write. Rewrite. When not writing or rewriting, read. I know of no shortcuts.', 'Larry L. King'],
    ['If you don’t have time to read, you don’t have the time (or the tools) to write. Simple as that.', 'Stephen King'],
    ['Talent is cheaper than table salt. What separates the talented individual from the successful one is a lot of hard work.', 'Stephen King'],
    ['Fiction is the truth inside the lie.', 'Stephen King'],
    ['Description begins in the writer’s imagination, but should finish in the reader’s.', 'Stephen King'],
    ['You have to write the book that wants to be written.', 'Madeleine L’Engle'],
    ['You must stay drunk on writing so reality cannot destroy you.', 'Ray Bradbury'],
    ['A writer is someone for whom writing is more difficult than it is for other people.', 'Thomas Mann'],
    ['I can shake off everything as I write; my sorrows disappear, my courage is reborn.', 'Anne Frank'],
    ['The worst enemy to creativity is self-doubt.', 'Sylvia Plath'],
    ['Everything in life is writable about if you have the outgoing guts to do it, and the imagination to improvise.', 'Sylvia Plath'],
    ['Write while the heat is in you.', 'Henry David Thoreau'],
    ['Almost all good writing begins with terrible first efforts. You need to start somewhere.', 'Anne Lamott'],
    ['Perfectionism is the voice of the oppressor.', 'Anne Lamott'],
    ['Just take it bird by bird.', 'Anne Lamott'],
    ['Read, read, read. Read everything — trash, classics, good and bad, and see how they do it.', 'William Faulkner'],
    ['I’m not a very good writer, but I’m an excellent rewriter.', 'James A. Michener'],
    ['We are all apprentices in a craft where no one ever becomes a master.', 'Ernest Hemingway'],
    ['Write hard and clear about what hurts.', 'Ernest Hemingway'],
    ['Don’t bend; don’t water it down; don’t try to make it logical; don’t edit your own soul according to the fashion.', 'Anne Rice'],
    ['No tears in the writer, no tears in the reader.', 'Robert Frost'],
    ['A sheltered life can be a daring life as well. For all serious daring starts from within.', 'Eudora Welty'],
    ['Imagination is the beginning of creation.', 'George Bernard Shaw'],
    ['Stories are light. Light is precious in a world so dark.', 'Kate DiCamillo'],
    ['Fantasy is hardly an escape from reality. It’s a way of understanding it.', 'Lloyd Alexander'],
    ['Fairy tales are more than true: not because they tell us that dragons exist, but because they tell us that dragons can be beaten.', 'Neil Gaiman'],
    ['The pen is the tongue of the mind.', 'Miguel de Cervantes'],
    ['When you’re done, you have to step back and look at the forest.', 'Stephen King']
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
