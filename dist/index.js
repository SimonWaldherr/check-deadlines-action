"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import necessary modules from the GitHub Actions toolkit and Node.js standard libraries.
const core = __importStar(require("@actions/core")); // Provides core functionalities for GitHub Actions such as input retrieval and logging.
const fs = __importStar(require("fs")); // File system module for reading directories and files.
const path = __importStar(require("path")); // Path module for handling file and directory paths.
/**
 * The main function that is executed when the GitHub Action is triggered.
 * It retrieves the directory input, checks for deadline conditions in files,
 * and sets the action state to failed if any deadlines have been exceeded.
 */
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Retrieve the directory to search for files. Defaults to the current directory if not specified.
            const dir = core.getInput('dir') || '.';
            // When true, only emit warnings without failing the action even if deadlines are exceeded.
            const warnOnly = core.getInput('warn-only').toLowerCase() === 'true';
            // Number of days before the deadline to start emitting a warning notice.
            const warningDaysRaw = parseInt(core.getInput('warning-days') || '7', 10);
            if (isNaN(warningDaysRaw) || warningDaysRaw < 0) {
                throw new Error(`Invalid 'warning-days' value: "${core.getInput('warning-days')}". Must be a non-negative integer.`);
            }
            const warningDays = warningDaysRaw;
            // Comma-separated list of directory or file names to exclude from scanning.
            const excludeInput = core.getInput('exclude');
            const exclude = excludeInput
                ? excludeInput.split(',').map((s) => s.trim()).filter(Boolean)
                : [];
            // Check if any file in the specified directory (and subdirectories) has an exceeded deadline.
            const deadlineExceeded = checkDeadlines(dir, warningDays, exclude);
            // If at least one deadline is exceeded and warn-only is not set, mark the action as failed.
            if (deadlineExceeded && !warnOnly) {
                core.setFailed('At least one deadline exceeded');
            }
        }
        catch (error) {
            // If an error occurs, capture it and mark the GitHub Action as failed with the error message.
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
            else {
                core.setFailed('Unknown error occurred');
            }
        }
    });
}
/**
 * Recursively checks all files in the given directory for deadline markers.
 *
 * @param dir         - The directory path from where to start scanning files.
 * @param warningDays - Number of days before the deadline to emit a warning notice.
 * @param exclude     - List of directory or file names to skip.
 * @returns True if any file has a deadline that has been exceeded.
 */
function checkDeadlines(dir, warningDays, exclude) {
    let deadlineExceeded = false;
    const files = getFiles(dir, exclude);
    for (const file of files) {
        if (processFile(file, warningDays)) {
            deadlineExceeded = true;
        }
    }
    return deadlineExceeded;
}
/**
 * Recursively retrieves all file paths from the specified directory and its subdirectories.
 * Hidden directories (names starting with '.') and any names listed in `exclude` are skipped.
 *
 * @param dir     - The directory from where files are listed.
 * @param exclude - List of directory or file names to skip.
 * @returns An array of file paths.
 */
function getFiles(dir, exclude) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
        .filter((entry) => !entry.isDirectory())
        .filter((entry) => !exclude.includes(entry.name))
        .map((entry) => path.join(dir, entry.name));
    const folders = entries.filter((entry) => entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !exclude.includes(entry.name));
    for (const folder of folders) {
        files.push(...getFiles(path.join(dir, folder.name), exclude));
    }
    return files;
}
/**
 * Processes a single file to check if it contains deadline markers and whether deadlines are exceeded.
 *
 * The deadline markers are expected to be in the format: @CHECK(YYYY-MM-DD; any text)
 *
 * @param filePath    - The full path of the file to be processed.
 * @param warningDays - Number of days before the deadline to emit a warning notice.
 * @returns True if any deadline in the file is exceeded.
 */
function processFile(filePath, warningDays) {
    let data;
    try {
        data = fs.readFileSync(filePath, 'utf8');
    }
    catch (_a) {
        // Skip files that cannot be read as UTF-8 (e.g. binary files).
        return false;
    }
    // Regular expression to match the deadline markers.
    // It captures a date in the format YYYY-MM-DD followed by a semicolon and any characters until the closing parenthesis.
    const regex = /@CHECK\((\d{4}-\d{2}-\d{2});[^)]+\)/g;
    // Get the current date and time.
    const now = new Date();
    let deadlineExceeded = false;
    let match;
    while ((match = regex.exec(data)) !== null) {
        // Parse the deadline date from the first captured group of the regex.
        const deadline = new Date(match[1]);
        // Determine the line number where the deadline marker is located.
        let line = 1;
        for (let i = 0; i < match.index; i++) {
            if (data[i] === '\n') {
                line++;
            }
        }
        // Calculate the date `warningDays` days before the actual deadline.
        const warningThreshold = new Date(deadline);
        warningThreshold.setDate(deadline.getDate() - warningDays);
        // Check if the current date is past the deadline.
        if (now > deadline) {
            core.warning(`Deadline exceeded: ${match[0]}`, { file: filePath, startLine: line });
            deadlineExceeded = true;
        }
        else if (now > warningThreshold) {
            // Deadline is approaching within the warning window.
            core.notice(`Deadline in less than ${warningDays} days: ${match[0]}`, { file: filePath, startLine: line });
        }
    }
    return deadlineExceeded;
}
// Execute the main function.
run();
