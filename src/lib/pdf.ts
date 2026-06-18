// Optional PDF export. expo-print/expo-sharing are native modules loaded via
// require() so a build without them (Expo Go) degrades gracefully — the caller
// falls back to a plain-text share. Returns true only if a PDF was shared.
export async function sharePdfFromHtml(html: string, dialogTitle: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
