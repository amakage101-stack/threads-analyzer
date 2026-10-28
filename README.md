# Threads Analyzer (personal MVP)

A Next.js app for submitting a public Threads profile URL, running the `varnmill/threads-scraper` Apify Actor, polling its run status and exporting returned post data as CSV.

## Deploy to Render

- Runtime: Node
- Root Directory: leave blank (the `package.json` is at repository root)
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment Variable: `APIFY_API_TOKEN` = your Apify token. Never commit a real token to GitHub.

## Features

- Enter a different profile URL on each run
- Request 100, 500, 1,000 or up to 5,000 posts
- Displays text, timestamp, likes, replies, reposts, quotes when the Actor returns those fields
- Sorts by date/engagement and exports CSV
- API token is only used server-side

## Important limitations

- The Actor is a third-party scraper, not a Meta/Threads official API. Results, cost and availability depend on the Actor and Threads public access; full historical retrieval is not guaranteed.
- This MVP stores results only in the browser session and does not persist posts in a database.
- Verify Actor pricing in Apify before running large jobs. Start with 100 posts.
