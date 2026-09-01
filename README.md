# @pavlenkoia/pi-custom-provider

Расширение pi, которое даёт возможность pi управлять **кастомными провайдерами OpenAI-совместимого API** — добавлять, редактировать, обновлять и удалять их, а также регистрировать модели, которые они выдают, в каталоге AI самой pi.

Работает с любым endpoint'ом OpenAI-compat (vLLM, Ollama `--api openai`, LM Studio, text-generation-webui, прокси together-inference, самописные шлюзы и т. п.).

## Что умеет

- `/provider` — интерактивное меню: добавить провайдера · отредактировать · обновить · удалить · список
- `/provider-status` — показать настроенные провайдеры и их идентификаторы
- `/provider-purge` — принудительно удалить все runtime-провайдеры (инструмент восстановления)

При старте расширение читает сохранённую конфигурацию, делает запрос `GET {baseUrl}/models` для каждого провайдера, регистрирует модели в pi и подгружает их в селектор `/model`.

## Где хранится конфигурация

Состояние лежит рядом с конфигами проекта, чтобы свежий клон запускался сразу:

- `{cwd}/.pi/agent/custom-provider.json` — определения провайдеров (массив providers)
- `{cwd}/.pi/agent/custom-provider-state.json` — runtime-бухгалтерия (идентификаторы зарегистрированных провайдеров)

Ключ API записывается с правами `0600` и в репозиторий не попадает. Среда для секретов вы просите при добавлении провайдера, а не из кода репо.

## Требования

- pi ≥ 1.x
- Node.js (пирингирует пакет pi)

Шаг сборки не требуется — расширения загружаются напрямую через jiti, поэтому TypeScript работает без компиляции.

## Установка

### Из git

```bash
pi install git:github.com/pavlenkoia/pi-custom-provider@main
```

### Из npm

```bash
npm login --registry=https://registry.npmjs.org/   # выложить один раз
pi install npm:@pavlenkoia/pi-custom-provider@1.0.0
```

### Попробовать без установки (временно, только для текущего запуска)

```bash
pi -e git:github.com/pavlenkoia/pi-custom-provider@main
# или после публикации:
pi -e npm:@pavlenkoia/pi-custom-provider@1.0.0
```

## Обновление

```bash
pi update --extension git:github.com/pavlenkoia/pi-custom-provider@main
# или все расширения сразу:
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

Расширение — это одиночный TypeScript-модуль. Чтобы проверить его локально (типы + импорты), можно запустить pi против него:

```bash
pi -e ./index.ts
```

## Лицензия

MIT
