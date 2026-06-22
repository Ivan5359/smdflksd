# Подключить этот repo к Railway

GitHub repo уже опубликован:

`https://github.com/Ivan5359/GITHUB_DESKTOP_PUBLISH_READY`

## Что выбрать в Railway

1. Открой Railway и войди через GitHub.
2. Открой текущий проект с доменом:

   `web-production-b74c9.up.railway.app`

3. В настройках сервиса выбери GitHub repo:

   `Ivan5359/GITHUB_DESKTOP_PUBLISH_READY`

4. Branch:

   `main`

5. Root Directory:

   пусто

6. Start Command:

   `node app-server.mjs`

7. Healthcheck Path:

   `/health`

## Проверка

После deploy открой:

`https://web-production-b74c9.up.railway.app/__deploy-check`

Должно быть:

`"ok": true`

Версия должна быть:

`SITEMONEY_AUDIT_20260622_MONEY_MACHINE`

Если видишь:

`SITEMONEY_AUDIT_20260619_GLOBAL_DISCOVERY`

значит Railway все еще смотрит на старый repo, старую ветку или неправильный Root Directory.
