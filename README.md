# @pavlenkoia/pi-custom-provider

[![npm version](https://img.shields.io/npm/v/%40pavlenkoia%2Fpi-custom-provider)](https://www.npmjs.com/package/@pavlenkoia/pi-custom-provider)
[![Publish package](https://github.com/pavlenkoia/pi-custom-provider/actions/workflows/publish.yml/badge.svg)](https://github.com/pavlenkoia/pi-custom-provider/actions/workflows/publish.yml)

Расширение pi, которое даёт возможность pi управлять **кастомными провайдерами OpenAI-совместимого API** — добавлять, редактировать, обновлять и удалять их, а также регистрировать модели, которые они выдают, в каталоге AI самой pi.

Работает с любым endpoint'ом OpenAI-compat (vLLM, Ollama `--api openai`, LM Studio, text-generation-webui, прокси together-inference, самописные шлюзы и т. п.).

## Что умеет

- `/provider` — интерактивное меню: добавить провайдера · отредактировать · обновить · удалить · список
- `/provider-status` — показать настроенные провайдеры и их идентификаторы
- `/provider-purge` — принудительно удалить все runtime-провайдеры (инструмент восстановления)

При старте расширение читает сохранённую конфигурацию и делает запрос `GET {baseUrl}/models` для каждого провайдера, затем регистрирует модели в pi и подгружает их в селектор `/model`.

Для LiteLLM расширение дополнительно читает штатный `GET {apiRoot}/model_group/info` и объединяет metadata по model ID: vision input, reasoning и контекстные лимиты. Если endpoint отсутствует или отвечает ошибкой, это не ломает generic OpenAI-compatible provider: расширение продолжает работать только по `/models`.

## Где хранится конфигурация

Конфиги живут в глобальном агент-директории, **независимо от рабочей директории**, куда запущен pi:

- `~/.pi/agent/custom-provider.json` — определения провайдеров (массив providers)
- `~/.pi/agent/custom-provider-state.json` — runtime-бухгалтерия (идентификаторы зарегистрированных провайдеров)

`~/.pi/agent` определяется пи ядром (`getAgentDir()`): домашний каталог по умолчанию, либо переопределение через переменные окружения `PI_CODING_AGENT_DIR` / `TAU_CODING_AGENT_DIR`. Так состояние загружается из любой папки.

Ключ API записывается с правами `0600` и в репозиторий не попадает. Среда для секретов вы просите при добавлении провайдера, а не из кода репо.

## Требования

- pi ≥ 1.x
- Node.js (используется pi)

Шаг сборки не требуется — расширения загружаются напрямую через jiti, поэтому TypeScript работает без компиляции.

## Установка

### Из git

```bash
pi install git:github.com/pavlenkoia/pi-custom-provider@main
```

### Из npm

Установка актуальной версии из npm:

```bash
pi install npm:@pavlenkoia/pi-custom-provider
```

Установка конкретной версии:

```bash
pi install npm:@pavlenkoia/pi-custom-provider@1.0.2
```

### Попробовать без установки (временно, только для текущего запуска)

```bash
pi -e git:github.com/pavlenkoia/pi-custom-provider@main
# или после публикации:
pi -e npm:@pavlenkoia/pi-custom-provider@1.0.2
```

## Обновление

Для npm-установки:

```bash
pi update --extension npm:@pavlenkoia/pi-custom-provider
```

Для git-установки:

```bash
pi update --extension git:github.com/pavlenkoia/pi-custom-provider@main
```

Или обновить все расширения сразу:

```bash
pi update --extensions
```

## Удаление

```bash
pi remove git:github.com/pavlenkoia/pi-custom-provider@main
# глобальные пакеты лежат под ~/.pi/agent/git/<host>/<path>
# проектные (с флагом -l) — под .pi/git/<host>/<path>
```

## Установка из локального чек-аута вручную

Кладём `index.ts` в папку расширений и перезагружаем:

```bash
mkdir -p ~/.pi/agent/extensions
cp index.ts ~/.pi/agent/extensions/pi-custom-provider.ts
# затем в pi:  /reload
```

Или добавляем путь в проект/глобальные настройки под ключом `extensions`:

```json
{
  "extensions": [ "/home/<ваш_логин>/pi-custom-provider" ]
}
```

## Разработка

Расширение — это одиночный TypeScript-модуль. Шаг сборки не требуется: pi загружает TypeScript напрямую через jiti.

Чтобы проверить расширение локально:

```bash
pi -e ./index.ts
```

## Публикация новой версии

Публикация автоматизирована через GitHub Actions и npm Trusted Publishing (OIDC). Workflow находится в `.github/workflows/publish.yml` и запускается при отправке тега формата `vX.Y.Z`.

Для выпуска patch-версии:

```bash
git checkout main
git pull origin main
npm version patch
git push origin main --follow-tags
```

Команда `npm version` обновит версию в `package.json`, создаст commit и тег. После отправки тега GitHub Actions проверит пакет и опубликует его в npm с provenance.

Для minor или major-релиза используйте соответственно:

```bash
npm version minor
npm version major
```

## Лицензия

MIT
