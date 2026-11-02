# SVG-ассеты Хим лабы

Все ассеты — плоский вектор, нарисованный в коде. Растровых картинок, внешних изображений, чужих персонажей и логотипов нет.

Исходник геометрии — генератор `design/tools/build-assets.mjs`. Готовые файлы в этой папке — его результат. Новую посуду или иконку лучше добавлять в генератор: так сохраняются сетка, толщина контура и имена слоёв. Пересборка: `node design/tools/build-assets.mjs`.

## Что где лежит

| Папка | Что внутри | Примеры |
| --- | --- | --- |
| `equipment/` | Посуда и приборы (18) | `beaker`, `test-tube`, `flask`, `graduated-cylinder`, `evaporating-dish`, `spoon`, `pipette`, `stirrer`, `scales`, `burner`, `ice-bath`, `funnel`, `magnet`, `magnifier`, `thermometer`, `ph-strip`, `test-tube-rack`, `test-tube-holder` |
| `containers/` | Тара веществ | `jar` (банка), `bottle` (бутылка), `bag` (пакет) |
| `character/` | Проводник Пипа, 4 позы | `guide-explain`, `guide-happy`, `guide-thinking`, `guide-warn` |
| `badges/` | Значки-награды 120×136 | `first-experiment`, `powder-detective`, `safety-pro`, `observer`, `discoverer`, `solution-master` |
| `icons/` | Иконки 32×32 (57) и спрайт `sprite.svg` | действия, интерфейс, результаты `result-*` |
| `fx/` | Накладные спрайты эффектов | `steam`, `smell`, `sparkle`, `drop`, `pour-stream`, `powder-stream`, `crystal`, `heat-waves`, `frost`, `splash`, `fizz` |
| `lens/` | Вид в лупе, 4 узора | `lens-cubes`, `lens-crystals`, `lens-powder`, `lens-fine` |
| `brand/` | Знак логотипа | `logo-mark` |
| `manifest.json` | Список всех ассетов и подписи иконок | для проверки в CI и сборки |

Имя персонажа в файлах нейтральное (`guide-*`): если автор переименует проводника, файлы и код не меняются.

## Единый стиль

- **Контур:** `#16213F` (`--color-ink-900`), 4 единицы viewBox у оборудования и персонажа, 2–3 у мелких деталей. `stroke-linecap` и `stroke-linejoin` всегда `round`.
- **Сетка:** координаты кратны 2, крупные формы — 4. Оборудование рисуется в «натуральном» масштабе относительно друг друга: стакан 120×160, пробирка 48×184, колба 120×168. Поэтому в сцене их можно ставить с одним коэффициентом `--u` и они не спорят по размеру.
- **Стекло:** заливка `#EAF6FF` с `fill-opacity: .6` (можно переопределить `--glass-fill`). Жидкость рисуется под контуром стекла, блик — поверх всего.
- **Блик:** белая линия 5 единиц, `opacity .9`, в левой трети сосуда.
- **Плоские тени** не рисуются внутри ассетов. Тень на столе даёт вёрстка.
- **viewBox** плотно охватывает предмет с отступом 4 единицы на контур. У каждого SVG есть `width` и `height`, равные viewBox, — для подстраховки, в вёрстке размер задаётся CSS.
- **Доступность:** корневой `<svg>` имеет `role="img"`, `aria-label` и `<title>` на русском. Если рядом уже есть текст, при вставке ставьте `aria-hidden="true"` и убирайте `<title>`. Иконки по умолчанию `aria-hidden="true"`: смысл даёт подпись кнопки.

## Как вставлять

CSS-переменные **не проходят** внутрь `<img src="beaker.svg">` и CSS `background-image`. Ассеты с изменяемым состоянием (сосуды, тара, персонаж, термометр, pH-полоска) нужно вставлять **инлайном**: загрузить текст файла и положить в DOM.

