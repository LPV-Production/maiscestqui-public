export interface Env {
  DB: D1Database
  AI: Ai
  ASSETS: Fetcher
  AI_MODEL?: string
  // Clé gratuite Google AI Studio (secret Cloudflare : npx wrangler secret put GEMINI_API_KEY)
  GEMINI_API_KEY?: string
}
