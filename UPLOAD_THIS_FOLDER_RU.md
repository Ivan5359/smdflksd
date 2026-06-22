# Заливать СОДЕРЖИМОЕ этой папки

Это финальный Railway-пакет с исходниками и готовым `dist/`.

Главное: в корне GitHub-репозитория должны лежать `package.json`,
`app-server.mjs`, `dist/`, `src/`, `scripts/` и остальные файлы из списка ниже.
Не должно получиться так, что в репозитории лежит только одна папка
`RAILWAY_UPLOAD_READY`, а файлы находятся внутри нее. Если все-таки загрузил
папку вложенно, то в Railway обязательно поставь:

- Root Directory: `RAILWAY_UPLOAD_READY`

Что внутри:

- backend версия: `SITEMONEY_AUDIT_20260622_MONEY_MACHINE`;
- новый command-center дизайн с `Радар целей`;
- глобальный автопоиск бизнесов;
- `Money Machine`: hot/warm лиды, оффер, цена, retainer, next best action и готовый pitch;
- автоаудит найденных сайтов;
- пресеты ниш: Dentist, Clinic, Lawyer, HVAC, Hotel, Salon;
- гео-пакеты: USA money, EU cities, Gulf, World scan;
- фильтры лидов по имени/городу/сайту, score, сохраненным и сортировке;
- сохраненные лиды;
- быстрые действия: сохранить лид, добавить в CRM, скопировать карточку;
- экспорт HTML/JSON/CSV, CSV лидов, CSV money machine и CRM pipeline;
- `dist/` входит в пакет, чтобы Railway не показывал старый frontend;
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
- `DEPLOYMENT_MARKER.txt`

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
2. Там должно быть `SITEMONEY_AUDIT_20260622_MONEY_MACHINE`.
3. Открой `/__frontend-check`.
4. Там должно быть `"ok": true`.
5. Открой `/__deploy-check`.
6. Там тоже должно быть `"ok": true`.

Автоматическая проверка после деплоя:

```powershell
npm run check:live
```

Если она пишет, что `/__deploy-check` вернул HTML, значит Railway все еще
запускает старый код или смотрит не на тот Root Directory.

Если `/__frontend-check` снова показывает старые assets, значит Railway смотрит на старую папку или не получил `dist/`, `src/`, `scripts/verify-build.mjs` и новый `app-server.mjs`.
