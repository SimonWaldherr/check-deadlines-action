import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

const MENTION_PATTERN = /^@[^\s;]+$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_EXCLUDE = ['node_modules', 'dist'];

type AnnotationSpan = { index: number; valueIndex: number; end: number | null };

function run(): void {
    try {
        const dir = core.getInput('dir') || '.';
        const warnOnly = core.getInput('warn-only').toLowerCase() === 'true';

        const warningDaysInput = core.getInput('warning-days') || '7';
        const warningDays = Number(warningDaysInput);
        if (!/^\d+$/.test(warningDaysInput) || !Number.isSafeInteger(warningDays)) {
            throw new Error(`Invalid 'warning-days' value: "${warningDaysInput}". Must be a non-negative safe integer.`);
        }

        const exclude = parseExcludeInput(core.getInput('exclude'));
        const deadlineExceeded = checkDeadlines(dir, warningDays, exclude);

        if (deadlineExceeded && !warnOnly) {
            core.setFailed('At least one deadline exceeded');
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('Unknown error occurred');
        }
    }
}

function checkDeadlines(dir: string, warningDays: number, exclude: string[]): boolean {
    let deadlineExceeded = false;
    const todayUtc = getUtcDayTimestamp(new Date());

    for (const file of getFiles(dir, new Set(exclude))) {
        if (processFile(file, warningDays, todayUtc)) {
            deadlineExceeded = true;
        }
    }

    return deadlineExceeded;
}

/**
 * Yield regular files without retaining the entire repository's file list or
 * following symlinks. Hidden directories and excluded names are skipped.
 */
function* getFiles(dir: string, exclude: ReadonlySet<string>): Generator<string> {
    const pendingDirectories = [dir];

    while (pendingDirectories.length > 0) {
        const currentDirectory = pendingDirectories.pop()!;
        const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });

        for (const entry of entries) {
            if (exclude.has(entry.name)) {
                continue;
            }

            const entryPath = path.join(currentDirectory, entry.name);
            if (entry.isFile()) {
                yield entryPath;
            } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                pendingDirectories.push(entryPath);
            }
        }
    }
}

function processFile(filePath: string, warningDays: number, todayUtc: number): boolean {
    let contents: Buffer;
    try {
        contents = fs.readFileSync(filePath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read file "${filePath}": ${message}`);
    }

    // Avoid decoding files without markers. UTF-8 decoding alone does not reject binary data.
    if (!contents.includes('@CHECK') || contents.includes(0)) {
        return false;
    }
    const data = contents.toString('utf8');

    let deadlineExceeded = false;
    let line = 1;
    let lineOffset = 0;

    for (const match of findCheckAnnotations(data)) {
        const parsedCheck = parseCheckAnnotation(match.value);

        // Advance once through the file instead of recounting from its start for every marker.
        for (; lineOffset < match.index; lineOffset++) {
            if (data[lineOffset] === '\n') {
                line++;
            }
        }

        if (parsedCheck === null) {
            core.warning(
                `Invalid @CHECK annotation: ${match.text}`,
                { file: filePath, startLine: line }
            );
            continue;
        }

        const { deadlineUtc, mentions } = parsedCheck;
        const mentionSuffix = formatMentionSuffix(mentions);

        const warningThresholdUtc = deadlineUtc - (warningDays * MS_PER_DAY);

        if (todayUtc > deadlineUtc) {
            core.warning(
                `Deadline exceeded: ${match.text}${mentionSuffix}`,
                { file: filePath, startLine: line }
            );
            deadlineExceeded = true;
        } else if (todayUtc >= warningThresholdUtc) {
            const daysRemaining = (deadlineUtc - todayUtc) / MS_PER_DAY;
            core.notice(
                `Deadline in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}: ${match.text}${mentionSuffix}`,
                { file: filePath, startLine: line }
            );
        }
    }

    return deadlineExceeded;
}

function getUtcDayTimestamp(date: Date): number {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Find complete annotations, preserving nested parentheses and source offsets. */
function* findCheckAnnotations(data: string): Generator<{ text: string; value: string; index: number }> {
    const tokens = /@CHECK\(|[()]/g;
    const spans: AnnotationSpan[] = [];
    const openParentheses: (AnnotationSpan | null)[] = [];
    let match: RegExpExecArray | null;

    // Pair parentheses once; restarting at every unclosed marker rescans entire suffixes.
    while ((match = tokens.exec(data)) !== null) {
        if (match[0] === ')') {
            const span = openParentheses.pop();
            if (span) {
                span.end = tokens.lastIndex;
            }
        } else if (match[0] === '(') {
            if (openParentheses.length > 0) {
                openParentheses.push(null);
            }
        } else {
            const span: AnnotationSpan = { index: match.index, valueIndex: tokens.lastIndex, end: null };
            spans.push(span);
            openParentheses.push(span);
        }
    }

    // Complete outer annotations consume their nested markers. Unclosed ones do not.
    let previousEnd = 0;
    for (const span of spans) {
        if (span.end === null || span.index < previousEnd) {
            continue;
        }
        yield {
            text: data.slice(span.index, span.end),
            value: data.slice(span.valueIndex, span.end - 1),
            index: span.index
        };
        previousEnd = span.end;
    }
}

/** Parse a YYYY-MM-DD calendar date without normalizing invalid days or months. */
function parseDeadlineDate(value: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);

    // Date.UTC interprets years 00–99 as 1900–1999; setUTCFullYear preserves them.
    const deadline = new Date(0);
    deadline.setUTCFullYear(year, monthIndex, day);
    const deadlineUtc = deadline.getTime();

    if (
        deadline.getUTCFullYear() !== year ||
        deadline.getUTCMonth() !== monthIndex ||
        deadline.getUTCDate() !== day
    ) {
        return null;
    }

    return deadlineUtc;
}

/** Parse the date and standalone mentions from semicolon-delimited fields. */
function parseCheckAnnotation(value: string): { deadlineUtc: number; mentions: string[] } | null {
    const parts = value.split(';').map((part) => part.trim());
    if (parts[0] === '') {
        return null;
    }

    const deadlineUtc = parseDeadlineDate(parts[0]);
    if (deadlineUtc === null) {
        return null;
    }

    const mentions = parts.slice(1).filter((part) => MENTION_PATTERN.test(part));

    return { deadlineUtc, mentions };
}

function formatMentionSuffix(mentions: string[]): string {
    if (mentions.length === 0) {
        return '';
    }

    return ` (mentions: ${mentions.join(', ')})`;
}

function parseExcludeInput(value: string): string[] {
    const configuredExcludes = value
        ? value.split(',').map((entry: string) => entry.trim()).filter(Boolean)
        : [];

    return Array.from(new Set([...DEFAULT_EXCLUDE, ...configuredExcludes]));
}

export {
    findCheckAnnotations,
    parseCheckAnnotation,
    formatMentionSuffix,
    parseExcludeInput
};

if (require.main === module) {
    run();
}