При инлайновой вставке нескольких копий одного файла **переименуйте `id`** (`clipPath` и т. п.), иначе копии будут ссылаться на чужой `clipPath`. Пример — функция `inlineSvg()` в `design/tools/build-mockups-lib.mjs`: добавляет суффикс к каждому `id` и к ссылкам `url(#…)`.

Статичные иконки удобнее брать из спрайта:

```html
<svg class="hl-icon" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-heat"></use></svg>
```

Иконки рисуются `currentColor`: цвет задаётся свойством `color` у родителя. Вторичная заливка — тот же цвет с прозрачностью 0,18.

## Слои (`data-layer`) и переменные

Каждый слой, который может анимироваться или меняться, — отдельная группа `<g data-layer="…">`. Движок не трогает геометрию: он только задаёт CSS-переменные на корневом `<svg>` и добавляет классы эффектов (`fx-*`, см. `docs/design/05-effects.md`).

### Сосуды: `beaker`, `test-tube`, `flask`, `graduated-cylinder`, `evaporating-dish`

Порядок слоёв снизу вверх:

| Слой | Что это | Управляется |
| --- | --- | --- |
| `glass-back` | Заливка стекла | `--glass-fill` |
| `contents` | Всё содержимое, обрезано `clipPath` по внутреннему контуру | — |
| `liquid` | Жидкость. Сдвигается вниз на `(1 − level) × высота` | `--level` 0…1 |
| `liquid-body` | Тело жидкости | `--liquid-color`, `--liquid-opacity` (0,85) |
| `turbidity` | Муть (взвесь): белая вуаль + крупинки | `--turbidity` 0…1, `--turbidity-color` |
| `liquid-surface` | Светлая полоска поверхности | — |
| `foam` | Пена на поверхности | `--foam` 0…1 |
| `sediment` | Осадок на дне, растёт от дна вверх | `--sediment` 0…1, `--sediment-color` |
| `powder` | Горка сухого порошка | `--powder` 0…1, `--powder-color` |
| `bubbles` | Пузырьки (кружки `.hl-bubble` с `--i`, `--d`) | `--bubbles` 0…1 |
| `crystals` | Кристаллы (только выпарительная чашка) | `--crystals` 0…1, `--crystal-color` |
| `glass` | Контур стекла | — |
| `marks` | Деления | — |
| `shine` | Блик | — |

Атрибуты корня для движка: `data-fill-top` и `data-fill-bottom` — где в viewBox верх и низ «рабочего» объёма; `data-mouth="x,y"` — горлышко (куда целиться струёй); `data-base="x,y"` — точка опоры на столе. CSS-переменная `--fill-h` — высота рабочего объёма в единицах viewBox.

Пример:

```html
<svg class="hl-asset hl-asset--vessel fx-fizz" style="--level:.55; --liquid-color:#DCEFFB; --bubbles:1; --foam:.8">…</svg>
```

### Остальное оборудование

| Ассет | Слои | Переменные и атрибуты |
| --- | --- | --- |
| `spoon` | `body`, `powder`, `shine` | `--powder`, `--powder-color`; `data-tip` — центр черпака |
| `pipette` | `glass-back`, `contents/liquid`, `glass`, `bulb`, `drop`, `shine` | `--level`, `--liquid-color`, `--drop` (0/1), `--bulb-color`; `data-tip` |
| `stirrer` | `body`, `shine` | `data-tip`, `data-grip` |
| `scales` | `body` (в нём `display`), `shine` | `data-slot-display="x,y,w,h"` — куда класть HTML с числом |
| `burner` | `tripod`, `flame`, `lamp`, `gauze` (в нём `heat`) | `--flame` 0/1, `--heat` 0…1, `--fuel-color`; `data-anchor` — центр сетки, куда ставить сосуд |
| `ice-bath` | `back`, `front` | `--bath-water`; рисуется **дважды**: `back` под сосудом, `front` над ним (см. `.hl-ice` в `lab.css`) |
| `test-tube-rack` | `back`, `front` | то же: две копии, пробирки между ними; `data-slots` — x-центры гнёзд |
| `test-tube-holder` | `body`, `shine` | `data-clamp` — где зажата пробирка |
| `funnel` | `glass-back`, `stream`, `filter`, `contents/liquid`, `contents/residue`, `glass`, `drip`, `shine` | `--level`, `--flow`, `--drip`, `--residue`, `--residue-color`, `--liquid-color` |
| `magnet` | `body`, `shine` | `data-tip` |
| `magnifier` | `handle`, `lens`, `lens-content` (пустой, под `clipPath` линзы), `rim`, `shine` | `--handle-color`, `--lens-fill`; `data-lens="cx,cy,r"` |
| `thermometer` | `body`, `column`, `bulb`, `marks`, `shine` | `--temp` 0…1 (доля шкалы), `--thermo-color`; `data-scale="top,bottom"` |
| `ph-strip` | `body`, `pad`, `grip` | `--ph-color` (у сухой полоски `#F2C66D`) |

