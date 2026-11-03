# Blackjack

A browser blackjack game that uses the free [Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing and card images.

It's plain HTML, CSS and JavaScript, so there's no build step.

## Rules

- 6-deck shoe, reshuffled when fewer than 60 cards remain
- Dealer stands on all 17s
- Blackjack pays 3:2
- Double down on your first two cards
- You start with $1,000; your bankroll is saved in your browser

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy to Netlify

- **Drag and drop:** zip or drag the project folder into https://app.netlify.com/drop
- **From GitHub:** in Netlify, choose "Add new site" → "Import an existing project", pick this repo and the `main` branch, leave the build command empty and set the publish directory to `.` (`netlify.toml` already sets this)

## API endpoints used

| Purpose | Endpoint |
| --- | --- |
| New shuffled shoe | `GET /api/deck/new/shuffle/?deck_count=6` |
| Draw cards | `GET /api/deck/{deck_id}/draw/?count=N` |
| Reshuffle shoe | `GET /api/deck/{deck_id}/shuffle/` |
