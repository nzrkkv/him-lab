# 04. Модель данных и движок реакций

Это ядро продукта. Здесь описано, как устроены данные (вещества, оборудование, действия, правила, эффекты, уроки, миссии, тесты, награды, прогресс) и как движок превращает действие ребёнка в честный химический результат.

Типы ниже — TypeScript-описание. В коде они выводятся из схем Zod (`src/core/content-model/`), а JSON Schema для подсказок в редакторе YAML генерируется из тех же схем. Значения в примерах — черновые: каждое число с пометкой «уточнить» проверяет химик (NFR-091).

## 1. Общие соглашения

```ts
type Id = string;                 // snake_case, уникален внутри вида сущности
type SpeciesId = Id;              // частица: 'sodium_bicarbonate'
type SubstanceId = Id;            // вещество на полке: 'baking_soda'
type ClassId = Id;                // класс: 'acid', 'carbonate_like'
type TokenRef = `color.${string}`;   // путь токена дизайна: 'color.substance.iodine-starch'
type AssetRef = string;           // путь ассета без расширения: 'equipment/test-tube'
type IconId = string;             // имя иконки из manifest.json: 'result-gas'
type SourceRef = Id;              // ссылка на content/sources.yaml

/** Человеческий текст. ru обязателен, остальные языки — по мере перевода. */
type Text = LocalizedString | LocalizedPlural;
interface LocalizedString { ru: string; en?: string }
interface LocalizedPlural { ru: PluralForms; en?: PluralForms }
interface PluralForms { one: string; few?: string; many?: string; other: string } // '{count} порция'

interface Review {
  status: 'draft' | 'self_checked' | 'chemist_approved';
  reviewer?: string;              // роль или инициалы, без персональных данных детей
  date?: string;                  // ISO-дата
  notes?: string;                 // что проверить
}
```

Правила для текстов:
- Разметка внутри `Text` — только `**жирный**` и переносы строк. HTML запрещён, рендер безопасный.
- Базовые тексты для ребёнка — короткие фразы, без формул и уравнений, обращение на «ты» без грамматического рода.
- Формулы хранятся ASCII-строкой (`NaHCO3`, `CH3COOH`), вид с индексами (NaHCO₃) получается при показе.

## 2. Химия: классы, частицы, вещества

### 2.1. Классы (`content/chem/classes.yaml`)

Класс — тег, по которому правила находят вещества. Классы бывают составными: `carbonate_like` включает `carbonate` и `bicarbonate`.

```ts
interface ChemClass {
  id: ClassId;
  name: Text;               // для отчётов и продвинутого режима
  includes?: ClassId[];     // составной класс
  description?: Text;
}
```

Классы MVP: `water`, `acid`, `weak_acid`, `base`, `weak_base`, `carbonate`, `bicarbonate`, `carbonate_like`, `salt`, `sugar`, `starch`, `iodine`, `indicator`, `soluble`, `insoluble`, `volatile`, `oxidizer`, `metal`, `magnetic`, `chlorine_cleaner` (только для стоп-правил модуля 8), `heat_stable`.

### 2.2. Частица (`Species`, `content/chem/species/*.yaml`)

Частица — химическое вещество, с которым работает движок. У неё есть всё, что нужно и детскому, и продвинутому режиму.

```ts
interface Species {
  id: SpeciesId;
  formula: string;                        // 'NaHCO3'; для полимеров '(C6H10O5)n'
  molarMass: number | null;               // г/моль; null для полимеров и смесей
  classes: ClassId[];
  stateAt20C: 'solid' | 'liquid' | 'gas';
  density?: number;                       // г/мл, для жидкостей
  names: { scientific: Text; trivial?: Text };

  solubility?: {                          // в воде, г на 100 г воды
    table: Array<[tempC: number, gPer100g: number]>;   // линейная интерполяция
    dissolution: { rate: 'fast' | 'medium' | 'slow'; stirsToDissolve: number };
  };
  insolubleBehavior?: {                   // если не растворяется
    form: 'suspension' | 'sediment';      // крахмал и мел — взвесь; песок — сразу на дно
    settleTimeS: number;                  // время оседания (время опыта)
    turbidityPerGPerMl: number;           // насколько мутнеет вода
  };

  appearance: {
    powderColor?: TokenRef;               // цвет порошка и осадка
    solutionColor?: TokenRef;             // цвет в растворе (если окрашен)
    tintStrength?: number;                // сила окраски, 0 — бесцветный
    magnifierView?: 'cubes' | 'crystals' | 'fine_powder' | 'ultrafine_powder';  // → lens-cubes, lens-crystals, lens-powder, lens-fine
  };

  odor?: { kind: 'sharp_sour' | 'caramel' | 'burnt' | 'toasted' | 'none'; volatile: boolean; text: Text };

  thermal?: {
    meltC?: number; boilC?: number; decomposeC?: number;
    specificHeatJPerGK: number;           // для модели нагрева
  };

  acidBase?: {
    role: 'acid' | 'base' | 'amphiprotic' | 'neutral';
    pKa?: number[];                       // для кислот и амфолитов
    pKb?: number;                         // для слабых оснований
    equivalentsPerMol?: number;           // сколько H+ отдаёт или принимает
  };

  indicator?: {                           // для индикаторов
    colors: Array<{ phMax: number; color: TokenRef; name: Text }>;  // по возрастанию phMax
  };

  hazard: 'none' | 'low' | 'caution' | 'high';
  discoverable?: { cardId: Id };          // «Открытие!» в песочнице (FR-035)
  sources: SourceRef[];
  review: Review;
}
```

Пример (`species/sodium_bicarbonate.yaml`):

```yaml
id: sodium_bicarbonate
formula: NaHCO3
molarMass: 84.01
classes: [bicarbonate, salt, weak_base, soluble]
stateAt20C: solid
names:
  scientific: { ru: "гидрокарбонат натрия" }
  trivial: { ru: "питьевая сода, бикарбонат натрия" }
solubility:
  table: [[0, 6.9], [20, 9.6], [40, 12.7], [60, 16.4]]
  dissolution: { rate: medium, stirsToDissolve: 3 }
appearance:
  powderColor: color.substance.powder-soda
  magnifierView: fine_powder
thermal:
  decomposeC: 50          # медленно выше ~50 °C, заметно от ~80–100 °C, быстро около 200 °C
  specificHeatJPerGK: 1.0
acidBase: { role: amphiprotic, pKa: [6.35, 10.33] }
hazard: none
sources: [wiki_sodium_bicarbonate, sciencemadness_nahco3]
review: { status: self_checked, notes: "Проверить порог заметного разложения сухой соды над горелкой" }
```

### 2.3. Вещество на полке (`Substance`, `content/chem/substances/*.yaml`)

То, что ребёнок видит и берёт. Чистое вещество состоит из одной частицы; раствор («уксус», «раствор йода», «отвар капусты») — из нескольких.

```ts
interface Substance {
  id: SubstanceId;
  name: Text;                             // 'Пищевая сода'
  scientificName: Text;                   // 'гидрокарбонат натрия' — бонус-чип
  availability: 'home' | 'lab_only';      // значок «домик» или «экран с колбой» (FR-025)
  safeForHome: boolean;                   // можно в «попробуй дома» (NFR-092)
  container: 'jar' | 'bottle' | 'bag';    // ассет design/assets/containers/*
  form: 'powder' | 'crystals' | 'liquid' | 'solution' | 'pieces';
  composition: Array<{ species: SpeciesId; massFraction: number }>;  // сумма = 1
  density?: number;                       // г/мл для жидкостей
  dosing: 'portion_solid' | 'portion_liquid' | 'drop';   // как отмеряется по умолчанию
  tools: Array<'spoon' | 'pour' | 'pipette'>;
  card: {
    looks: Text;                          // 'Мелкий белый матовый порошок'
    properties: Text[];
    foundAt: Text;
    warning?: Text;                       // 'Уксусная эссенция — не уксус для опытов'
    adult: Text;                          // для взрослых, с формулой
  };
  tags?: ClassId[];
  hazard: { level: 'none' | 'low' | 'caution' | 'lab_only_hazard'; note?: Text };
  sources: SourceRef[];
  review: Review;
}
```

Вещества прототипа и их состав:

