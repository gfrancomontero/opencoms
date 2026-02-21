import { execSync } from 'child_process';
import { log } from '../logger.js';
export function openFolderPicker() {
    try {
        const script = `
      set chosenFolder to choose folder with prompt "Choose a folder to index with OpenComs"
      return POSIX path of chosenFolder
    `;
        const result = execSync(`osascript -e '${script}'`, {
            encoding: 'utf-8',
            timeout: 120000, // 2 min timeout for user interaction
        }).trim();
        // Remove trailing slash if present
        return result.endsWith('/') ? result.slice(0, -1) : result;
    }
    catch (err) {
        // User cancelled the dialog
        if (err.status === 1) {
            log.info('Folder selection cancelled');
            return null;
        }
        log.error(`Folder picker error: ${err.message}`);
        return null;
    }
}
//# sourceMappingURL=folder-picker.js.map