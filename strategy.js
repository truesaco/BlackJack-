// Shared blackjack logic used by the game (app.js) and the stats page (stats.js).
(() => {
  "use strict";

  // Card value as the game counts it: face cards are 10, aces 11 (or 1, see handTotal).
  function cardValue(card) {
    const v = typeof card === "string" ? card : card.value;
    if (v === "ACE" || v === "A") return 11;
    if (["KING", "QUEEN", "JACK", "K", "Q", "J", "0", "10"].includes(v)) return 10;
    return parseInt(v, 10);
  }

  function handTotal(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      total += cardValue(c);
      if ((c.value || c) === "ACE") aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  }

  // Hi-Lo card counting: 2–6 = +1, 7–9 = 0, 10–A = −1.
  function hiLo(card) {
    const v = cardValue(card);
    if (v <= 6) return 1;
    if (v >= 10) return -1;
    return 0;
  }

  // Basic strategy for this table: multi-deck, dealer stands on soft 17,
  // and the only options are hit (H), stand (S) and double (D) — no split or surrender.
  // `up` is the dealer's upcard value (2–11, where 11 is an ace).
  function basicStrategy(total, soft, up, canDouble) {
    const dbl = (alt) => (canDouble ? "D" : alt);
    if (soft) {
      if (total >= 19) return "S";
      if (total === 18) {
        if (up >= 3 && up <= 6) return dbl("S");
        if (up <= 8) return "S";
        return "H";
      }
      if (total === 17) return up >= 3 && up <= 6 ? dbl("H") : "H";
      if (total >= 15) return up >= 4 && up <= 6 ? dbl("H") : "H";
      if (total >= 13) return up >= 5 && up <= 6 ? dbl("H") : "H";
      return "H"; // soft 12 (A,A) without splitting
    }
    if (total >= 17) return "S";
    if (total >= 13) return up <= 6 ? "S" : "H";
    if (total === 12) return up >= 4 && up <= 6 ? "S" : "H";
    if (total === 11) return up <= 10 ? dbl("H") : "H";
    if (total === 10) return up <= 9 ? dbl("H") : "H";
    if (total === 9) return up >= 3 && up <= 6 ? dbl("H") : "H";
    return "H";
  }

  const ACTION_NAMES = { H: "Hit", S: "Stand", D: "Double" };

  // Short card code for storage, e.g. "AS", "10H", "KD".
  function cardCode(card) {
    const rank = card.value === "10" ? "10" : card.value[0];
    return rank + card.suit[0];
  }

  window.BJStrategy = { cardValue, handTotal, hiLo, basicStrategy, cardCode, ACTION_NAMES };
})();