| `SubstanceId` | Название | Пометка | Состав (массовые доли, черновик) | Частицы и классы |
| --- | --- | --- | --- | --- |
| `water` | Вода | дом | `water` 1.0 | `water` |
| `table_salt` | Соль поваренная | дом | `sodium_chloride` 1.0 | `salt`, `soluble`, `heat_stable` |
| `sugar` | Сахар (сахарный песок) | дом | `sucrose` 1.0 | `sugar`, `soluble` |
| `baking_soda` | Пищевая сода | дом | `sodium_bicarbonate` 1.0 | `bicarbonate`, `weak_base`, `soluble` |
| `vinegar` | Столовый уксус 9 % | дом | `acetic_acid` 0.09, `water` 0.91; плотность 1.01 | `acid`, `weak_acid`, `volatile` |
| `starch` | Крахмал картофельный | дом | `starch` 1.0 | `starch`, `insoluble` |
| `chalk` | Мел природный | дом, с оговоркой про гипсовые мелки | `calcium_carbonate` 1.0 (упрощение: 90–98 % CaCO₃) | `carbonate`, `insoluble`, `heat_stable` |
| `iodine_solution` | Раствор йода | только в лабе | `iodine` 0.01, `potassium_iodide` 0.02, `water` 0.97 (уточнить) | `iodine` |
| `red_cabbage_extract` | Отвар краснокочанной капусты | дом (готовит взрослый) | `cabbage_anthocyanins` 0.001, `water` 0.999 | `indicator` |
| `sand` | Песок | дом | `silicon_dioxide` 1.0 | `insoluble`, `heat_stable` |

### 2.4. Количества: порции сейчас, моли потом

Внутри движка все количества — **граммы** по каждой частице. Порции — только способ показа и ввода (`content/chem/dosing.yaml`):

| Единица | Значение | Источник |
| --- | --- | --- |
| `portion_solid` (ложечка) | 0,2 г | урок 1, раздел 4.5 |
| `portion_liquid` | 5 мл | урок 1, раздел 4.5 |
| `drop` (пипетка) | 0,05 мл | стандартная капля |

Жидкость переводится в граммы через плотность вещества, затем раскладывается на частицы по `composition`. Пример: 1 порция уксуса = 5 мл × 1,01 г/мл = 5,05 г → 0,455 г уксусной кислоты (7,57 ммоль) + 4,60 г воды.

Почему граммы, а не «порции»:
- насыщение считается по настоящей растворимости (г на 100 г воды) — и совпадает с расчётом урока 1: на 2 порции воды (10 г) растворяется около 5 порций соды (0,96 г), 18 порций соли (3,6 г), 100 порций сахара (20 г);
- избыток считается по стехиометрии в молях: 1 порция уксуса (7,57 ммоль) нейтрализует около 3 порций соды (2,38 ммоль на порцию), поэтому «1 порция уксуса на 5 порций соды» оставляет соду на дне;
- продвинутый режим получает моли (`grams / molarMass`) и концентрации (`моль / л раствора`) без смены модели; меняется только интерфейс ввода и вывода.

## 3. Оборудование и действия

### 3.1. Оборудование (`content/chem/equipment.yaml`)

```ts
interface Equipment {
  id: Id;                                  // 'test_tube'
  asset: AssetRef;                         // 'equipment/test-tube'
  name: Text;
  kind: 'vessel' | 'tool' | 'station' | 'fixture';
  capacityMl?: number;                     // для сосудов
  heatable?: boolean;
  needsHolderForHeat?: boolean;            // пробирка — да
  supports: ActionId[];                    // какие действия можно делать с ним или над ним
  firstUseTip?: Text;                      // 'Пипетка набирает жидкость и капает по капле'
  card: Text;                              // карточка в коллекции
}
```

| ID | Ассет | Вид | Вместимость | Особенности |
| --- | --- | --- | --- | --- |
| `test_tube` | `test-tube` | vessel | 20 мл (до 4 порций воды) | нагрев только в держателе |
| `beaker` | `beaker` | vessel | 200 мл | на горелке через сетку |
| `flask` | `flask` | vessel | 100 мл | |
| `graduated_cylinder` | `graduated-cylinder` | vessel | 50 мл | показывает объём |
| `evaporating_dish` | `evaporating-dish` | vessel | 30 мл | выпаривание |
| `test_tube_rack` | `test-tube-rack` | fixture | — | слоты для пробирок |
| `spoon` | `spoon` | tool | — | `add` порошков |
| `pipette` | `pipette` | tool | — | `add` каплями |
| `stirrer` | `stirrer` | tool | — | `stir` |
| `magnifier` | `magnifier` | tool | — | `magnify` |
| `thermometer` | `thermometer` | tool | — | `measure_temperature` |
| `ph_strip` | `ph-strip` | tool | — | `measure_ph` |
| `magnet` | `magnet` | tool | — | `magnet` |
| `funnel_filter` | `funnel` | tool | — | `filter` |
| `burner` | `burner` | station | — | `heat` |
| `ice_bath` | `ice-bath` | station | — | `cool` |
| `scales` | `scales` | station | — | `weigh` |
| `tube_holder` | `test-tube-holder` | tool | — | обязателен для нагрева пробирки |
| `sink` | (нужен ассет) | fixture | — | `clear`, мытьё рук |
| `fume_hood` | (нужен ассет) | fixture | — | включается правилами |

### 3.2. Действия (`content/chem/actions.yaml`)

```ts
type ActionId =
  | 'add' | 'pour' | 'stir' | 'heat' | 'cool' | 'wait' | 'filter' | 'evaporate'
  | 'smell' | 'magnify' | 'measure_temperature' | 'measure_ph' | 'weigh' | 'magnet'
  | 'clear' | 'undo';

interface ActionDef {
  id: ActionId;
  icon: IconId;                 // 'stir', 'heat', 'temperature', 'ph'… из manifest.json
  label: Text;
  hotkey?: string;              // показывается в hl-act__key
  tool?: Id;                    // нужное оборудование
  targets: Array<'vessel' | 'jar'>;
  firstUseTip?: Text;
}
```

Действия движка (то, что приходит в `step`):

```ts
type LabAction =
  | { type: 'place'; equipmentId: Id; slot: SlotId }                       // поставить сосуд
  | { type: 'remove'; vesselId: VesselId }
  | { type: 'add'; vesselId: VesselId; substanceId: SubstanceId; amount: Dose }
  | { type: 'pour'; from: VesselId; to: VesselId; amount: Dose | 'all' }
  | { type: 'stir'; vesselId: VesselId }
  | { type: 'attach_holder'; vesselId: VesselId } | { type: 'detach_holder'; vesselId: VesselId }
  | { type: 'heat_start'; vesselId: VesselId } | { type: 'heat_stop'; vesselId: VesselId }
  | { type: 'cool_start'; vesselId: VesselId } | { type: 'cool_stop'; vesselId: VesselId }
  | { type: 'tick'; seconds: number }                // время идёт: удержание нагрева, идущие процессы
  | { type: 'wait'; seconds?: number }               // «подождать», по умолчанию physics.waitStepS
  | { type: 'filter'; from: VesselId; to: VesselId }
  | { type: 'evaporate'; vesselId: VesselId }        // макрос: перелить в чашку и греть до сухого остатка
  | { type: 'smell'; vesselId: VesselId }
  | { type: 'magnify'; target: { vesselId: VesselId } | { substanceId: SubstanceId } }
  | { type: 'measure_temperature'; vesselId: VesselId }
  | { type: 'measure_ph'; vesselId: VesselId }
  | { type: 'weigh'; vesselId: VesselId }
  | { type: 'magnet'; vesselId: VesselId }
  | { type: 'clear'; vesselId: VesselId }
  | { type: 'return_to_jar'; vesselId: VesselId; substanceId: SubstanceId };  // всегда блокируется (FR-024)

type Dose = { unit: 'portion_solid' | 'portion_liquid' | 'drop'; count: number }; // count 1..10
```

`undo` — не действие движка: интерфейс хранит до 20 прошлых состояний (они неизменяемые) и просто возвращает предыдущее.

## 4. Состояние лаборатории

### 4.1. Фазы и содержимое сосуда

```ts
type Phase =
  | 'solid'        // сухой порошок или нерастворившийся растворимый порошок на дне
  | 'dissolved'    // в растворе
  | 'suspended'    // взвесь: вода мутная
  | 'sediment'     // осевшее нерастворимое
  | 'liquid'       // жидкость (вода, уксусная кислота в чистом виде)
  | 'melt'         // расплав (сахар)
  | 'gel';         // клейстер (крахмал в горячей воде)

type Contents = Readonly<Record<SpeciesId, Readonly<Partial<Record<Phase, number>>>>>; // граммы

interface VesselState {
  readonly id: VesselId;                   // 'v1', 'v2'… выдаются по порядку
  readonly equipmentId: Id;
  readonly capacityMl: number;
  readonly contents: Contents;
  readonly temperatureC: number;
  readonly heat: { source: 'none' | 'burner' | 'ice_bath'; inHolder: boolean };
  readonly stirsSinceChange: number;       // перемешивания после последнего добавления
  readonly secondsSinceChange: number;     // время с последнего изменения состава
  readonly processes: readonly ActiveProcess[];
  readonly origins: Readonly<Record<SpeciesId, readonly SubstanceId[]>>;  // откуда частица — для подписи «уксус»
  readonly indicatorPhBand?: number;       // последний показанный цвет индикатора
  readonly flags: { overflowed?: true; charred?: true; dirty?: true };
}

interface ActiveProcess {
  readonly ruleId: Id;
  readonly variantId?: Id;
  readonly progress: number;               // 0..1
  readonly durationS: number;
  readonly bindings: Readonly<Record<string, SpeciesId>>;
}
```

