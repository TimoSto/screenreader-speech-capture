const ICON_FONT = '24px "Material Symbols Outlined"';

/**
 * Loads the icon font and then sets `data-icons-ready` on `<html>`, which ends the placeholder
 * shimmer in `global.css`. If loading fails the icons show anyway rather than shimmer forever.
 */
export async function markIconFontReady(): Promise<void> {
  try {
    await document.fonts.load(ICON_FONT);
  } catch {
    // fall through: show the icons
  }
  document.documentElement.setAttribute('data-icons-ready', '');
}
