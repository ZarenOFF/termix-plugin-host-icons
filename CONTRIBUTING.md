# Contributing to Host Icons

## Development

You need Node 24.

```bash
npm run build      # build into dist/
npm run test       # run this plugin's tests
npm run typecheck  # type-check this plugin
npm run validate   # check manifest.json, the changelog and docs (run build first)
npm run pack       # pack dist/ into a .tmxplug
npm run format     # format the code with Prettier
```

## Adding an icon

1. Add an entry to `HOST_ICONS` in `src/frontend/icons.ts`. The `id` is stored in host settings, so never change or remove one that has shipped. `lucide` must be the icon's canonical name in Lucide's `icons` map (for example `Building`, not the `Building2` alias).
2. Add its label under `icons` in `locales/en.json` and `locales/translated/ru_RU.json`.
3. Run `npm test`. A test renders every icon and fails for a name the Lucide copy in Termix lacks.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint.

## Docs

The docs for this plugin are in [docs/](docs/), and `docs` in `manifest.json` links to them. Settings and capabilities are made from `manifest.json`, so keep those up to date instead of writing them by hand. See [writing docs](https://docs.termix.site/develop/docs).
