import {desktopSilentPrint, isNativeApp} from './platform';

export function submitAppPrint(html: string): Promise<void> | null {
  const desktop = desktopSilentPrint(html);
  if (desktop) return desktop.then(result => {
    if (!result.success) throw new Error(result.errorType || 'Windows could not submit the print job.');
  });
  if (!isNativeApp()) return null;

  return import('@capacitor/core').then(({Capacitor, registerPlugin}) => {
    if (!Capacitor.isPluginAvailable('BranchPrinting')) {
      throw new Error('Printing needs the updated Android app.');
    }
    return registerPlugin<{print(options: {html: string}): Promise<void>}>('BranchPrinting').print({html});
  });
}
