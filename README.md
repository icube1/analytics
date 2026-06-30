<div align="center">

# 📊 Analytics

**Личный дашборд для анализа банковских выписок и инвестиционного портфеля**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Private-lightgrey)](#)

[Возможности](#-возможности) · [Быстрый старт](#-быстрый-старт) · [Структура проекта](#-структура-проекта) · [Конфиденциальность](#-конфиденциальность)

</div>

---

## О проекте

**Analytics** — локальное веб-приложение на Next.js для визуализации личных финансов. Загружайте CSV-выписки банка и HTML-отчёты брокера Сбера, фильтруйте транзакции, смотрите графики расходов и моделируйте рост капитала с учётом налогов, инфляции и долгов.

> Все данные хранятся на вашем компьютере — ничего не отправляется на внешние серверы.

---

## ✨ Возможности

### 💳 Выписка

| Функция | Описание |
|--------|----------|
| **Импорт CSV** | Drag-and-drop или выбор файлов; автоматическое объединение и дедупликация |
| **Фильтры** | По дате, категории, мерчанту, сумме и типу операции |
| **Графики** | Расходы по категориям, дневной денежный поток, топ мерчантов |
| **Таблица** | Полный список транзакций с сортировкой |

### 📈 Инвестиции

| Функция | Описание |
|--------|----------|
| **Портфель Сбера** | Парсинг HTML-отчёта брокера: позиции, доходность, аллокация |
| **Другие активы** | Недвижимость, депозиты, крипто и прочие внеброкерские активы |
| **Сводка** | Общий капитал, структура активов, ключевые метрики |
| **Сложный процент** | Симуляция роста капитала: взносы, налоги, инфляция, IRR, безопасное снятие |

### 🎨 Интерфейс

- Тёмная и светлая тема
- Адаптивная вёрстка
- Drag-and-drop загрузка файлов на обеих страницах

---

## 🚀 Быстрый старт

### Требования

- **Node.js** 20+
- **npm** (или pnpm / yarn / bun)

### Установка

```bash
git clone https://github.com/icube1/analytics.git
cd analytics
npm install
```

### Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

### Сборка и тесты

```bash
npm run build    # production-сборка
npm run start    # запуск production-сервера
npm test         # unit-тесты (Jest)
npm run lint     # ESLint
```

---

## 📁 Структура проекта

```
analytics/
├── app/                    # Next.js App Router (страницы и API)
│   ├── page.tsx            # Дашборд выписки
│   ├── investments/        # Дашборд инвестиций
│   └── api/                # REST API для файлов и данных
├── components/             # React-компоненты UI
├── lib/                    # Бизнес-логика
│   ├── compound-interest/  # Симулятор сложного процента
│   ├── parse-portfolio-html.ts
│   └── ...
├── data/                   # Локальное хранилище портфеля (gitignore)
├── statements/             # Загруженные CSV-выписки (gitignore)
└── __tests__/              # Тесты
```

---

## 🔒 Конфиденциальность

Персональные финансовые данные **не попадают в репозиторий**:

| Путь | Содержимое |
|------|------------|
| `data/portfolio.json` | Сохранённый портфель и настройки |
| `data/broker-report.html` | HTML-отчёт брокера |
| `statements/*.csv` | Банковские выписки |

Пример конфигурации портфеля: `data/portfolio.example.json`.

---

## 🛠 Стек

| Слой | Технологии |
|------|------------|
| Framework | Next.js 16, React 19 |
| Язык | TypeScript 5 |
| Стили | Tailwind CSS 4 |
| Графики | Recharts |
| HTML-парсинг | linkedom |
| Тесты | Jest, ts-jest |

---

## 📄 Лицензия

Приватный проект. Все права защищены.

---

<div align="center">

Сделано с ❤️ для личной финансовой аналитики

</div>