Газ в состоянии не хранится: выделившийся газ уходит из открытого сосуда, его объём попадает в событие (для пены и продвинутого режима).

### 4.2. Состояние лабы

```ts
interface LabState {
  readonly timeS: number;                  // время опыта
  readonly vessels: Readonly<Record<VesselId, VesselState>>;
  readonly layout: {
    readonly slots: readonly (VesselId | null)[];
    readonly stations: { burner: VesselId | null; iceBath: VesselId | null; scales: VesselId | null };
  };
  readonly fumeHoodOn: boolean;
  readonly mode: 'kids' | 'advanced';
  readonly available: { substances: readonly SubstanceId[]; equipment: readonly Id[]; actions: readonly ActionId[] };
  readonly nextVesselNo: number;
}
```

Состояние полностью сериализуется в JSON (для отмены, тестов и, при желании, сохранения стола).

### 4.3. Физическая модель (параметры — `content/chem/physics.yaml`)

| Параметр | Значение (черновик) | Смысл |
| --- | --- | --- |
| `ambientC` | 20 | комнатная температура |
| `burnerPowerW` | 40 | условная мощность горелки, передаваемая сосуду |
| `heatTimeScale` | 5 | время опыта при нагреве идёт в 5 раз быстрее реального, чтобы ребёнок не ждал минуту |
| `dryMaxC` | 300 | предел нагрева сухого содержимого |
| `iceBathC` | 1 | к чему стремится ледяная баня |
| `coolingPerS` | 0.02 | доля разницы с окружающей средой, теряемая за секунду (закон Ньютона) |
| `waitStepS` | 60 | шаг «подождать» |
| `tickS` | 0.5 | шаг времени движка при удержании нагрева |
| `aqueousMinWaterG` | 2 | меньше 2 г воды — среда «сухая» (капля йода на порошке — сухо) |
| `latentHeatWaterJPerG` | 2260 | на выкипание |
| `waterSpecificHeat` | 4.18 | Дж/(г·К) |

Температура:
- На горелке: `ΔT = burnerPowerW × dt / Σ(mᵢ·cᵢ)`. Пока в сосуде есть жидкая вода, температура не поднимается выше 100 °C: лишняя энергия уходит на выкипание (`Δm = энергия / 2260`).
- В ледяной бане и без источника: `T ← T + (Tцели − T) × coolingPerS × dt`.
- Тепловой эффект реакции — параметр варианта правила (`heatJPerMol`, для детского режима откалиброван по наблюдаемому эффекту).

### 4.4. Растворение, насыщение, избыток

- Предел растворения частицы: `maxDissolved = solubility(T) × mводы / 100`, где `solubility(T)` — линейная интерполяция таблицы.
- Скорость: без перемешивания растворяется доля `rateNoStir × dt/60` (быстро — 50 % за минуту, средне — 15 %, медленно — 5 %); после `stirsToDissolve` перемешиваний — всё, что помещается до предела.
- Если растворимое вещество не помещается — излишек остаётся фазой `solid` на дне, движок выдаёт наблюдение «насыщение» (FR-036).
- При остывании, если `dissolved > maxDissolved`, излишек выпадает кристаллами (модуль 4, правило `crystallize_on_cooling`).
- Избыток реагента: реакция идёт до исчерпания ограничивающего реагента по стехиометрии в молях; остаток остаётся в сосуде.

### 4.5. pH (упрощённая модель MVP)

pH нужен для индикаторов и pH-полоски. MVP считает его по таблице случаев — это упрощение, а не искажение: результат совпадает с реальностью с точностью до полосы цвета индикатора.

| Что в растворе | Формула | Пример |
| --- | --- | --- |
| Только вода | 7 | вода |
| Слабая кислота, концентрация C | `pH = ½·(pKa − lg C)` | уксус 9 % (C ≈ 1,5 моль/л) → около 2,3; в реальности 2,4–2,6 |
| Слабая кислота и её соль | `pH = pKa + lg(Cсоли / Cкислоты)` | уксус в избытке после соды → 4–5 |
| Амфолит (гидрокарбонат) | `pH = ½·(pKa₁ + pKa₂)` | раствор соды → около 8,3 |
| Слабое основание (карбонат) | `pOH = ½·(pKb − lg C)` | кальцинированная сода → около 11 |
| Соль сильной кислоты и сильного основания | 7 | раствор соли |

Если в растворе есть и кислота, и основание, сначала срабатывают правила нейтрализации, а pH считается по тому, что осталось. Продвинутый режим (после MVP) заменит таблицу расчётом равновесий.

### 4.6. Наблюдения и события

Типы наблюдений совпадают с иконками `result-*` в `design/assets/manifest.json`:

```ts
type ObservationKind =
  | 'gas' | 'precipitate' | 'color' | 'dissolve' | 'warm' | 'cold' | 'foam'
  | 'steam' | 'smell' | 'crystals' | 'melt' | 'turbid' | 'nothing';

type ObservationDetail =       // уточнение для выбора эффекта и текста
  | 'saturated' | 'settled' | 'boiling' | 'droplets_on_walls' | 'crackle' | 'char'
  | 'thicken' | 'fade' | 'overflow' | 'caramel' | 'clearing';

type Intensity = 'weak' | 'medium' | 'strong';

type EngineEvent =
  | { type: 'observation'; vesselId: VesselId; kind: ObservationKind; detail?: ObservationDetail;
      intensity: Intensity; ruleId: Id; variantId?: Id; params?: ObservationParams }
  | { type: 'nothing_happened'; vesselId: VesselId; action: LabAction['type']; reasonId: Id }
  | { type: 'safety_stop'; vesselId?: VesselId; hazardRuleId: Id }
  | { type: 'blocked'; reason: BlockReason; vesselId?: VesselId }
  | { type: 'measurement'; vesselId: VesselId; quantity: 'temperature' | 'ph' | 'mass'; value: number }
  | { type: 'magnified'; view: 'cubes' | 'crystals' | 'fine_powder' | 'ultrafine_powder' | 'liquid' | 'mixed'; vesselId?: VesselId; substanceId?: SubstanceId }
  | { type: 'smelled'; vesselId: VesselId; odor: Id | 'none' }
  | { type: 'fume_hood'; on: boolean }
  | { type: 'discovery'; speciesId: SpeciesId; cardId: Id }
  | { type: 'process'; vesselId: VesselId; ruleId: Id; phase: 'started' | 'finished' };

type BlockReason =
  | 'needs_holder' | 'capacity' | 'no_return_to_jar' | 'not_available'
  | 'empty_vessel' | 'needs_liquid' | 'station_busy';

interface ObservationParams {
  gasMl?: number;          // объём газа — для пены и продвинутого режима
  colorFrom?: TokenRef; colorTo?: TokenRef;
  deltaC?: number;
}

interface StepResult {
  readonly state: LabState;
  readonly events: readonly EngineEvent[];
  readonly wakeAfterS?: number;   // идут процессы — интерфейс пришлёт tick через это время
}
```

### 4.7. Визуальное состояние сосуда (`deriveVisual`)

Отдельная чистая функция переводит состояние сосуда в значения переменных SVG из контракта дизайна (`03-architecture.md`, раздел 10.2):

```ts
interface VesselVisual {
  level: number;              // --level: объём жидкости / вместимость
  liquidColor: string;        // --liquid-color: смешивание окрашенных частиц в OKLab по концентрации × tintStrength; индикатор — по pH
  turbidity: number;          // --turbidity: взвесь, г/мл × turbidityPerGPerMl, 0..1
  turbidityColor: string;     // --turbidity-color: цвет взвешенной частицы (крахмал — белый, комплекс с йодом — тёмно-синий)
  sediment: number;           // --sediment
  sedimentColor: string;
  powder: number;             // --powder: сухое содержимое
  powderColor: string;
  bubbles: number;            // --bubbles: интенсивность идущего газового процесса
  foam: number;               // --foam
  crystals: number;           // --crystals (выпарительная чашка)
  crystalColor: string;
  steam: boolean; smoke: boolean;
}
```

Цвета берутся из токенов: например, `color.substance.iodine-starch` для комплекса крахмала с йодом, `color.ph-cabbage.*` для индикатора.

## 5. Правила и алгоритм

### 5.1. Схема правила (`content/chem/rules/*.yaml`)

