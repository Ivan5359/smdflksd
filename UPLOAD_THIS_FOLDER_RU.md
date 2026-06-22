# Заливать эту папку

Загружай в GitHub/Railway содержимое этой папки целиком.

Что внутри:

- новый радикальный черно-бело-синий command-center дизайн;
- центральный `Радар целей`;
- глобальный автопоиск бизнесов через OpenStreetMap/Overpass;
- автоаудит найденных сайтов;
- сортировка целей по приоритету и потенциальным деньгам;
- готовые email, follow-up, DM и Telegram-сообщения;
- CRM-задачи, история и экспорт HTML/JSON/CSV;
- build-check, который не даст Railway задеплоить старый frontend без `Глобальный поиск`.

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

Не загружать отдельно:

- `node_modules/`
- `dist/`
- `server.out.log`
- `server.err.log`
- `design/`
- `data/`
- `RAILWAY_UPLOAD_READY.zip`

Railway:

- Root Directory: пусто, если эта папка является корнем репозитория.
- Если ты загрузил папку как подпапку в репозитории, Root Directory должен быть `RAILWAY_UPLOAD_READY`.
- Start Command: `node app-server.mjs`.
- Проверка backend после деплоя: открыть `/__version` и увидеть `SITEMONEY_AUDIT_20260619_GLOBAL_DISCOVERY`.
- Проверка frontend после деплоя: открыть `/__frontend-check`; все `checks` должны быть `true`.

Если `/__version` новый, а сайт визуально старый, значит frontend не пересобрался или Railway смотрит не на ту папку. Тогда проверь `Root Directory` и redeploy последней версии.

Важно: этот пакет не использует `lucide-react`, чтобы Railway не мог снова упасть на `createLucideIcon.js`.
