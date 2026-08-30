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
  console.log('meta:', {
    count: data.count,
    limit: data.limit,
    public_api_limited: data.public_api_limited,
    type: data.type,
    ranking_type_name: data.ranking_type_name,
  })
  const players = data.players ?? data.rankings ?? null
  if (Array.isArray(players)) {
    console.log('player array length:', players.length)
    console.log('last player object:', JSON.stringify(players[players.length - 1], null, 2))
  } else {
    console.log('no obvious players/rankings array; full object (first 2000 chars):')
    console.log(JSON.stringify(data, null, 2).slice(0, 2000))
  }
}

// Two calls only, staying well inside the 50/day limit: does `limit=`
// raise the apparent 10-player cap for RB (a deep position, so easy to
// tell if it worked), and does dropping `type=ST` change anything?
await tryFetch('position=RB, limit=100', 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?scoring=PPR&position=RB&limit=100')
await tryFetch('position=RB, no type/limit', 'https://api.fantasypros.com/public/v2/json/nfl/2026/consensus-rankings?scoring=PPR&position=RB')
