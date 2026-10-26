# LeonardX AI Provider Repair Overlay — Review Notes

This ZIP is a small overlay for the supplied `LEOOS-main.zip`, not a replacement application.

## Included
- `app/settings/ai/page.tsx`: authenticated AI provider diagnostics page.
- `components/AIProviderStatus.tsx`: read-only status UI backed by the existing authenticated `/api/models` endpoint.
- `app/settings/page.tsx`: adds a link to the diagnostics page.

The UI intentionally reports credential presence, not a successful live provider test. It does not accept or return API keys. Configure secrets only in the server's environment settings.

## Findings from source inspection (not live-runtime verified)
1. **Text fallback exists in source.** `app/api/chat/route.ts` imports and uses `generateWithExplicitFallback` / `getSafeFallbackModel`; `lib/ai/provider-fallback.ts` chooses a configured explicit cross-provider fallback or `google/gemini-1.5-flash` when Google is configured. This does not prove production has `GEMINI_API_KEY`/`GOOGLE_API_KEY`, model access, quota, or the latest deployment.
2. **Image fallback exists in source.** `lib/generation/images.ts` attempts the preferred OpenAI image model, then calls the configured Imagen prediction endpoint when a Google key is present. The UI error text “Any reserved credits were returned when possible” is not proof that a refund actually succeeded; verify the database RPC outcomes in runtime logs.
3. **Video is a separate integration.** `lib/agents/runway-video.ts` exists, and `.env.example` documents `RUNWAYML_API_SECRET` and `RUNWAY_VIDEO_MODEL`. Gemini text fallback should not be assumed to provide video generation.
4. **Real-time voice currently requests OpenAI Realtime.** `app/api/realtime/session/route.ts` uses `getOpenAI().realtime.clientSecrets.create` with `LEO_REALTIME_MODEL` (default `gpt-realtime`) and returns a Gemini turn-based fallback response only if a Google key is present. That fallback is not equivalent to WebRTC real-time voice. `app/meeting-room/page.tsx` also calls OpenAI's realtime calls endpoint directly.
5. **Provider status route exists.** `app/api/models/route.ts` requires sign-in and reports registered model defaults/configuration. The added page uses that endpoint and labels status as configuration presence only.

## Environment variable names to review (do not paste values into chat)
- Text: `OPENAI_API_KEY` or `LEO_API_KEY`; `GEMINI_API_KEY` or `GOOGLE_API_KEY`; optional `LEO_CHAT_MODEL`, `LEO_FALLBACK_MODEL`, `LEO_MODEL_TIMEOUT_MS`.
- Image: `LEO_IMAGE_MODEL`, `LEO_GEMINI_IMAGE_MODEL`, plus OpenAI and/or Google credentials as supported by current code.
- Voice: `LEO_REALTIME_MODEL`, OpenAI credentials; Gemini voice fallback uses `LEO_GEMINI_AUDIO_MODEL`, `LEO_GEMINI_TTS_MODEL` and Google credentials.
- Video: `RUNWAYML_API_SECRET`, `RUNWAY_VIDEO_MODEL`.

## Important limitations
- This overlay does not silently modify secrets or provider settings.
- It does not claim live chat/image/video/voice requests now work.
- The full app test/build suite has not been run in this environment for this overlay. Apply it to a clean copy of the supplied repository, then run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`. Follow with live smoke tests on the deployed version and inspect redacted server logs for the actual HTTP status/correlation ID.
