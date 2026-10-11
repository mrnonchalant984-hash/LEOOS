# LEO Project Reader plugin worker

This is a separate Vercel deployment for the `leo-project-reader` plugin. Set
the Vercel project Root Directory to `plugin-worker` when importing the parent
repository.

Required server-only environment variables:

- `PLUGIN_RUNTIME_TOKEN`: must match the LeonardX gateway token.
- `LEO_API_URL`: LeonardX origin, normally `https://leoos-omega.vercel.app`.
- `LEO_API_KEY`: a LeonardX developer API key with read access.

The worker accepts signed `leo-plugin-v1` requests at `/api/plugin` and
supports `projects.list` and `projects.read`. It never exposes the API key to
the browser.