```ts
interface Rule {
  id: Id;
  kind: 'reaction' | 'physical' | 'indicator' | 'sensory' | 'hazard_stop';
  priority: number;              // 1000 — стоп-правила; 500 — конкретные; 100 — по классам; 10 — общие физические
  group?: Id;                    // из группы применяется только одно правило с наивысшим приоритетом
  when: RuleCondition;
  variants?: RuleVariant[];      // для правил по классам: стехиометрия конкретной пары
  effect: RuleEffect;
  observe: ObservationSpec[];    // что увидит ребёнок
  text: {
    what: Text;                  // 'Бурное шипение, пена'
    why: Text;                   // для ребёнка, коротко
    deeper?: Text;               // «копнуть глубже»
    adult: Text;                 // для взрослых
    wordEquation?: Text;         // 'кислота + карбонат → соль + вода + углекислый газ'
  };
  equation: Equation;            // общий вид; у вариантов — конкретные уравнения
  onceLine?: Text;               // реплика проводника один раз за миссию
  sources: SourceRef[];
  review: Review;
}

interface RuleCondition {
  trigger?: 'state' | LabAction['type'][];   // по умолчанию 'state': проверяется после любого действия
  reactants: ReactantPattern[];
  absent?: MatchSpec[];                      // чего не должно быть
  medium?: 'aqueous' | 'dry' | 'any';
  temperature?: { minC?: number; maxC?: number };
  holdS?: number;                            // сколько секунд условие держится (стадии нагрева)
  stirred?: { minCount: number };
  heatSource?: 'burner' | 'ice_bath';
  ph?: { min?: number; max?: number };
  ratio?: { of: string; to: string; basis: 'mol' | 'g'; min?: number; max?: number };
  catalyst?: MatchSpec[];                    // присутствует, но не расходуется
}

interface ReactantPattern {
  bind: string;                              // имя привязки: 'A', 'acid', 'carbonate'
  match: MatchSpec;
  phases?: Phase[];                          // по умолчанию любые, кроме 'gas'
  minGrams?: number;                         // по умолчанию 0.001
}
interface MatchSpec { species?: SpeciesId; class?: ClassId; notClass?: ClassId[] }

interface RuleVariant {
  id: Id;
  bind: Record<string, SpeciesId>;           // конкретные частицы для привязок
  stoichiometry?: {
    reactants: Array<{ bind: string; coeff: number }>;
    products: Array<{ species: SpeciesId; coeff: number; phase: Phase | 'gas' }>;
  };
  kinetics?: { mode: 'instant' | 'over_time'; durationS?: number };
  intensity?: Intensity;
  heatJPerMol?: number;                      // > 0 — поглощает тепло (холодно), < 0 — выделяет
  foamMlPerMlGas?: number;                   // для расчёта пены и перелива
  equation: Equation;
  textOverride?: Partial<Rule['text']>;      // если у пары своё объяснение
}

type RuleEffect =
  | { type: 'react' }                                        // по стехиометрии варианта
  | { type: 'dissolve' } | { type: 'suspend' } | { type: 'settle' }
  | { type: 'phase_change'; bind: string; from: Phase; to: Phase }
  | { type: 'transform'; bind: string; to: SpeciesId; toPhase: Phase }   // сахар → карамель
  | { type: 'evaporate_water' }
  | { type: 'indicator' }                                    // цвет по pH, состав не меняется
  | { type: 'observe_only'; fumeHood?: boolean }             // запах сильнее, вытяжка
  | { type: 'stop' };                                        // только для hazard_stop

type Equation =
  | { type: 'chemical'; text: string }       // 'NaHCO3 + CH3COOH -> CH3COONa + H2O + CO2^'
  | { type: 'physical'; note: Text }         // растворение, кипение, клейстеризация
  | { type: 'complex'; note: Text };         // карамелизация, комплекс крахмала с йодом

interface ObservationSpec { kind: ObservationKind; detail?: ObservationDetail; intensity?: Intensity | 'from_variant' }
```

Объяснения «почему ничего не произошло» (`content/chem/no-reaction.yaml`):

```ts
interface NoReaction {
  id: Id;
  when: { reactants: ReactantPattern[]; trigger?: LabAction['type'][]; medium?: 'aqueous' | 'dry' | 'any' };
  observe?: ObservationSpec[];   // например, цвет йода на соли
  text: { why: Text; deeper?: Text; adult: Text };
  priority: number;
}
```

### 5.2. Алгоритм шага

```text
step(state, action, index) → { state', events, wakeAfterS }

1. ПРОВЕРКА ДЕЙСТВИЯ
   - вещество и оборудование доступны? сосуд существует? вместимость?
   - процедурные правила: пробирка на горелке только в держателе;
     return_to_jar всегда блокируется
   → если нельзя: вернуть state без изменений + событие blocked(reason)

2. ФИЗИЧЕСКОЕ ДЕЙСТВИЕ → prospective
   - add/pour: перенести частицы (порции → граммы → частицы по composition);
     у порошка в жидкости фаза solid; stirsSinceChange = 0, secondsSinceChange = 0
   - stir: stirsSinceChange += 1
   - heat/cool start/stop: изменить источник
   - tick/wait: timeS += dt; температура по модели; продвинуть процессы
   - filter, evaporate, clear, measure, smell, magnify: свои операции

3. СТОП-ПРАВИЛА (kind = hazard_stop) на prospective
   → если сработало хотя бы одно: вернуть ИСХОДНЫЙ state + safety_stop(первое по сортировке)
     (опыт не выполняется, рецепта нет: только текст правила)

4. ЦИКЛ ПРАВИЛ ДО УСТОЙЧИВОГО СОСТОЯНИЯ (не больше MAX_PASSES = 10 проходов)
   for pass in 1..MAX_PASSES:
     candidates = кандидаты из индекса по частицам сосуда (класс → частицы)
     matches    = для каждого правила все привязки, где выполнены все условия
     sort(matches) по: priority ↓, specificity ↓, rule.id ↑, привязки ↑ (по id частиц)
     оставить в каждой group только первое совпадение
     changed = false
     for m in matches:
        (s, ev, didChange) = apply(s, m)       // по effect и variant
        events += ev; changed ||= didChange
     if not changed: break
   если упёрлись в MAX_PASSES → событие engine_error (тесты падают: ошибка контента)

5. «НИЧЕГО НЕ ПРОИЗОШЛО»
   если действие — опыт (add, pour, stir, heat, cool, wait, smell, magnet)
   и нет ни одного наблюдения:
     найти NoReaction с наибольшим приоритетом для частиц сосуда и действия
     → nothing_happened(reasonId); иначе общий текст по действию (nothing_generic_<action>)

6. ИТОГИ
   - открытия: новые частицы с discoverable → discovery
   - wakeAfterS = минимальное оставшееся время идущих процессов
   - события дедуплицируются (одно наблюдение одного вида на сосуд за шаг)
```

Специфичность совпадения: конкретная частица в шаблоне — 3 очка, класс — 1, каждое дополнительное условие (температура, перемешивание, pH, соотношение, отсутствие) — 1.

Правила обязаны быть **самоограничивающимися**: после применения их условия перестают выполняться (реакция израсходовала реагент, растворение дошло до предела, индикатор записал полосу pH). Валидатор и свойства-тесты проверяют, что повторный шаг `tick 0` не меняет состояние.

### 5.3. Детерминированность

- Движок не обращается ко времени, случайности и DOM (правило линтера для `src/core/`).
- Порядок обхода — всегда отсортированный: частицы по `id`, правила по ключу сортировки, сосуды по номеру.
- Числа округляются до 1e-6 г после каждой операции, чтобы накопление ошибок не меняло ветвление.
- Время задаёт только интерфейс через `tick` и `wait`, шаг `tickS` фиксирован. Удержание кнопки «нагреть» превращается в последовательность одинаковых `tick`, поэтому тест воспроизводит её точно.
- Случайность нужна только миссии (буквы банок) — генератор по зерну (`mulberry32(seed)`) в `core/util`, зерно хранится в прогрессе.

### 5.4. Конкурирующие реакции

Если один реагент подходит нескольким правилам (уксус в пробирке, где есть и сода, и мел), совпадения применяются по порядку сортировки: сначала правило с более высоким приоритетом, затем — по `id` частиц. Каждое следующее видит уже уменьшенное количество общего реагента. Порядок задокументирован и покрыт тестом; для ребёнка результат одинаков: шипят оба.

### 5.5. Опасные сочетания

- Стоп-правило (`kind: hazard_stop`, приоритет 1000) проверяется **до** применения действия к состоянию.
- Текст — дружелюбное объяснение правила безопасности, без названий опасных продуктов, количеств и условий (NFR-092). Линтер безопасности проверяет каждый текст стоп-правила.
- В детском режиме опасные бытовые вещества не попадают на полку. Стоп-правила нужны для процедурных ошибок (нагрев йода без воды) и для будущих модулей (модуль 8 «Химия в жизни»: средства с хлором и кислоты — только как предупреждение).

