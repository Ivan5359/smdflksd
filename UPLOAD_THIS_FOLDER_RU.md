# Заливать эту папку целиком

Это финальный Railway-пакет. В нем есть и исходники, и готовый `dist/`.

Что исправлено:

- backend версия: `SITEMONEY_AUDIT_20260622_RUNTIME_REBUILD`;
- новый command-center дизайн с `Радар целей`;
- глобальный автопоиск бизнесов;
- автоаудит найденных сайтов;
- готовые сообщения, CRM и экспорт;
- `dist/` теперь входит в пакет, чтобы Railway не показывал старый frontend;
- сервер при запуске проверяет frontend и сам пересобирает `dist`, если видит старые assets.

Обязательные файлы и папки:

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `nixpacks.toml`
- `railway.json`
- `Procfile`
- `app-server.mjs`
- `server.js`
- `index.html`
- `vite.config.js`
- `src/`
- `public/`
- `scripts/`
- `dist/`
- `README_RU.md`
- `RUN_LOCAL.ps1`
- `.gitignore`

Не загружать:

- `node_modules/`
- `data/`
- `.env`
- `*.log`

Railway:

- Root Directory: пусто, если файлы этой папки лежат в корне репозитория.
- Если эта папка лежит как подпапка в репозитории, Root Directory должен быть `RAILWAY_UPLOAD_READY`.
- Start Command: `node app-server.mjs`.

Проверка после деплоя:

1. Открой `/__version`.
2. Там должно быть `SITEMONEY_AUDIT_20260622_RUNTIME_REBUILD`.
3. Открой `/__frontend-check`.
4. Там должно быть:

```json
{
  "ok": true
}
```

Если `/__frontend-check` снова показывает assets `index-DF1kHXYy.js` и `index-BwYpoT4u.css`, значит Railway смотрит на старую папку или не получил `dist/`, `src/`, `scripts/verify-build.mjs` и новый `app-server.mjs`.
