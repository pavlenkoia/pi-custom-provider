# @you/pi-custom-provider

Pi extension, which lets pi manage **custom OpenAI-compatible model providers** — add, edit, refresh and delete them, and register the models they expose into pi's AI catalogue.

Works with any OpenAI-compat endpoint (vLLM, Ollama `--api openai`, LM Studio, text-generation-webui, together-inference proxies, self-hosted gateways, …).

## What it does

- `/provider` — interactive menu: add provider · edit · refresh · delete · list
- `/provider-status` — show the configured providers and their IDs
- `/provider-purge` — force-remove every runtime custom provider (recovery utility)

On startup it reads the persisted configuration, fetches each provider's model list from `GET {baseUrl}/models`, registers them with pi, and reloads them into the `/model` selector.

## Configuration storage

State lives next to your project config so that a fresh checkout works out of the box:

- `{cwd}/.pi/agent/custom-provider.json` — provider definitions (providers array)
- `{cwd}/.pi/agent/custom-provider-state.json` — runtime bookkeeping (registered provider IDs)

The API key is written with `0600` permissions and never committed. Secrets come from you when adding a provider, not from the repo.

## Requirements

- pi ≥ 1.x
- Node.js (bundled by your pi install)

No build step — extensions are loaded directly through jiti, so TypeScript works without compiling.

## Install

### From git

```bash
pi install git:github.com/YOUR_USER/pi-custom-provider@v1.0.0
```

### From npm

```bash
npm login --registry=https://registry.npmjs.org/   # publish once
pi install npm:@you/pi-custom-provider@1.0.0
```

### Try without installing (temporary, for the current run only)

```bash
pi -e git:github.com/YOUR_USER/pi-custom-provider@v1.0.0
# or, after publishing:
pi -e npm:@you/pi-custom-provider@1.0.0
```

## Update

```bash
pi update --extension git:github.com/YOUR_USER/pi-custom-provider@v1.0.0
# or all extensions:
pi update --extensions
```

## Uninstall

```bash
pi remove git:github.com/YOUR_USER/pi-custom-provider@v1.0.0
# global packages live under ~/.pi/agent/git/<host>/<path>
# project-local ones (with -l) live under .pi/git/<host>/<path>
```

## Manual install from a local checkout

Drop `index.ts` into an extensions directory and reload:

```bash
mkdir -p ~/.pi/agent/extensions
cp index.ts ~/.pi/agent/extensions/pi-custom-provider.ts
# then in pi:  /reload
```

Or add the path to project/global settings under `extensions`:

```json
{
  "extensions": [ "/home/youruser/pi-custom-provider-repo" ]
}
```

## Development

The extension is a single-file TypeScript module. To sanity-check it locally (types + imports), you can run pi against it:

```bash
pi -e ./index.ts
```

## License

MIT