## 6. Примеры правил на веществах прототипа

Вещества: вода, соль, сахар, пищевая сода, уксус, крахмал, раствор йода, мел, отвар краснокочанной капусты. Тексты для ребёнка взяты из урока 1 (`docs/content/lesson-01.md`, раздел 4.6) или написаны в его стиле. Все значения требуют проверки химиком.

### 6.1. Сводная таблица

| № | ID | Вид | Условие | Результат (наблюдение) | Уравнение |
| --- | --- | --- | --- | --- | --- |
| R01 | `dissolve_soluble` | physical | `soluble` в фазе `solid` + вода (`aqueous`), раствор не насыщен | растворение до предела: `dissolve`; скорость по `dissolution` (соль, сахар — сразу после перемешивания; сода — после 3 перемешиваний) | физическое |
| R02 | `saturated_solution` | physical | `soluble` в фазе `solid` + вода, раствор насыщен | остаток на дне: `dissolve`/`saturated`; «Соды многовато для такой порции воды» | физическое |
| R03 | `suspend_insoluble` | physical | `insoluble` с `form: suspension` в фазе `solid` + вода | взвесь: `turbid`; «Вода белая и мутная, как молоко» | физическое |
| R04 | `settle_suspension` | physical | взвесь + прошло время (`wait`) | муть уменьшается, растёт осадок: `turbid`/`settled` | физическое |
| R05 | `acid_carbonate_gas` | reaction | `acid` (dissolved/liquid) + `carbonate_like` (любая фаза) | `gas` + `foam` (+ `cold` для соды); сода — бурно и быстро, мел — спокойно и дольше, взвесь мела светлеет | варианты: см. 6.2 |
| R06 | `starch_iodine_complex` | reaction | `starch` (любая фаза) + `iodine` (dissolved), T < 60 °C (уточнить) | `color` → тёмно-синий (`color.substance.iodine-starch`); на взвеси синеет вся смесь | комплекс включения амилоза–полииодид |
| R07 | `starch_iodine_fade` | reaction | частица `starch_iodine_complex` + T ≥ 60 °C (уточнить) | `color`/`fade`: синева пропадает; при остывании R06 возвращает синеву | комплекс, обратимо |
| R08 | `cabbage_indicator` | indicator | `indicator` (dissolved) + полоса pH изменилась | `color`: pH ≤ 3 — красно-розовый (`ph-cabbage.2`), 4–5 — розово-фиолетовый (`.4`), 6–7 — фиолетовый (`.6`, `.7`), 8–9 — синий (`.8`), 10–11 — сине-зелёный (`.10`), 12 — зелёный (`.12`), 13–14 — жёлтый (`.13`) | физическое (смена окраски индикатора) |
| R09 | `bicarbonate_thermal_decomposition` | reaction | `sodium_bicarbonate` (solid, `dry`) + нагрев, T ≥ 100 °C (заметно; медленно с 50 °C) | `steam`/`droplets_on_walls` + слабый `gas`; порошок остаётся белым; частица меняется на `sodium_carbonate` (скрыто) | `2NaHCO3 -> Na2CO3 + H2O + CO2^` |
| R10 | `sugar_melt` → `sugar_caramelize` → `sugar_char` | reaction (группа `sugar_heating`) | `sucrose` (solid, dry): T ≥ 160 °C — плавится; T ≥ 170 °C 5 с — карамель; T ≥ 200 °C 10 с — уголь | `melt`; `color`/`caramel` + `smell` «карамель»; `color`/`char` + дым, вытяжка, `smell` «горелое» | плавление; карамелизация — сложный процесс; обугливание упрощённо `C12H22O11 -> 12C + 11H2O` |
| R11 | `starch_gelatinization` | physical | `starch` (suspended) + вода + T ≥ 60 °C (картофельный крахмал 56–68 °C) | `turbid`/`thicken`: смесь густеет и становится полупрозрачной, «как кисель»; фаза `gel` | физическое (клейстеризация) |
| R12 | `water_boiling` | physical | жидкая вода + горелка + T = 100 °C | `steam`/`boiling`: пузырьки пара, уровень падает | физическое (кипение) |
| R13 | `evaporate_to_residue` | physical | раствор + горелка, вода выкипела | `crystals` (соль), `melt` → далее R10 (сахар), белый порошок (сода, через R09) | физическое |
| R14 | `heat_stable_dry` | physical (наблюдение) | `heat_stable` (solid, dry) + нагрев до предела горелки | `nothing` с причиной; для соли `crackle` (потрескивание) | — |
| R15 | `acid_vapor_on_heat` | sensory | `volatile` + `acid` + нагрев | `smell` сильнее, включается вытяжка | — |
| H01 | `hz_iodine_heat_dry` | hazard_stop | `iodine` + `heat_start`/`tick` на горелке + среда `dry` (или йода больше 1 капли на порцию воды) | стоп: «Йод так не нагреваем: его пары вредны для глаз и горла. Лаба остановила опыт» | — |
| H02 | `hz_chlorine_with_acid` | hazard_stop | `chlorine_cleaner` + `acid` в одном сосуде (модуль 8) | стоп: «Средства с хлором никогда не смешивают с другими средствами и с кислотами, даже с уксусом. Это опасно для дыхания. Лаба остановила опыт» | — |
| N01 | `nr_salt_acid` | no-reaction | `sodium_chloride` + `acetic_acid` | `nothing`: «Соль с уксусом не реагирует: новых веществ нет. А растворилась она чуть-чуть потому, что в уксусе много воды» | — |
| N02 | `nr_iodine_no_starch` | no-reaction | `iodine` + частица без `starch` | `color` (цвет йода) + «Йод просто покрасил соль своим цветом. Синего нет — значит, крахмала нет» | — |
| N03 | `nr_sugar_acid`, `nr_starch_acid_cold` | no-reaction | сахар или крахмал + уксус, без нагрева | `nothing`: «Сахар с уксусом не реагирует», «Крахмал с уксусом не реагирует» | — |

### 6.2. Правило R05 полностью

```yaml
id: acid_carbonate_gas
kind: reaction
priority: 100
when:
  reactants:
    - { bind: acid, match: { class: acid }, phases: [dissolved, liquid] }
    - { bind: carbonate, match: { class: carbonate_like }, phases: [solid, dissolved, suspended, sediment] }
effect: { type: react }
observe:
  - { kind: gas, intensity: from_variant }
  - { kind: foam, intensity: from_variant }
variants:
  - id: acetic_bicarbonate
    bind: { acid: acetic_acid, carbonate: sodium_bicarbonate }
    stoichiometry:
      reactants: [{ bind: acid, coeff: 1 }, { bind: carbonate, coeff: 1 }]
      products:
        - { species: sodium_acetate, coeff: 1, phase: dissolved }
        - { species: water, coeff: 1, phase: liquid }
        - { species: carbon_dioxide, coeff: 1, phase: gas }
    kinetics: { mode: instant }
    intensity: strong
    heatJPerMol: 25000          # наблюдаемое охлаждение на 2–4 °C (калибровка, уточнить)
    foamMlPerMlGas: 0.15        # калибровка: перелив при 3 порциях уксуса на 1 порцию соды в пробирке
    equation: { type: chemical, text: "NaHCO3 + CH3COOH -> CH3COONa + H2O + CO2^" }
  - id: acetic_calcium_carbonate
    bind: { acid: acetic_acid, carbonate: calcium_carbonate }
    stoichiometry:
      reactants: [{ bind: acid, coeff: 2 }, { bind: carbonate, coeff: 1 }]
      products:
        - { species: calcium_acetate, coeff: 1, phase: dissolved }
        - { species: water, coeff: 1, phase: liquid }
        - { species: carbon_dioxide, coeff: 1, phase: gas }
    kinetics: { mode: over_time, durationS: 30 }   # мел нерастворим, реагирует с поверхности
    intensity: weak
    foamMlPerMlGas: 0.03
    equation: { type: chemical, text: "CaCO3 + 2CH3COOH -> Ca(CH3COO)2 + H2O + CO2^" }
    textOverride:
      what: { ru: "Шипит, но спокойнее: мелкие пузырьки, дольше" }
      why: { ru: "Мел тоже шипит! Выходит тот же газ, что у соды. Мел и сода — химические родственники." }
text:
  what: { ru: "Бурное шипение, пузырьки, пена" }
  why: { ru: "Сода и уксус превратились в новые вещества. Одно из них — газ, он и надувает пузырьки. Это химическая реакция!" }
  deeper: { ru: "В соде и в меле есть одинаковая «деталь». Из неё и получается углекислый газ, когда приходит уксус. Учёные называют такие вещества **карбонатами**." }
  adult: { ru: "Кислота вытесняет угольную кислоту из карбоната, та распадается на воду и CO₂. Мел нерастворим и реагирует только с поверхности, поэтому медленнее." }
  wordEquation: { ru: "кислота + карбонат → соль + вода + углекислый газ" }
equation: { type: chemical, text: "2H+ + CO3^2- -> H2O + CO2^" }
onceLine: { ru: "Опять шипит?! Но сода у нас одна… Значит, шипят двое. Как их различить?" }
sources: [lesson01_table_4_6_3, frostburg_vinegar_soda]
review: { status: self_checked }
```

