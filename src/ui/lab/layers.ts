/**
 * Правило одного всплывающего слоя для экрана лаборатории.
 * Отдельный класс, чтобы контроллер не разрастался; поведение то же, что было в контроллере.
 */
import type { LabUiState, Speech } from './lab-types.ts';

export class LayerRule {
  /** Очередь реплик Пипы, которые ждут, пока закроется другой всплывающий слой. */
  speechQueue: Speech[] = [];
  private prevLayers: Record<string, unknown> = {};
  private reopenJournal = false;

  /**
   * Правило слоёв: одновременно виден только один всплывающий слой
   * (стоп, надпись, количество, выезжающий журнал, результат, тост, реплика).
   * Новый слой закрывает старые; реплика Пипы не теряется, а встаёт в очередь.
   * Тост вместе с новым результатом не показывается: открытие уже есть строкой в карточке.
   */
  normalize(s: LabUiState): void {
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1280;
    const layers: Record<string, unknown> = {
      stop: s.stop,
      labelPicker: s.labelPicker,
      qty: s.qty,
      journal: narrow && s.journalOpen ? true : null,
      result: s.result,
      toast: s.toast,
      speech: s.speech,
    };
    const order = ['stop', 'labelPicker', 'qty', 'journal', 'result', 'toast', 'speech'];
    const open = order.filter((k) => layers[k]);
    const fresh = open.filter((k) => layers[k] !== this.prevLayers[k]);
    const winner = fresh[0] ?? open[0];
    // Надпись выбирают с доски в выезжающем журнале: после выбора журнал возвращается.
    if (winner === 'labelPicker' && layers['journal']) this.reopenJournal = true;
    if (winner !== 'labelPicker' && winner !== undefined) this.reopenJournal = false;
    if (!winner && this.reopenJournal) {
      this.reopenJournal = false;
      s.journalOpen = true;
    }
    for (const k of open) {
      if (k === winner) continue;
      if (k === 'speech' && s.speech) {
        if (!s.speech.transient && !this.speechQueue.some((q) => q.text === s.speech?.text))
          this.speechQueue.push(s.speech);
        s.speech = null;
      } else if (k === 'journal') s.journalOpen = false;
      else if (k === 'stop') s.stop = null;
      else if (k === 'labelPicker') s.labelPicker = null;
      else if (k === 'qty') s.qty = null;
      else if (k === 'result') s.result = null;
      else if (k === 'toast') s.toast = null;
    }
    if (!winner && !s.journalOpen && this.speechQueue.length) s.speech = this.speechQueue.shift() ?? null;
    this.prevLayers = {
      stop: s.stop,
      labelPicker: s.labelPicker,
      qty: s.qty,
      journal: narrow && s.journalOpen ? true : null,
      result: s.result,
      toast: s.toast,
      speech: s.speech,
    };
  }
}
