# Заливать эту папку

Загружай в GitHub/Railway содержимое этой папки целиком.

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
- `README_RU.md`
- `RUN_LOCAL.ps1`
- `.gitignore`

Не загружать:

- `node_modules/`
- `dist/`
- `server.out.log`
- `server.err.log`
- `design/`
- `RAILWAY_UPLOAD_READY.zip`

Railway:

- Root Directory: пусто, если эта папка является корнем репозитория.
- Если ты загрузил папку как подпапку в репозитории, Root Directory должен быть `RAILWAY_UPLOAD_READY`.
- Start Command: `node app-server.mjs`.
- Проверка после деплоя: открыть `/__version` и увидеть `SITEMONEY_AUDIT_20260618_2330_ENTRYPOINT_FIX`.

Важно: этот пакет больше не использует `lucide-react`, чтобы Railway не мог снова упасть на `createLucideIcon.js`.