Числа для проверки на этом правиле: 1 порция соды = 0,2 г = 2,38 ммоль → 2,38 ммоль CO₂ ≈ 57 мл газа при 20 °C. 1 порция уксуса 9 % = 7,57 ммоль уксусной кислоты — хватает на 3,2 порции соды или на 3,8 порции мела (мелу нужно две молекулы кислоты).

### 6.3. Ещё два правила в YAML

```yaml
id: starch_iodine_complex
kind: reaction
priority: 500
when:
  reactants:
    - { bind: starch, match: { species: starch }, phases: [solid, suspended, sediment, gel] }
    - { bind: iodine, match: { class: iodine }, phases: [dissolved] }
  temperature: { maxC: 60 }         # уточнить у химика порог исчезновения окраски
effect: { type: transform, bind: starch, to: starch_iodine_complex, toPhase: suspended }
observe: [{ kind: color, intensity: strong }]
text:
  what: { ru: "Капля стала тёмно-синей, почти чёрной" }
  why: { ru: "Йод нашёл крахмал! Только крахмал так синеет. Это его главная примета." }
  adult: { ru: "Полииодид-ионы входят в спираль амилозы и дают синюю окраску; амилопектин — красно-фиолетовую. При нагревании окраска исчезает, при охлаждении возвращается." }
equation: { type: complex, note: { ru: "комплекс включения амилоза–полииодид, обратим при нагреве" } }
sources: [microbenotes_iodine_test, lesson01_table_4_6_4]
review: { status: self_checked, notes: "Порог температуры; доля йода, которая связывается" }
```

```yaml
id: hz_iodine_heat_dry
kind: hazard_stop
priority: 1000
when:
  trigger: [heat_start, tick]
  heatSource: burner
  reactants:
    - { bind: iodine, match: { class: iodine } }
  medium: dry
effect: { type: stop }
observe: []
text:
  what: { ru: "Стоп!" }
  why: { ru: "Йод так не нагреваем: его пары вредны для глаз и горла. Лаба остановила опыт." }
  adult: { ru: "Йод возгоняется при нагревании, пары раздражают слизистые. Спиртовой раствор йода огнеопасен. Разбавленная водная смесь (1 капля на 2 и больше порций воды) разрешена." }
equation: { type: physical, note: { ru: "—" } }
sources: [lesson01_row_43]
review: { status: self_checked }
```

### 6.4. Табличные тесты «состояние + действие → результат»

Каждая строка — тест в `content/tests/engine/*.yaml`. «Порция» — 0,2 г порошка или 5 мл жидкости.

| № | Начальное состояние | Действия | Ожидаемые события | Ожидаемое состояние |
| --- | --- | --- | --- | --- |
| T01 | пробирка: 1 порция соли | +2 порции воды, перемешать | `dissolve` (R01) | соль `dissolved` 0,2 г; мутность 0 |
| T02 | пробирка: 1 порция соды | +2 порции воды | — (растворение идёт медленно), без `nothing` при `add`: есть `dissolve`/частично | сода частично `solid` |
| T03 | T02 | перемешать ×3 | `dissolve` | сода `dissolved` 0,2 г, прозрачно |
| T04 | пробирка: 10 порций соды | +2 порции воды, перемешать ×3 | `dissolve` + `saturated` (R02) | `dissolved` ≈ 0,96 г, `solid` ≈ 1,04 г (± 2 %) |
| T05 | пробирка: 1 порция крахмала | +2 порции воды, перемешать | `turbid` (R03) | `suspended` 0,2 г, мутность > 0,5 |
| T06 | T05 | подождать 60 с | `turbid`/`settled` (R04) | `sediment` > 0,15 г, мутность < 0,2 |
| T07 | пробирка: 1 порция соды | +1 порция уксуса | `gas` strong, `foam`, `cold` (R05 `acetic_bicarbonate`) | сода 0; уксусная кислота ≈ 0,31 г осталась; ацетат натрия ≈ 0,195 г; T на 2–4 °C ниже |
| T08 | пробирка: 5 порций соды | +1 порция уксуса | `gas` strong (коротко) | уксусная кислота 0; сода `solid` ≈ 0,36 г на дне (избыток) |
| T09 | T08 | +1 порция уксуса | `gas` снова | сода уменьшилась |
| T10 | пробирка: 1 порция соды | +3 порции уксуса одним действием (строка 39 урока 1) | `gas` strong, `foam`/`overflow` | флаг `overflowed` |
| T11 | пробирка: 1 порция мела + 2 порции воды (взвесь) | +1 порция уксуса | `gas` weak, `process started` | через 30 с: мел 0, мутность 0 (`turbid`/`clearing`), ацетат кальция `dissolved` |
| T12 | пробирка: 1 порция соли | +1 порция уксуса | `nothing_happened` (N01) | соль частично `dissolved` в воде уксуса |
| T13 | пробирка: 1 порция крахмала (сухо) | +1 капля йода | `color` strong (R06) | `starch_iodine_complex` |
| T14 | пробирка: 1 порция соли (сухо) | +1 капля йода | `color` (цвет йода) + `nothing_happened` (N02) | без комплекса |
| T15 | T05 + 1 капля йода | горелка в держателе, греть до 70 °C | `color`/`fade` (R07) | комплекса нет, синевы нет |
| T16 | T15 | ледяная баня до 10 °C | `color` strong (R06) | комплекс снова есть |
| T17 | пробирка: 1 порция сахара (сухо) | горелка в держателе, держать 40 с времени опыта | `melt`, затем `color`/`caramel` + `smell`; при продолжении `color`/`char`, `fume_hood on` | `caramel`, затем `carbon` |
| T18 | пробирка: 1 порция соды (сухо) | горелка в держателе, держать до 200 °C | `steam`/`droplets_on_walls`, `gas` weak (R09) | `sodium_carbonate` ≈ 0,126 г (0,2 × 106/168) |
| T19 | пробирка: 1 порция мела (сухо) | горелка в держателе, до 300 °C | `nothing_happened` (R14) | без изменений |
| T20 | пробирка: 1 порция крахмала + 2 порции воды | горелка, до 70 °C | `turbid`/`thicken` (R11) | крахмал в фазе `gel` |
| T21 | стакан: 4 порции воды + 1 порция соли | выпарить | `steam`/`boiling`, затем `crystals` (R12, R13) | вода 0; соль `solid` 0,2 г |
| T22 | пробирка: отвар капусты 2 порции | +1 порция уксуса | `color` → красно-розовый (R08, pH ≈ 2,5) | полоса pH 2 |
| T23 | пробирка: отвар капусты 2 порции + 1 порция соды, перемешать ×3 | — (после растворения) | `color` → синий (R08, pH ≈ 8,3) | полоса pH 8 |
| T24 | T23 | +1 порция уксуса | `gas` strong (R05) + `color` → розово-фиолетовый (R08, буфер, pH 4–5) | соды нет, уксусная кислота в избытке |
| T25 | пробирка: 1 капля йода на 1 порцию соли (сухо) | `heat_start` в держателе | `safety_stop` (H01) | состояние не изменилось |
| T26 | пробирка без держателя | `heat_start` | `blocked: needs_holder` | без изменений |
| T27 | пробирка: 1 порция соли | `return_to_jar` | `blocked: no_return_to_jar` | без изменений |
| T28 | пробирка: 2 порции воды | +2 порции воды | — (просто стало больше воды) → `nothing_happened` с причиной `nr_same_liquid` | вода 20 г |
| T29 | пробирка: 4 порции воды | +1 порция воды | `blocked: capacity` | без изменений |
| T30 | две пробирки: соль и сода | понюхать каждую | `smelled: none` | — |

## 7. Эффекты (`content/chem/effects.yaml`)

```ts
interface EffectDef {
  id: Id;                                  // 'fizz_strong'
  when: { kind: ObservationKind; detail?: ObservationDetail; intensity?: Intensity };
  fxClasses: string[];                     // ['fx-fizz', 'fx-fizz--strong'] — должны быть в design/components/effects.css
  vars?: Record<string, number>;           // целевые значения переменных: { '--foam': 0.6 }
  duration: 'motion.duration.effect' | 'motion.duration.effect-long' | 'motion.duration.pour' | 'process';
  easing?: string;                         // токен 'motion.easing.liquid'
  sound?: Id;                              // 'fizz_loud'
  icon: IconId;                            // 'result-gas'
  maxParticles?: number;
  reducedMotion: 'final_state' | 'static_icon';
}
```

