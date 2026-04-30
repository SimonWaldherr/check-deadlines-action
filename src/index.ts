// Import necessary modules from the GitHub Actions toolkit and Node.js standard libraries.
import * as core from '@actions/core';  // Provides core functionalities for GitHub Actions such as input retrieval and logging.
import * as fs from 'fs';              // File system module for reading directories and files.
import * as path from 'path';          // Path module for handling file and directory paths.

const CHECK_PATTERN = /@CHECK\(([^)]+)\)/g;
const DIRECT_MENTION_PATTERN = /^@[^\s;]+$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The main function that is executed when the GitHub Action is triggered.
 * It retrieves the directory input, checks for deadline conditions in files,
 * and sets the action state to failed if any deadlines have been exceeded.
 */
async function run(): Promise<void> {
    try {
        // Retrieve the directory to search for files. Defaults to the current directory if not specified.
        const dir: string = core.getInput('dir') || '.';

        // When true, only emit warnings without failing the action even if deadlines are exceeded.
        const warnOnly: boolean = core.getInput('warn-only').toLowerCase() === 'true';

        // Number of days before the deadline to start emitting a warning notice.
        const warningDaysRaw: number = parseInt(core.getInput('warning-days') || '7', 10);
        if (isNaN(warningDaysRaw) || warningDaysRaw < 0) {
            throw new Error(`Invalid 'warning-days' value: "${core.getInput('warning-days')}". Must be a non-negative integer.`);
        }
        const warningDays: number = warningDaysRaw;

        // Comma-separated list of directory or file names to exclude from scanning.
        const excludeInput: string = core.getInput('exclude');
        const exclude: string[] = excludeInput
            ? excludeInput.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [];

        // Check if any file in the specified directory (and subdirectories) has an exceeded deadline.
        const deadlineExceeded: boolean = checkDeadlines(dir, warningDays, exclude);

        // If at least one deadline is exceeded and warn-only is not set, mark the action as failed.
        if (deadlineExceeded && !warnOnly) {
            core.setFailed('At least one deadline exceeded');
        }
    } catch (error) {
        // If an error occurs, capture it and mark the GitHub Action as failed with the error message.
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('Unknown error occurred');
        }
    }
}

/**
 * Recursively checks all files in the given directory for deadline markers.
 *
 * @param dir         - The directory path from where to start scanning files.
 * @param warningDays - Number of days before the deadline to emit a warning notice.
 * @param exclude     - List of directory or file names to skip.
 * @returns True if any file has a deadline that has been exceeded.
 */
function checkDeadlines(dir: string, warningDays: number, exclude: string[]): boolean {
    let deadlineExceeded: boolean = false;

    const files: string[] = getFiles(dir, exclude);

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
function getFiles(dir: string, exclude: string[]): string[] {
    const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });

    const files: string[] = entries
        .filter((entry: fs.Dirent) => !entry.isDirectory())
        .filter((entry: fs.Dirent) => !exclude.includes(entry.name))
        .map((entry: fs.Dirent) => path.join(dir, entry.name));

    const folders: fs.Dirent[] = entries.filter(
        (entry: fs.Dirent) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !exclude.includes(entry.name)
    );

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
function processFile(filePath: string, warningDays: number): boolean {
    let data: string;
    try {
        data = fs.readFileSync(filePath, 'utf8');
    } catch {
        // Skip files that cannot be read as UTF-8 (e.g. binary files).
        return false;
    }

    const todayUtc = getUtcDayTimestamp(new Date());

    let deadlineExceeded: boolean = false;

    let match: RegExpExecArray | null;
    while ((match = CHECK_PATTERN.exec(data)) !== null) {
        const parsedCheck = parseCheckAnnotation(match[1]);

        // Determine the line number where the deadline marker is located.
        let line = 1;
        for (let i = 0; i < match.index; i++) {
            if (data[i] === '\n') {
                line++;
            }
        }

        if (parsedCheck === null) {
            core.warning(
                `Invalid @CHECK annotation: ${match[0]}`,
                { file: filePath, startLine: line }
            );
            continue;
        }

        const { deadlineUtc, mentions } = parsedCheck;
        const mentionSuffix = formatMentionSuffix(mentions);

        const warningThresholdUtc = deadlineUtc - (warningDays * MS_PER_DAY);

        if (todayUtc > deadlineUtc) {
            core.warning(
                `Deadline exceeded: ${match[0]}${mentionSuffix}`,
                { file: filePath, startLine: line }
            );
            deadlineExceeded = true;
        } else if (todayUtc >= warningThresholdUtc) {
            core.notice(
                `Deadline in less than ${warningDays} days: ${match[0]}${mentionSuffix}`,
                { file: filePath, startLine: line }
            );
        }
    }

    return deadlineExceeded;
}

function getUtcDayTimestamp(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseDeadlineDate(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);

    const deadlineUtc = Date.UTC(year, monthIndex, day);
    const deadline = new Date(deadlineUtc);

    if (
        deadline.getUTCFullYear() !== year ||
        deadline.getUTCMonth() !== monthIndex ||
        deadline.getUTCDate() !== day
    ) {
        return null;
    }

    return deadlineUtc;
}

function parseCheckAnnotation(value: string): { deadlineUtc: number; mentions: string[] } | null {
    const parts = value.split(';').map((part) => part.trim());
    if (parts.length < 2) {
        return null;
    }

    const deadlineUtc = parseDeadlineDate(parts[0]);
    if (deadlineUtc === null) {
        return null;
    }

    const mentions = parts.slice(1).filter((part) => DIRECT_MENTION_PATTERN.test(part));

    return { deadlineUtc, mentions };
}

function formatMentionSuffix(mentions: string[]): string {
    if (mentions.length === 0) {
        return '';
    }

    return ` (mentions: ${mentions.join(', ')})`;
}

// Execute the main function.
run();
