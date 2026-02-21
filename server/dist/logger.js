const listeners = new Set();
let verboseMode = false;
export function setVerbose(v) {
    verboseMode = v;
}
export function onLog(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function emit(level, message) {
    for (const listener of listeners) {
        try {
            listener(level, message);
        }
        catch {
            // don't crash on listener errors
        }
    }
}
export const log = {
    info(message) {
        console.log(`  ${message}`);
        emit('info', message);
    },
    warn(message) {
        console.log(`  ⚠ ${message}`);
        emit('warn', message);
    },
    error(message) {
        console.error(`  ✗ ${message}`);
        emit('error', message);
    },
    verbose(message) {
        if (verboseMode) {
            console.log(`  [verbose] ${message}`);
        }
        emit('verbose', message);
    },
    step(current, total, message) {
        const line = `[${current}/${total}] ${message}`;
        console.log(`\n  ${line}`);
        emit('info', line);
    },
};
//# sourceMappingURL=logger.js.map