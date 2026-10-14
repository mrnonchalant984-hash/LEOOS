# LeonardX local/offline text chat setup

## What this enables

`/offline/chat` is a separate local-model chat interface. It does not call the hosted OpenAI API and does not require Supabase login for each message. The conversation history is stored in that browser's local storage. It uses the model endpoint configured on the **LeonardX application server**.

This is not installed into the ZIP automatically: model weights are large and must be downloaded once onto the computer. The Vercel deployment cannot reach `127.0.0.1` on your laptop. To use chat with mobile data turned off, run the Next.js app and Ollama on the same computer, open the local app address, and keep both running.

## Windows setup

1. Install Ollama from https://ollama.com/download.
2. Connect to the internet for the initial model download. Open PowerShell at the project folder and run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\offline\setup-ollama.ps1
   ```

   The script downloads `qwen2.5:3b` by default. This is a small general-purpose model; response quality and speed depend on available RAM/CPU/GPU.
3. Add the following to the project's `.env.local` (do not commit this file):

   ```dotenv
   LEO_OFFLINE_MODE=true
   LEO_LOCAL_MODEL_URL=http://127.0.0.1:11434/v1
   LEO_LOCAL_MODEL_NAME=qwen2.5:3b
   ```

4. Restart the local Next.js server after changing `.env.local`:

   ```powershell
   npm run dev
   ```

5. While online, open `http://localhost:3000/offline/chat` once. After the model is downloaded, disconnect mobile data/Wi-Fi and test a new message while the local app and Ollama are still running.

If the app runs on a different computer or in a container, `127.0.0.1` refers to that server/container, not necessarily the device with Ollama. Configure a reachable private-network URL only if you understand and secure that network endpoint.

## Important limits

- A Vercel-hosted page cannot load or call its server API when the device has no internet. Use the local `http://localhost:3000` app for fully disconnected chat.
- The first model download requires internet. No model weights are included in the source ZIP.
- Offline chat does not have live web search, cloud memory, remote repository access, image/video generation, realtime voice, or cloud synchronization.
- Existing account-backed chats, meetings, and workforce jobs still rely on Supabase and/or external services. The offline outbox can save drafts and queued tasks locally, but syncing them requires reconnecting.
- `LEO_OFFLINE_MODE=true` intentionally blocks hosted OpenAI fallback. If the local endpoint is down or the model name is wrong, the request fails instead of silently using cloud AI.
