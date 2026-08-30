// One-off discovery script: fetch FantasyPros' consensus-rankings endpoint
// and print its shape (top-level keys, one sample player, total count) so
// the real JSON schema can be confirmed before building the real ingestion
// pipeline. Does not write anything to the repo. The API key is read only
// from the environment (GitHub Actions secret) - never logged.

const API_KEY = process.env.FANTASYPROS_API_KEY
if (!API_KEY) {
  console.error('FANTASYPROS_API_KEY is not set.')
  process.exit(1)
}

async function tryFetch(label, url) {
  console.log(`\n=== ${label}: ${url} ===`)
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } })
  console.log('status:', res.status)
  const text = await res.text()
  if (!res.ok) {
    console.error('Non-200 response body (first 1000 chars):', text.slice(0, 1000))
    return
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    console.error('Response was not valid JSON. First 1000 chars:', text.slice(0, 1000))
    return
  }
  console.log('top-level keys:', Object.keys(data))
  const players = data.players ?? data.rankings ?? null
  if (Array.isArray(players)) {
    console.log('player array length:', players.length)
    console.log('first player object:', JSON.stringify(players[0], null, 2))
    console.log('second player object:', JSON.stringify(players[1], null, 2))
  } else {
    console.log('no obvious players/rankings array; full object (first 2000 chars):')
    console.log(JSON.stringify(data, null, 2).slice(0, 2000))
  }
}

// Two calls only - stay well inside the 50/day limit. Testing whether
// omitting `position` returns the full overall board, and confirming the
// shape for a single position as a fallback plan.
await tryFetch('no position param (hoping for overall board)', 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?type=ST&scoring=PPR')
await tryFetch('position=QB', 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?type=ST&scoring=PPR&position=QB')
