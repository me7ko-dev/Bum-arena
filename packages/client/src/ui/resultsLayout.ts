/**
 * Разположение на екрана в края на рунда: картата с класирането и „сцената“ с подиума.
 * Ползва се и от HUD-а (къде да е панелът), и от камерата на подиума (къде да го покаже),
 * за да не се застъпват.
 *
 *  - широк екран → карта отдясно, подиумът – в лявата част;
 *  - изправен телефон → лист отдолу, подиумът – в горната част.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResultsLayout {
  kind: 'side' | 'sheet';
  /** Панелът с класирането (в CSS пиксели). */
  panel: Rect;
  /** Свободната част, в която камерата показва подиума. */
  stage: Rect;
}

/** Отстъп от ръба на екрана. */
const MARGIN = 12;
/** Горе е таймерът – подиумът да не влиза под него. */
const TOP_HUD = 64;

export function resultsLayout(width: number, height: number): ResultsLayout {
  if (width >= height * 1.1) {
    const w = Math.round(Math.min(440, Math.max(300, width * 0.36)));
    const panel = { x: width - MARGIN - w, y: MARGIN, w, h: height - MARGIN * 2 };
    return { kind: 'side', panel, stage: { x: 0, y: TOP_HUD * 0.6, w: panel.x - MARGIN, h: height - TOP_HUD * 0.6 } };
  }
  const h = Math.round(Math.min(430, Math.max(300, height * 0.47)));
  const w = Math.min(560, width - MARGIN * 2);
  const panel = { x: (width - w) / 2, y: height - MARGIN - h, w, h };
  return { kind: 'sheet', panel, stage: { x: 0, y: TOP_HUD, w: width, h: panel.y - TOP_HUD } };
}
