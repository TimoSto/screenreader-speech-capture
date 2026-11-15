/** A point on the screen in physical pixels (what the bridge's native click takes). */
export interface ScreenPoint {
  x: number;
  y: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

/**
 * What a browser page reports about its window (`window.screenX`, …), in CSS pixels, plus the
 * ratio that turns them into physical pixels.
 */
export interface WindowGeometry {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
}

/** An element's box in CSS pixels, relative to the page's viewport (Playwright's `boundingBox`). */
export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far below the window's top edge the default click lands, in CSS pixels. */
const TITLE_BAR_OFFSET = 12;

/**
 * Where to click so the window becomes the foreground window, in physical pixels.
 *
 * Without `target`: the middle of the window's top edge, inside the title bar, which doesn't do
 * anything to the page (docs/usage/native-input.md). With `target`: the centre of the element.
 * The browser's own frame (tabs, address bar) is what the window's outer size has beyond its
 * inner size; the left, right and bottom borders are the same width, so they are split evenly.
 */
export function clickPoint(geometry: WindowGeometry, target?: ElementBox): ScreenPoint {
  const { screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight } = geometry;
  const scale = geometry.devicePixelRatio > 0 ? geometry.devicePixelRatio : 1;
  const border = Math.max(0, (outerWidth - innerWidth) / 2);
  const frameHeight = Math.max(0, outerHeight - innerHeight - border);
  const [x, y] =
    target === undefined
      ? [screenX + outerWidth / 2, screenY + Math.min(TITLE_BAR_OFFSET, outerHeight / 2)]
      : [
          screenX + border + target.x + target.width / 2,
          screenY + frameHeight + target.y + target.height / 2,
        ];
  return { x: Math.round(x * scale), y: Math.round(y * scale) };
}

/**
 * The top-left corner of the page content, in physical pixels: where the web page starts, below
 * the browser's tabs and address bar. Lands 1 CSS pixel inside, so it hits the page and not the
 * window border.
 */
export function contentCornerPoint(geometry: WindowGeometry): ScreenPoint {
  return clickPoint(geometry, { x: 1, y: 1, width: 0, height: 0 });
}

/** The page's window geometry could not be read, or the target element isn't on screen. */
export class FocusError extends Error {
  override name = 'FocusError';
}

/** Script a page evaluates to report its window geometry. */
export const READ_GEOMETRY_SCRIPT = `({
  screenX: window.screenX,
  screenY: window.screenY,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio,
})`;

const GEOMETRY_KEYS = [
  'screenX',
  'screenY',
  'outerWidth',
  'outerHeight',
  'innerWidth',
  'innerHeight',
  'devicePixelRatio',
] as const;

/** Checks what the page answered to {@link READ_GEOMETRY_SCRIPT}. */
export function parseWindowGeometry(value: unknown): WindowGeometry {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const numbers = GEOMETRY_KEYS.map((key) => record[key]);
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new FocusError(`The page did not report its window geometry: ${JSON.stringify(value)}`);
  }
  return Object.fromEntries(
    GEOMETRY_KEYS.map((key, i) => [key, numbers[i]]),
  ) as unknown as WindowGeometry;
}
