# Заливать эту папку

Загружай в GitHub/Railway содержимое этой папки целиком.

Что внутри:

- сайт-аудитор SiteMoney Audit;
- глобальный автопоиск бизнесов через OpenStreetMap/Overpass;
- автоаудит найденных сайтов;
- сортировка целей по приоритету и потенциальным деньгам;
- готовые email, follow-up, DM и Telegram-сообщения;
- CRM-задачи, история и экспорт HTML/JSON/CSV.

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
- `ui-test.out.log`
- `ui-test.err.log`
- `discovery-test.out.log`
- `discovery-test.err.log`
- `design/`
- `data/`
- `RAILWAY_UPLOAD_READY.zip`

Railway:

- Root Directory: пусто, если эта папка является корнем репозитория.
- Если ты загрузил папку как подпапку в репозитории, Root Directory должен быть `RAILWAY_UPLOAD_READY`.
- Start Command: `node app-server.mjs`.
- Проверка после деплоя: открыть `/__version` и увидеть `SITEMONEY_AUDIT_20260619_GLOBAL_DISCOVERY`.

Важно: этот пакет не использует `lucide-react`, чтобы Railway не мог снова упасть на `createLucideIcon.js`.

Автоматизация сама ищет бизнесы и готовит лиды. Финальную отправку сообщений владельцам лучше делать вручную, чтобы не ловить блокировки аккаунтов и не нарушать правила площадок.
