// Blackjack powered by the Deck of Cards API (https://deckofcardsapi.com/)
(() => {
  "use strict";

  const API = "https://deckofcardsapi.com/api/deck";
  const CARD_BACK = "https://deckofcardsapi.com/static/img/back.png";
  const DECK_COUNT = 6;
  const RESHUFFLE_AT = 60; // reshuffle the shoe when fewer cards than this remain
  const START_BANKROLL = 1000;
  let storageKey = "blackjack-bankroll"; // becomes per-user once signed in
  const MIN_BET = 5;

  const $ = (id) => document.getElementById(id);
  const el = {
    bankroll: $("bankroll"),
    bet: $("bet"),
    remaining: $("remaining"),
    dealerCards: $("dealer-cards"),
    playerCards: $("player-cards"),
    dealerScore: $("dealer-score"),
    playerScore: $("player-score"),
    message: $("message"),
    betting: $("betting"),
    actions: $("actions"),
    next: $("next"),
    deal: $("deal"),
    clearBet: $("clear-bet"),
    hit: $("hit"),
    stand: $("stand"),
    double: $("double"),
    newRound: $("new-round"),
    reset: $("reset"),
    chips: document.querySelectorAll("[data-chip]"),
    strategy: $("strategy"),
  };

  const STRATEGY_KEY = "blackjack-strategy";
  const CUSTOM_STRATEGIES_KEY = "blackjack-custom-strategies";

  const state = {
    deckId: null,
    remaining: 0,
    bankroll: loadBankroll(),
    bet: 0,
    player: [],
    dealer: [],
    holeHidden: true,
    busy: false,
    baseBet: 0, // the bet before any double down, reused for the next hand
    // Tracking for the stats page
    sessionId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    handInSession: 0,
    runningCount: 0, // Hi-Lo count of every card seen since the last shuffle
    uncounted: [], // cards dealt in the current hand, counted when it ends
    hand: null, // record of the hand in progress
  };

  // ---------- Storage ----------
  function loadBankroll() {
    try {
      const v = parseInt(localStorage.getItem(storageKey), 10);
      return Number.isFinite(v) && v >= MIN_BET ? v : START_BANKROLL;
    } catch {
      return START_BANKROLL;
    }
  }
  function saveBankroll() {
    try { localStorage.setItem(storageKey, String(state.bankroll)); } catch { /* ignore */ }
  }

  // ---------- API ----------
  async function api(path) {
    const res = await fetch(`${API}/${path}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "API request failed");
    state.remaining = data.remaining;
    if (data.deck_id) state.deckId = data.deck_id;
    return data;
  }

  function resetCount() {
    state.runningCount = 0;
    state.uncounted = [];
  }
  const newShoe = () => api(`new/shuffle/?deck_count=${DECK_COUNT}`).then((d) => { resetCount(); return d; });
  const reshuffle = () => api(`${state.deckId}/shuffle/`).then((d) => { resetCount(); return d; });
  async function draw(count) {
    const data = await api(`${state.deckId}/draw/?count=${count}`);
    state.uncounted.push(...data.cards);
    return data.cards;
  }

  async function ensureShoe() {
    if (!state.deckId) {
      await newShoe();
    } else if (state.remaining < RESHUFFLE_AT) {
      setMessage("Shuffling the shoe…");
      await reshuffle();
    }
  }

  // ---------- Scoring ----------
  const { cardValue, handTotal, hiLo, basicStrategy, cardCode } = window.BJStrategy;

  const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21;

  // ---------- Rendering ----------
  const money = (n) => `$${n.toLocaleString()}`;

  function cardImg(card, hidden) {
    const img = document.createElement("img");
    img.className = "card";
    if (hidden) {
      img.src = CARD_BACK;
      img.alt = "Face-down card";
    } else {
      img.src = card.image;
      img.alt = `${card.value.toLowerCase()} of ${card.suit.toLowerCase()}`;
    }
    return img;
  }

  function renderHands() {
    el.playerCards.replaceChildren(...state.player.map((c) => cardImg(c, false)));
    el.dealerCards.replaceChildren(
      ...state.dealer.map((c, i) => cardImg(c, i === 1 && state.holeHidden))
    );

    el.playerScore.textContent = state.player.length ? scoreLabel(state.player) : "";
    if (!state.dealer.length) {
      el.dealerScore.textContent = "";
    } else if (state.holeHidden) {
      el.dealerScore.textContent = String(cardValue(state.dealer[0]));
    } else {
      el.dealerScore.textContent = scoreLabel(state.dealer);
    }
  }

  function scoreLabel(cards) {
    const { total, soft } = handTotal(cards);
    return soft && total < 21 ? `${total - 10}/${total}` : String(total);
  }

  function renderStats() {
    el.bankroll.textContent = money(state.bankroll);
    el.bet.textContent = money(state.bet);
    el.remaining.textContent = state.deckId ? state.remaining : "–";
  }

  function renderChips() {
    el.chips.forEach((chip) => {
      chip.disabled = state.busy || Number(chip.dataset.chip) > state.bankroll - state.bet;
    });
    el.deal.disabled = state.busy || state.bet === 0;
    el.clearBet.disabled = state.busy || state.bet === 0;
  }

  function setMessage(text, kind = "") {
    el.message.textContent = text;
    el.message.className = `message ${kind}`.trim();
  }

  function showPhase(phase) {
    el.betting.classList.toggle("hidden", phase !== "betting");
    el.actions.classList.toggle("hidden", phase !== "playing");
    el.next.classList.toggle("hidden", phase !== "done");
  }

  function setActionsEnabled(on) {
    el.hit.disabled = !on;
    el.stand.disabled = !on;
    el.double.disabled = !on || state.player.length !== 2 || state.bankroll < state.bet;
  }

  // ---------- Game flow ----------
  function addChip(amount) {
    if (state.bet + amount > state.bankroll) return;
    state.bet += amount;
    renderStats();
    renderChips();
  }

  function clearBet() {
    state.bet = 0;
    renderStats();
    renderChips();
  }

  async function deal() {
    if (state.bet === 0 || state.busy) return;
    state.busy = true;
    renderChips();
    try {
      const bankrollBefore = state.bankroll;
      state.baseBet = state.bet;
      state.bankroll -= state.bet; // bet goes on the table
      renderStats();
      await ensureShoe();
      state.holeHidden = true;
      const shoeRemaining = state.remaining;
      const decksLeft = Math.max(shoeRemaining / 52, 0.5);
      state.hand = {
        startedAt: Date.now(),
        bankrollBefore,
        strategy: currentStrategy(),
        runningCount: state.runningCount,
        trueCount: Math.round((state.runningCount / decksLeft) * 10) / 10,
        shoeRemaining,
        decisions: [],
      };
      const cards = await draw(4);
      state.player = [cards[0], cards[2]];
      state.dealer = [cards[1], cards[3]];
      renderHands();
      renderStats();
      showPhase("playing");
      setMessage("Hit or stand?");

      const playerBJ = isBlackjack(state.player);
      const dealerBJ = isBlackjack(state.dealer);
      if (playerBJ || dealerBJ) {
        state.holeHidden = false;
        renderHands();
        if (playerBJ && dealerBJ) settle("push", "Both have blackjack — push.");
        else if (playerBJ) settle("blackjack", "Blackjack! You win 3:2.");
        else settle("lose", "Dealer has blackjack.");
        return;
      }
      setActionsEnabled(true);
    } catch (err) {
      handleError(err);
    } finally {
      state.busy = false;
    }
  }

  // Save what the player chose next to what basic strategy recommends.
  function recordDecision(action) {
    if (!state.hand) return;
    const { total, soft } = handTotal(state.player);
    const up = cardValue(state.dealer[0]);
    const canDouble = state.player.length === 2 && state.bankroll >= state.bet;
    const recommended = basicStrategy(total, soft, up, canDouble);
    state.hand.decisions.push({
      step: state.hand.decisions.length + 1,
      cards: state.player.map(cardCode),
      total,
      soft,
      dealer_up: up,
      can_double: canDouble,
      action,
      basic_strategy: recommended,
      matches_basic: action === recommended,
    });
  }

  async function hit() {
    if (state.busy) return;
    recordDecision("H");
    state.busy = true;
    setActionsEnabled(false);
    try {
      await ensureShoeMidHand();
      const [card] = await draw(1);
      state.player.push(card);
      renderHands();
      renderStats();
      const { total } = handTotal(state.player);
      if (total > 21) {
        state.holeHidden = false;
        renderHands();
        settle("lose", `Bust with ${total}. Dealer wins.`);
      } else if (total === 21) {
        state.busy = false;
        await stand();
        return;
      } else {
        setActionsEnabled(true);
      }
    } catch (err) {
      handleError(err);
    } finally {
      state.busy = false;
    }
  }

  async function doubleDown() {
    if (state.busy || state.player.length !== 2 || state.bankroll < state.bet) return;
    recordDecision("D");
    state.busy = true;
    setActionsEnabled(false);
    try {
      state.bankroll -= state.bet;
      state.bet *= 2;
      renderStats();
      await ensureShoeMidHand();
      const [card] = await draw(1);
      state.player.push(card);
      renderHands();
      renderStats();
      const { total } = handTotal(state.player);
      if (total > 21) {
        state.holeHidden = false;
        renderHands();
        settle("lose", `Bust with ${total}. Dealer wins.`);
        return;
      }
      state.busy = false;
      await stand();
    } catch (err) {
      handleError(err);
    } finally {
      state.busy = false;
    }
  }

  async function stand(byPlayer = false) {
    if (state.busy) return;
    if (byPlayer) recordDecision("S");
    state.busy = true;
    setActionsEnabled(false);
    try {
      state.holeHidden = false;
      renderHands();
      setMessage("Dealer's turn…");

      // Dealer draws to 17, standing on all 17s.
      while (handTotal(state.dealer).total < 17) {
        await sleep(550);
        await ensureShoeMidHand();
        const [card] = await draw(1);
        state.dealer.push(card);
        renderHands();
        renderStats();
      }

      const p = handTotal(state.player).total;
      const d = handTotal(state.dealer).total;
      if (d > 21) settle("win", `Dealer busts with ${d}. You win!`);
      else if (p > d) settle("win", `You win, ${p} to ${d}!`);
      else if (p < d) settle("lose", `Dealer wins, ${d} to ${p}.`);
      else settle("push", `Push at ${p}.`);
    } catch (err) {
      handleError(err);
    } finally {
      state.busy = false;
    }
  }

  // If the shoe runs dry mid-hand, shuffle the discards back in.
  async function ensureShoeMidHand() {
    if (state.remaining < 1) await reshuffle();
  }

  function settle(outcome, text) {
    let payout = 0;
    if (outcome === "blackjack") payout = state.bet + Math.floor(state.bet * 1.5);
    else if (outcome === "win") payout = state.bet * 2;
    else if (outcome === "push") payout = state.bet;

    state.bankroll += payout;
    saveBankroll();

    const kind = outcome === "win" || outcome === "blackjack" ? "win" : outcome === "lose" ? "lose" : "";
    const net = payout - state.bet;
    const suffix = net > 0 ? ` (+${money(net)})` : net < 0 ? ` (−${money(-net)})` : "";
    setMessage(text + suffix, kind);

    recordHand(outcome, payout);

    renderStats();
    showPhase("done");
    if (state.bankroll < MIN_BET) {
      el.newRound.textContent = "Out of money — Restart";
    } else {
      el.newRound.textContent = "Next Hand";
    }
  }

  function recordHand(outcome, payout) {
    const h = state.hand;
    state.hand = null;
    // Count every card seen this hand (the hole card is face up by now).
    state.runningCount += state.uncounted.reduce((sum, c) => sum + hiLo(c), 0);
    state.uncounted = [];
    if (!h) return;

    const p = handTotal(state.player);
    const d = handTotal(state.dealer);
    const start = handTotal(state.player.slice(0, 2));
    const playerBJ = isBlackjack(state.player);
    const dealerBJ = isBlackjack(state.dealer);
    const reason =
      playerBJ && dealerBJ ? "both_blackjack"
      : playerBJ ? "player_blackjack"
      : dealerBJ ? "dealer_blackjack"
      : p.total > 21 ? "player_bust"
      : d.total > 21 ? "dealer_bust"
      : p.total > d.total ? "higher_total"
      : p.total < d.total ? "lower_total"
      : "equal_total";
    const matches = h.decisions.filter((x) => x.matches_basic).length;
    const [c1, c2] = state.player;

    state.handInSession += 1;
    const row = {
      session_id: state.sessionId,
      hand_in_session: state.handInSession,
      strategy: h.strategy,
      bet: state.baseBet,
      total_wagered: state.bet,
      payout,
      net: payout - state.bet,
      bankroll_before: h.bankrollBefore,
      bankroll_after: state.bankroll,
      outcome,
      reason,
      player_cards: state.player.map(cardCode),
      dealer_cards: state.dealer.map(cardCode),
      player_total: p.total,
      dealer_total: d.total,
      start_total: start.total,
      start_soft: start.soft,
      start_pair: cardValue(c1) === cardValue(c2),
      dealer_upcard: cardCode(state.dealer[0]),
      dealer_up_value: cardValue(state.dealer[0]),
      actions: h.decisions.map((x) => x.action).join(""),
      decisions: h.decisions,
      doubled: h.decisions.some((x) => x.action === "D"),
      player_bust: p.total > 21,
      dealer_bust: d.total > 21,
      player_blackjack: playerBJ,
      dealer_blackjack: dealerBJ,
      bs_decisions: h.decisions.length,
      bs_matches: matches,
      running_count: h.runningCount,
      true_count: h.trueCount,
      shoe_remaining: h.shoeRemaining,
      decks: DECK_COUNT,
      duration_ms: Date.now() - h.startedAt,
    };
    if (window.blackjackRecordHand) window.blackjackRecordHand(row);
  }

  // ---------- Strategy tag ----------
  function loadCustomStrategies() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_STRATEGIES_KEY)) || []; } catch { return []; }
  }

  function setupStrategyPicker() {
    const select = el.strategy;
    const customs = loadCustomStrategies();
    const addOption = (name) => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = name;
      select.insertBefore(opt, select.querySelector('option[value="__new"]'));
    };
    customs.forEach(addOption);
    let saved = null;
    try { saved = localStorage.getItem(STRATEGY_KEY); } catch { /* ignore */ }
    if (saved && [...select.options].some((o) => o.value === saved)) select.value = saved;
    let previous = select.value;

    select.addEventListener("change", () => {
      if (select.value === "__new") {
        const name = (prompt("Name your strategy (e.g. \"Hi-Lo bet spread\"):") || "").trim().slice(0, 60);
        if (!name) { select.value = previous; return; }
        if (![...select.options].some((o) => o.value === name)) {
          addOption(name);
          try { localStorage.setItem(CUSTOM_STRATEGIES_KEY, JSON.stringify([...customs, name])); customs.push(name); } catch { /* ignore */ }
        }
        select.value = name;
      }
      previous = select.value;
      try { localStorage.setItem(STRATEGY_KEY, select.value); } catch { /* ignore */ }
    });
  }

  const currentStrategy = () => (el.strategy && el.strategy.value !== "__new" ? el.strategy.value : "Unspecified");

  function newRound() {
    if (state.bankroll < MIN_BET) {
      state.bankroll = START_BANKROLL;
      saveBankroll();
    }
    const lastBet = state.baseBet || state.bet;
    state.player = [];
    state.dealer = [];
    state.holeHidden = true;
    // Keep the same bet if affordable, for quick replays.
    state.bet = lastBet <= state.bankroll ? lastBet : 0;
    renderHands();
    renderStats();
    renderChips();
    showPhase("betting");
    setMessage(state.bet ? "Same bet? Press Deal, or adjust your chips." : "Place your bet to begin.");
  }

  function resetBankroll() {
    if (state.busy) return;
    if (!el.actions.classList.contains("hidden") && !confirm("Abandon the current hand and reset?")) return;
    state.bankroll = START_BANKROLL;
    state.bet = 0;
    state.baseBet = 0;
    saveBankroll();
    newRound();
  }

  function handleError(err) {
    console.error(err);
    // Refund anything on the table and go back to betting.
    state.bankroll += state.bet;
    state.bet = 0;
    state.player = [];
    state.dealer = [];
    state.hand = null;
    state.uncounted = [];
    state.deckId = null; // fetch a fresh shoe next time
    saveBankroll();
    renderHands();
    renderStats();
    showPhase("betting");
    state.busy = false;
    renderChips();
    setMessage("Couldn't reach the Deck of Cards API. Your bet was returned — try again.", "lose");
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Wire up ----------
  el.chips.forEach((chip) => chip.addEventListener("click", () => addChip(Number(chip.dataset.chip))));
  el.clearBet.addEventListener("click", clearBet);
  el.deal.addEventListener("click", deal);
  el.hit.addEventListener("click", hit);
  el.stand.addEventListener("click", () => stand(true));
  el.double.addEventListener("click", doubleDown);
  el.newRound.addEventListener("click", newRound);
  el.reset.addEventListener("click", resetBankroll);

  setupStrategyPicker();
  renderStats();
  renderChips();
  showPhase("betting");

  // Called by auth.js when a user signs in, so each account keeps its own bankroll.
  window.blackjackSetPlayer = (userId, greeting) => {
    storageKey = userId ? `blackjack-bankroll:${userId}` : "blackjack-bankroll";
    state.bankroll = loadBankroll();
    state.bet = 0;
    state.baseBet = 0;
    state.player = [];
    state.dealer = [];
    state.holeHidden = true;
    renderHands();
    renderStats();
    renderChips();
    showPhase("betting");
    setMessage(greeting ? `${greeting} Place your bet to begin.` : "Place your bet to begin.");
  };

  // Warm up a shoe in the background so the first deal is fast.
  newShoe().then(renderStats).catch(() => { /* will retry on deal */ });
})();
