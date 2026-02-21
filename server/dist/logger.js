const listeners = new Set();
let verboseMode = false;
const GRAY = '\x1b[90m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';
function timestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}
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
        console.log(`  ${GRAY}${timestamp()}${NC}  ${GREEN}✓${NC}  ${message}`);
        emit('info', message);
    },
    warn(message) {
        console.log(`  ${GRAY}${timestamp()}${NC}  ${YELLOW}⚠${NC}  ${message}`);
        emit('warn', message);
    },
    error(message) {
        console.error(`  ${GRAY}${timestamp()}${NC}  ${RED}✗${NC}  ${message}`);
        emit('error', message);
    },
    verbose(message) {
        if (verboseMode) {
            console.log(`  ${GRAY}${timestamp()}${NC}  ${GRAY}·${NC}  ${GRAY}${message}${NC}`);
        }
        emit('verbose', message);
    },
    step(current, total, message) {
        const line = `[${current}/${total}] ${message}`;
        console.log(`\n  ${GRAY}${timestamp()}${NC}  ${CYAN}${BOLD}${line}${NC}`);
        emit('info', line);
    },
    server(message) {
        console.log(`  ${GRAY}${timestamp()}${NC}  ${CYAN}→${NC}  ${message}`);
        emit('info', message);
    },
    request(method, path, status) {
        const color = status < 400 ? GREEN : status < 500 ? YELLOW : RED;
        console.log(`  ${GRAY}${timestamp()}${NC}  ${color}${method}${NC} ${path} ${GRAY}${status}${NC}`);
    },
};
//# sourceMappingURL=logger.js.map