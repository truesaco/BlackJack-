# Blackjack

A browser blackjack game that uses the free [Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing and card images.

It's plain HTML, CSS and JavaScript, so there's no build step.

## Rules

- 6-deck shoe, reshuffled when fewer than 60 cards remain
- Dealer stands on all 17s
- Blackjack pays 3:2
- Double down on your first two cards
- You start with $1,000; your bankroll is saved in your browser
- Tag each hand with a strategy so you can compare strategies on the stats page

## Sign-in

Players sign in before playing, using **Google** or **email and password**. Supabase Auth handles this (project "Black Jack"). Each account keeps its own bankroll in that browser.

After signing in, players are greeted by name. The avatar button in the top-right opens their **profile**, where they can change their display name and photo. Google users get their Google name and photo by default and can switch back to them at any time.

Photos are cropped to 256×256 in the browser and uploaded to the public `avatars` storage bucket. Each user can only write to their own folder. Name and photo choices are saved on the user's Supabase account. The bucket setup is in `supabase/migrations/`.

The code is in `auth.js`. It uses the project's publishable key, which is meant to be public.

### One-time Supabase setup

In the [Supabase dashboard](https://supabase.com/dashboard/project/ahftbaykwpegkcpftiam):

1. **Authentication → URL Configuration**: set **Site URL** to your Netlify URL, for example `https://your-site.netlify.app`. Add the same URL, plus `http://localhost:3000` for local testing, under **Redirect URLs**.
2. **Authentication → Sign In / Providers → Email**: on by default. With "Confirm email" on, new users must click the emailed link before they can sign in.
3. **Authentication → Sign In / Providers → Google**: turn it on and paste a Google OAuth **Client ID** and **Client Secret**. To get them:
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type *Web application*.
   - Under **Authorized redirect URIs**, add `https://ahftbaykwpegkcpftiam.supabase.co/auth/v1/callback`.
   - Set up the OAuth consent screen if prompted.

## Stats and hand history

Every finished hand is saved to the Supabase `hands` table. Each player can only read or delete their own hands. **My stats** (`stats.html`) turns them into:

- **KPIs:** hands, net profit, win rate, return on wagers, basic-strategy match %, average bet, blackjacks, bust rates, double-down win rate, streaks, and biggest win/loss.
- **Charts:** cumulative profit, result mix, and profit per hand by dealer upcard, by starting hand, and by Hi-Lo true count.
- **Strategy comparison:** pick a strategy tag at the table before you deal, and every hand is saved with it. Add your own tags with "+ New strategy…".
- **Decisions vs basic strategy:** every hit/stand/double is compared with the correct basic-strategy play for this table (6 decks, dealer stands on soft 17, no split or surrender). The page lists your most common deviations and how they turned out.
- **Hand history** with every card and decision.
- **Export CSV / JSON** of the filtered hands, for modeling.

### Data fields (one row per hand)

| Field | Meaning |
| --- | --- |
| `played_at`, `session_id`, `hand_in_session` | When, and which sitting (one page load = one session) |
| `strategy` | The strategy tag selected at the table |
| `bet`, `total_wagered`, `payout`, `net` | Initial bet, bet after any double, amount returned, profit |
| `bankroll_before`, `bankroll_after` | Bankroll around the hand |
| `outcome`, `reason` | `blackjack` / `win` / `push` / `lose`, and why (`dealer_bust`, `player_bust`, `higher_total`, ...) |
| `player_cards`, `dealer_cards` | Card codes such as `AS`, `10H`, `KD` |
| `start_total`, `start_soft`, `start_pair`, `dealer_up_value` | The starting situation (ace = 11) |
| `actions`, `decisions` | Moves as letters (`H`, `S`, `D`), plus a JSON list of each decision with total, soft flag, upcard, your action, the basic-strategy action, and whether they match |
| `bs_decisions`, `bs_matches` | Number of decisions, and how many matched basic strategy |
| `running_count`, `true_count`, `shoe_remaining` | Hi-Lo count before the deal, and cards left in the shoe |
| `doubled`, `player_bust`, `dealer_bust`, `player_blackjack`, `dealer_blackjack`, `duration_ms` | Flags and hand length |

The table definition is in `supabase/migrations/`.

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