| Наблюдение | Эффект | Классы дизайна | Звук |
| --- | --- | --- | --- |
| `dissolve` | `dissolve` | `fx-dissolve`, `fx-stir` | — |
| `turbid` | `cloud` / `settle` / `thicken` | `fx-settle` (оседание) | — |
| `gas` strong / weak | `fizz_strong` / `fizz_weak` | `fx-fizz fx-fizz--strong` / `fx-fizz` | `fizz_loud` / `fizz_soft` |
| `foam` / `overflow` | `foam`, `foam_overflow` | `fx-foam` | — |
| `color` | `color_shift` | переход `--liquid-color` (уже в `effects.css`) | — |
| `steam` / `boiling` / `droplets_on_walls` | `steam`, `boil`, `droplets` | `fx-steam` (+ нужен эффект капель) | `boil` |
| `crystals` | `crystals_grow` | `fx-crystals` | — |
| `melt`, `char` | `melt`, `char_smoke` | (нужны от дизайна) | `vent_hum` |
| `smell` | `smell_waves` | `fx/smell.svg` + анимация руки «веером» | — |
| `warm` / `cold` | `heat_waves` / `frost` | `fx/heat-waves.svg`, `fx/frost.svg` | — |
| `nothing` | `nothing` | только карточка `hl-observation--nothing` | — |
| `safety_stop` | `stop_card` | `hl-speech--warn` | — |

## 8. Уроки, миссии, тесты, награды

### 8.1. Модули и уроки (`content/learning/modules.yaml`, `lessons/*.yaml`)

```ts
interface Module { id: Id; order: number; title: Text; status: 'available' | 'coming_soon'; lessons: Id[] }

interface Lesson {
  id: Id;                                   // 'm1_l01'
  moduleId: Id;
  order: number;
  title: Text;
  goals: { know: Text[]; can: Text[]; habits: Text[] };   // для страницы родителей
  estimatedMinutes: number;
  substances: SubstanceId[];                // для «научных имён» и проверок
  screens: Screen[];
  test: TestDef;
  homeExperiment: HomeExperiment;
  reward: LessonReward;
  review: Review;
}

type Stage = 'hook' | 'try' | 'explain' | 'mission' | 'test' | 'home' | 'reward';

interface ScreenBase {
  id: Id;                                   // 'k1', 'p1', 'r1'… как в черновике урока
  stage: Stage;
  illustration?: AssetRef;
  guide?: { pose: 'explain' | 'happy' | 'thinking' | 'warn'; lines: Text[] };
  body?: Text[];                            // базовый текст, короткими абзацами
  deeper?: Array<{ id: Id; title: Text; body: Text[] }>;
  sciNames?: SubstanceId[];                 // чипы «по-научному — …»
  completeWhen?: Predicate;                 // когда доступна «дальше»
}

type Screen =
  | ScreenBase & { type: 'story' }
  | ScreenBase & { type: 'choice'; options: Array<{ id: Id; label: Text; reply: Text }>; after?: Text[] }
  | ScreenBase & { type: 'predict'; question: Text; chips: Array<{ id: Id; label: Text }>; journalKey: Id }
  | ScreenBase & { type: 'mini_lab'; setup: LabSetup; script: MiniLabStep[] }
  | ScreenBase & { type: 'sort'; shelves: Array<{ id: Id; label: Text; icon?: IconId }>;
                   cards: Array<{ id: Id; label: Text; correct: Id; wrong: Record<Id, Text> }> }
  | ScreenBase & { type: 'question'; question: Text; options: Array<{ id: Id; label: Text; correct: boolean; reply: Text }> }
  | ScreenBase & { type: 'spot_errors'; hotspots: Array<{ id: Id; area: [number, number, number, number]; rule: Text }>; hintAfterS: number }
  | ScreenBase & { type: 'mission'; missionId: Id }
  | ScreenBase & { type: 'test' }
  | ScreenBase & { type: 'home' }
  | ScreenBase & { type: 'reward' };

interface MiniLabStep {
  id: Id;
  prompt?: Text;                            // 'Сначала — защитные очки. Нажми на них.'
  expect: { action: LabAction['type']; target?: VesselId; substanceId?: SubstanceId } | { goggles: true };
  onDone?: Text[];                          // реплики после шага
  branches?: Array<{ when: Predicate; lines: Text[] }>;   // 'угадано «зашипит»'
}
```

Мини-опыт использует тот же движок, что и лаба: никаких «нарисованных» результатов. Сценарий только подсказывает, что сделать, и ждёт нужного действия.

### 8.2. Предикаты (`Predicate`)

Маленький язык условий для «дальше», подсказок, сюжетных реплик и значков. Только данные, без кода.

```ts
type Predicate =
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { screenAnswered: Id } | { sortedCorrectly: Id } | { allHotspotsFound: Id }
  | { miniLabStepDone: Id }
  | { experimentsDone: { gte: number } }
  | { jarsWith: { test: Id; chip: Id }; gte?: number; lte?: number }
  | { jarsTested: { test: Id }; gte?: number }
  | { labelsPlaced: { gte: number } } | { labelsAllPlaced: true } | { labelsWrong: { gte: number } }
  | { eventSeen: { kind: ObservationKind; times?: number } }
  | { idleS: { gte: number } }
  | { counter: { id: Id; gte: number } };
```

### 8.3. Миссия (`content/learning/missions/*.yaml`)

```ts
interface Mission {
  id: Id;                                   // 'powder_mystery'
  lessonId?: Id;
  title: Text;
  story: Text[];
  goal: Text;
  setup: {
    equipment: Id[];
    actions: ActionId[];
    helpers: SubstanceId[];                 // вода, уксус, раствор йода — с карточками
    unknowns: { jars: string[]; substances: SubstanceId[] };   // ['А','Б','В','Г','Д'] × 5 порошков, раскладка по зерну
  };
  tests: Array<{                            // колонки детективной доски
    id: Id;                                 // 'magnify', 'water', 'vinegar', 'iodine', 'heat'
    label: Text;
    predictionChips: Array<{ id: Id; label: Text }>;
    observationChips: Array<{ id: Id; label: Text; matches: Array<{ kind: ObservationKind; detail?: ObservationDetail; intensity?: Intensity }> | 'nothing' }>;
  }>;
  signatures: Record<SubstanceId, Record<Id, Id>>;   // ожидаемый чип наблюдения: сода → { vinegar: fizz_strong, water: dissolved_after_stir }
  check: { correct: Text; contradiction: Text; noData: Text; sameAgain: Text };
  win: { allLabelsCorrect: true; finale: 'wash_hands' };
  hints: Array<{ situation: Id; when: Predicate; levels: [Text, Text, Text]; highlight?: 'contradiction' }>;  // по порядку, берётся первая подходящая
  twists: Array<{ when: Predicate; line: Text }>;                 // один раз за миссию
  reactions: Array<{ when: Predicate; line: Text }>;              // на неожиданные действия, раздел 4.11 урока
  idleHintPulseS: number;                                         // 60
  solutionPaths: Array<{ id: Id; steps: Array<{ jar: string; test: Id }> }>;   // для проверки решаемости
  rewards: Id[];
  review: Review;
}
```

`signatures` записаны в данных явно и **проверяются движком** в CI: тест ставит каждую банку на каждую проверку и сравнивает полученный чип с ожидаемым. Так химия миссии описана дважды (в правилах и в подписи), и расхождение сразу видно.

Пример ситуации подсказки из урока 1:

```yaml
- situation: two_insoluble
  when: { all: [ { jarsWith: { test: water, chip: cloudy }, gte: 2 }, { not: { jarsTested: { test: iodine }, gte: 2 } } ] }
  levels:
    - { ru: "Среди них есть крахмал. Каким детектором его найти?" }
    - { ru: "Капни йод на оба порошка." }
    - { ru: "Кто посинеет — крахмал. Второй — мел. Проверь мел уксусом: он должен зашипеть." }
```

Журнал детектива:

```ts
interface JournalEntry {
  id: Id;
  atS: number;                              // время опыта
  jar?: string; vesselId?: VesselId;
  test?: Id; action: LabAction['type'];
  prediction?: Id;                          // чип предсказания
  observed: Id[];                           // чипы, соответствующие событиям движка
  chosen?: Id;                              // чип, выбранный ребёнком
  conclusion?: { label: SubstanceId; because: Id[] };   // ссылки на записи
  ruleIds: Id[];                            // для «почему»
}
```

