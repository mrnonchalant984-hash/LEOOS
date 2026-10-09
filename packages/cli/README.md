# @leo-os/cli

The supported LeonardX CLI for the authenticated project API.

```sh
npm install
node src/index.mjs login --api-key "$LEO_API_KEY" --base-url https://your-leonardx.example
node src/index.mjs projects list
node src/index.mjs projects create "My app" --type web_app
```

The token is stored in the user's local config with restrictive file permissions. It is never printed after login. The CLI only exposes endpoints implemented by LeonardX; deployment commands are intentionally not included until a stable deployment API exists.
