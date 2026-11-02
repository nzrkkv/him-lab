# Хим лаба

Виртуальная химическая лаборатория для детей 9–12 лет: свободные опыты с настоящей химией и понятными объяснениями.

- Решения проекта: [`docs/00-context.md`](docs/00-context.md)
- Техническая спецификация: [`docs/spec/`](docs/spec/README.md)
- Дизайн: [`docs/design/`](docs/design/README.md), материалы в [`design/`](design/)
- Урок 1: [`docs/content/lesson-01.md`](docs/content/lesson-01.md)
- Решения по стеку: [`docs/adr/`](docs/adr/)

## Команды

```bash
npm install            # зависимости (Node 22+)
npm run dev            # локальный сервер http://localhost:5173 с пересборкой
npm run check          # линт, типы, контент, ассеты, тесты, сборка
npm test               # юнит- и табличные тесты движка и миссии
npm run test:e2e       # e2e в Playwright (CHROME_PATH — путь к Chrome, если нет браузеров Playwright)
npm run build          # сборка в dist/ (BASE_PATH=/him-lab/ для GitHub Pages)
```

## Устройство

- `content/` — вещества, правила реакций, эффекты, миссии и все тексты (YAML, проверяются схемой).
- `src/core/` — чистое ядро: движок реакций, миссии, прогресс. Без DOM, времени и случайности.
- `src/fx/`, `src/ui/`, `src/app/` — эффекты, интерфейс и сборка приложения.
- `design/` — дизайн-система и ассеты (владелец — дизайн, фронтенд только читает).

Сайт: https://nzrkkv.github.io/him-lab/ (публикуется из `main` через GitHub Actions).