### 8.4. Тест (`TestDef`)

```ts
interface TestDef {
  questions: Question[];
  summary: Text;                            // 'Ты знаешь уже {count} из {total}'
}

type Question =
  | { id: Id; type: 'single'; prompt: Text; options: Array<{ id: Id; label: Text; correct: boolean; explain: Text }> }
  | { id: Id; type: 'multi'; prompt: Text; options: Array<{ id: Id; label: Text; correct: boolean; explain: Text }>; partial: Text }
  | { id: Id; type: 'sort'; prompt: Text; buckets: Array<{ id: Id; label: Text }>;
      cards: Array<{ id: Id; label: Text; correct: Id; wrong: Record<Id, Text> }> }
  | { id: Id; type: 'match'; prompt: Text; pairs: Array<{ left: Text; right: Text; wrong: Text }> }
  | { id: Id; type: 'predict'; prompt: Text; labPreview?: LabSetup; options: Array<{ id: Id; label: Text; correct: boolean; explain: Text }> };
```

Валидатор: у каждого неверного варианта и каждой неверной раскладки есть `explain`/`wrong`; у вопросов с несколькими ответами — `partial`; у каждого верного — тоже `explain` (объясняем и правильный ответ).

### 8.5. «Попробуй дома»

```ts
interface HomeExperiment {
  title: Text; durationMin: number; ageNote: Text;
  materials: Array<{ substance?: SubstanceId; item?: Text; amount: Text; adultOnly?: boolean }>;
  steps: Array<{ text: Text; adultOnly?: boolean }>;
  expected: { columns: Text[]; rows: Array<{ label: Text; cells: Text[] }> };   // подсказка для взрослого
  notes?: Text[];
  safety: Text[];                           // обязательно, не пусто
  usesHeatOrFire: false;                    // в MVP — всегда false
}
```

### 8.6. Награды (`content/learning/rewards.yaml`)

```ts
interface Badge {
  id: Id;
  asset: AssetRef;                          // 'badges/powder-detective'
  name: Text; description: Text;
  bonus: boolean;                           // бонусные — за любопытство
  criteria: Predicate | { lessonCompleted: Id } | { missionCompleted: Id }
          | { journalFilled: { mission: Id } } | { allDeeperOpened: { lesson: Id } };
}

interface LessonReward {
  badges: Id[];
  unlocks: { substances: SubstanceId[]; equipment: Id[]; actions: ActionId[] };
  cards: Id[];                              // карточки веществ, оборудования, правил безопасности
  sandboxIdeas: Text[];
  pass?: { avatars: Id[] };                 // «пропуск в лабораторию»
}
```

### 8.7. Прогресс (схема версии 1)

```ts
interface ProgressV1 {
  schemaVersion: 1;
  createdAt: string; updatedAt: string;     // ISO, только локально
  settings: {
    sound: boolean; hints: boolean; deeperExpanded: boolean;
    motion: 'system' | 'reduced' | 'full'; textSize: 'normal' | 'large';
    avatar: Id | null;
    analytics: 'unset' | 'granted' | 'denied';
  };
  lessons: Record<Id, {
    status: 'in_progress' | 'completed';
    screenId: Id;
    answers: Record<Id, unknown>;           // по типу экрана, проверяется схемой экрана
    deeperOpened: Id[];
    test?: { firstTryCorrect: Id[]; total: number };
    completedAt?: string;
  }>;
  missions: Record<Id, {
    status: 'in_progress' | 'completed';
    seed: number;
    labels: Record<string, SubstanceId>;
    journal: JournalEntry[];
    hintsUsed: Record<Id, 1 | 2 | 3>;
    checks: number;
    completedAt?: string;
  }>;
  unlocked: { substances: SubstanceId[]; equipment: Id[]; actions: ActionId[] };
  newMarks: Id[];
  collection: { badges: Id[]; cards: Id[]; discoveries: Id[] };
  counters: Record<Id, number>;             // 'predictions_correct', 'control_experiments'
  sandbox: { journal: JournalEntry[] };     // последние 50
  onceFlags: Id[];                          // показанные «один раз» реплики
}
```

Стол лабы в MVP не сохраняется: при возвращении в миссию стол чистый, а журнал и надписи на месте («стол убрали, журнал сохранён»).

## 9. Стратегия тестирования движка

1. **Табличные тесты** (`content/tests/engine/*.yaml`). Формат:

```yaml
- id: t08_soda_excess
  rules: [acid_carbonate_gas]                 # какие правила проверяет (для отчёта покрытия)
  setup:
    vessels:
      v1: { equipment: test_tube, slot: 0, add: [{ substance: baking_soda, dose: { unit: portion_solid, count: 5 } }] }
  actions:
    - { type: add, vesselId: v1, substanceId: vinegar, amount: { unit: portion_liquid, count: 1 } }
  expect:
    events:
      include:
        - { type: observation, kind: gas, ruleId: acid_carbonate_gas, variantId: acetic_bicarbonate }
      exclude:
        - { type: nothing_happened }
    vessels:
      v1:
        contents:
          acetic_acid: { total: 0 }
          sodium_bicarbonate: { solid: { approx: 0.364, tolerance: 0.02 } }
```

Сопоставители: точное значение, `approx` с допуском, `between`, `gt`, `absent`. Раннер Vitest читает все файлы и создаёт по тесту на запись.

2. **Свойства (property-based, fast-check).** На случайных последовательностях действий из доступного набора:
   - сохранение массы: масса частиц + масса ушедшего газа и пара = масса до шага (± 1e-6 г);
   - нет отрицательных количеств;
   - растворённое не превышает предел растворимости;
   - температура в пределах [0, 300] °C;
   - детерминированность: два прогона дают одинаковый JSON;
   - устойчивость: `tick 0` после шага не меняет состояние;
   - стоп-правило не меняет состояние.
3. **Покрытие правил.** Каждое правило и каждый вариант упомянуты хотя бы в одном табличном тесте (отчёт в CI, порог 100 %).
4. **Решаемость миссий.** Для каждой миссии: все банки × все проверки дают чипы из `signatures`; эталонные пути решения различают все банки; ни одна проверка в одиночку не различает все пять порошков (условие урока 1).
5. **Бенчмарк.** `vitest bench`: шаг движка на типичных сценах (NFR-006).
6. **Снимки визуала.** `deriveVisual` для ключевых состояний сравнивается со снимком (значения переменных, не картинка).

## 10. Валидация контента в CI (`npm run content:check`)

| Проверка | Что делает | Ошибка или предупреждение |
| --- | --- | --- |
| Схема | Каждый файл проходит схему Zod своего вида | ошибка |
| Уникальность | `id` уникальны внутри вида | ошибка |
| Ссылки | Все `SpeciesId`, `SubstanceId`, `ClassId`, правила, эффекты, ассеты (`manifest.json`), токены (`tokens.json`), иконки, звуки, источники существуют | ошибка |
| Состав | Сумма `massFraction` = 1 (± 0,001) | ошибка |
| Уравнения | Баланс атомов и зарядов для `type: chemical` (разбор формул, включая скобки и `^`) | ошибка |
| Варианты | Для всех доступных в любой момент прогресса частиц: если классы совпали с правилом, есть вариант с такой привязкой | ошибка |
| Пары «реакция или объяснение» | Для веществ каждой миссии: каждая пара и каждое действие дают либо правило, либо `NoReaction` | ошибка |
| Решаемость миссий | Раздел 9, пункт 4 | ошибка |
| Табличные тесты | Покрытие правил | ошибка, если правило без теста |
| Тексты: обязательные поля | `ru` есть у каждого `Text` | ошибка |
| Тексты: базовый уровень | Нет формул (регулярное выражение по шаблонам вроде `NaCl`, `H2O`, `→`); предложение ≤ 14 слов | формулы — ошибка; длина — предупреждение |
| Тексты: обращение | Эвристический словарь родовых форм обращения к ребёнку («нашёл», «нашла», «сделал»…) | предупреждение |
| Безопасность | Стоп-лист терминов; в текстах стоп-правил нет чисел с единицами и пропорций; домашние опыты только с веществами `home` + `safeForHome`, без огня и нагрева | ошибка |
| Пометки | У каждого вещества `availability`, у частицы `hazard` | ошибка |
| Уроки | Порядок этапов шаблона; есть тест, домашний опыт, награда; оценка длительности | ошибка; длительность > 15 мин — предупреждение |
| Тест | Объяснения у всех неверных вариантов, раскладок и частичных выборов | ошибка |
| Статус проверки | В релизной сборке весь используемый контент `chemist_approved` | ошибка при `--release` |
| Переводы | Отчёт о недостающих языках | информация |

Отчёт пишется в консоль и в `GITHUB_STEP_SUMMARY`; полный — артефактом запуска.
