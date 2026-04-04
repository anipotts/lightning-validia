# Ghost Setup on Lightning AI Studio

## Steps

1. Clone Ghost on Studio:
   ```bash
   git clone https://github.com/vaulpann/ghost.git
   cd ghost
   ```

2. Copy `ghost.env` to `.env`:
   ```bash
   cp /path/to/ghost.env .env
   ```

3. Apply the Lightning AI compatibility patch:
   ```bash
   git apply /path/to/lightning-ai-compat.patch
   ```

4. Start Ghost:
   ```bash
   docker-compose up --build
   ```

5. Verify:
   ```bash
   curl http://localhost:8000/health
   ```

## What the patch does
- Routes OpenAI API calls through Lightning AI's proxy (`OPENAI_BASE_URL`)
- Swaps `gpt-4o-mini` (not available) for `openai/gpt-5-nano`
- Makes agent model configurable via env vars instead of hardcoded
