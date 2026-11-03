# Blackjack

A browser blackjack game that uses the free [Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing and card images.

It's plain HTML, CSS and JavaScript, so there's no build step.

## Rules

- 6-deck shoe, reshuffled when fewer than 60 cards remain
- Dealer stands on all 17s
- Blackjack pays 3:2
- Double down on your first two cards
- You start with $1,000; your bankroll is saved in your browser

## Sign-in

Players sign in before playing, using **Google** or **email and password**. Supabase Auth handles this (project "Black Jack"). Each account keeps its own bankroll in that browser.

The code is in `auth.js`. It uses the project's publishable key, which is meant to be public.

### One-time Supabase setup

In the [Supabase dashboard](https://supabase.com/dashboard/project/ahftbaykwpegkcpftiam):

1. **Authentication → URL Configuration**: set **Site URL** to your Netlify URL, for example `https://your-site.netlify.app`. Add the same URL, plus `http://localhost:3000` for local testing, under **Redirect URLs**.
2. **Authentication → Sign In / Providers → Email**: on by default. With "Confirm email" on, new users must click the emailed link before they can sign in.
3. **Authentication → Sign In / Providers → Google**: turn it on and paste a Google OAuth **Client ID** and **Client Secret**. To get them:
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type *Web application*.
   - Under **Authorized redirect URIs**, add `https://ahftbaykwpegkcpftiam.supabase.co/auth/v1/callback`.
   - Set up the OAuth consent screen if prompted.

## Run locally

Serve the folder over http, because sign-in redirects don't work from `file://`:

```bash
npx serve . -l 3000
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
