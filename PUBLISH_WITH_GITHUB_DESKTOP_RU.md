# Публикация через GitHub Desktop

Эта папка уже является готовым git-репозиторием с первым коммитом.

## Что делать

1. Открой GitHub Desktop.
2. File -> Add local repository.
3. Выбери эту папку:

   `C:\Users\repki\Documents\New project 2\GITHUB_DESKTOP_PUBLISH_READY`

4. Нажми `Publish repository`.
5. После публикации подключи этот репозиторий в Railway.

## Railway

- Root Directory: пусто.
- Start Command: `node app-server.mjs`.
- Healthcheck: `/health`.

## Проверка после деплоя

Открой:

`https://web-production-b74c9.up.railway.app/__deploy-check`

Должно быть:

`"ok": true`

Если там старая версия `SITEMONEY_AUDIT_20260619_GLOBAL_DISCOVERY`, Railway все еще
смотрит на старый репозиторий, старую ветку или неправильный Root Directory.
