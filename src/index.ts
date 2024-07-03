import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
    try {
        const dir = core.getInput('dir') || '.';
        const deadlineExceeded = await checkDeadlines(dir);
        if (deadlineExceeded) {
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

async function checkDeadlines(dir: string): Promise<boolean> {
    let deadlineExceeded = false;

    const files = await getFiles(dir);
    for (const file of files) {
        const exceeded = await processFile(file);
        if (exceeded) {
            deadlineExceeded = true;
        }
    }

    return deadlineExceeded;
}

async function getFiles(dir: string): Promise<string[]> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
        .filter(file => !file.isDirectory())
        .map(file => path.join(dir, file.name));
    const folders = entries.filter(folder => folder.isDirectory());

    for (const folder of folders) {
        files.push(...await getFiles(path.join(dir, folder.name)));
    }

    return files;
}

async function processFile(filePath: string): Promise<boolean> {
    const data = fs.readFileSync(filePath, 'utf8');
    const regex = /@CHECK\((\d{4}-\d{2}-\d{2});[^;]*;[^;]*;[^;]*;[^;]*\)/g;
    const now = new Date();
    let match;
    let deadlineExceeded = false;

    while ((match = regex.exec(data)) !== null) {
        const deadline = new Date(match[1]);
        if (now > deadline) {
            core.warning(`Deadline exceeded in file: ${filePath}, DEADLINE: ${match[0]}`);
            deadlineExceeded = true;
        }
    }

    return deadlineExceeded;
}

run();