### Тара веществ

| Ассет | Слои | Переменные |
| --- | --- | --- |
| `jar` | `glass-back`, `contents/fill` (в нём `grain`), `glass`, `lid`, `label` (в нём `label-text`), `shine` | `--substance-color`, `--fill` 0…1, `--grain` 0/1, `--lid-color`, `--label-color` |
| `bottle` | `glass-back`, `contents/liquid`, `glass`, `cap`, `label`, `shine` | `--liquid-color`, `--level`, `--cap-color`, `--label-color` |
| `bag` | `body`, `window`, `top`, `label` | `--bag-color`, `--bag-fold`, `--substance-color`, `--clip-color`, `--label-color` |

`data-slot-label="x,y,w,h"` — прямоугольник этикетки в координатах viewBox. В него вёрстка кладёт HTML-текст (букву банки, короткое имя). Текст на этикетке — всегда HTML, не SVG-текст: так его читают скринридеры и переводит локализация.

Цвет крышки банки — не декорация: у каждого вещества свой цвет крышки, это вторая примета вещества на полке после имени (см. `SUB` в `design/tools/mockup-kit.mjs`).

### Персонаж `character/guide-*`

Слои: `stand`, руки (без группы, разные в каждой позе), `body` (в нём `liquid` с классом `hl-guide-liquid`), `stopper`, `face`, `goggles`, `fx` (искры, мысли — есть не во всех позах).

Переменные: `--guide-color` (жидкость-тело, по умолчанию `#8A6CF0`), `--guide-shade` (тень на дне). Позы — отдельные файлы: смена позы — это замена файла с кроссфейдом 160 мс, а не морфинг.

### Значки

Слои: `ribbon`, `medal`, `emblem`, `shine`. Неполученный значок — тот же файл с CSS-фильтром (`.hl-badge.is-locked`), отдельных серых файлов нет.

### Вид в лупе `lens/*`

Круг 120×120 с узором крупинок. Переменные: `--lens-bg` (фон, тёмный, чтобы белые крупинки читались), `--lens-grain` (цвет крупинок). Какой узор показать — поле вещества `lens: cubes | crystals | fine_powder | ultrafine_powder` из черновика урока 1 (`docs/content/lesson-01.md`, п. 8.1); соответствие: `cubes → lens-cubes`, `crystals → lens-crystals`, `fine_powder → lens-powder`, `ultrafine_powder → lens-fine`.

## Классы корня

- `hl-asset` — у всех ассетов.
- Тип: `hl-asset--vessel`, `--tool`, `--device`, `--container`, `--character`, `--badge`, `--lens`, `--brand`; у эффектов — `hl-fx`; у иконок — `hl-icon`.
- `data-asset="<имя>"` — имя ассета, удобно для тестов.

## Проверка в CI (рекомендация)

1. Каждый файл из `manifest.json` существует и начинается с `<svg`.
2. У сосудов есть все слои из таблицы выше (поиск `data-layer="…"`).
3. В файлах нет `<image`, `href="http`, `<script`, `<foreignObject`.
4. Все цвета, которые меняет движок, заданы через `var(--…, запасной)`.
