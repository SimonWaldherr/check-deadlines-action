import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
    try {
        const dir: string = core.getInput('dir') || '.';
        const deadlineExceeded: boolean = await checkDeadlines(dir);
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
    let deadlineExceeded: boolean = false;

    const files: string[] = await getFiles(dir);
    for (const file of files) {
        const exceeded: boolean = await processFile(file);
        if (exceeded) {
            deadlineExceeded = true;
        }
    }

    return deadlineExceeded;
}

async function getFiles(dir: string): Promise<string[]> {
    const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = entries
        .filter((file: fs.Dirent) => !file.isDirectory())
        .map((file: fs.Dirent) => path.join(dir, file.name));
    const folders: fs.Dirent[] = entries.filter((folder: fs.Dirent) => folder.isDirectory());

    for (const folder of folders) {
        files.push(...await getFiles(path.join(dir, folder.name)));
    }

    return files;
}

async function processFile(filePath: string): Promise<boolean> {
    const data: string = fs.readFileSync(filePath, 'utf8');
    const regex: RegExp = /@CHECK\((\d{4}-\d{2}-\d{2});[^)]+\)/g;
    const now: Date = new Date();
    let match: RegExpExecArray | null;
    let deadlineExceeded: boolean = false;

    while ((match = regex.exec(data)) !== null) {
        const deadline: Date = new Date(match[1]);
        // ermittle Zeilennummer

        let line = 1;
        for (let i = 0; i < match.index; i++) {
            if (data[i] === '\n') {
                line++;
            }
        }

        let deadline7 = new Date(deadline);
        deadline7.setDate(deadline.getDate() - 7);

        if (now > deadline) {
            console.warn(`::warning file=${filePath},line=${line}::Deadline exceeded in file: ${filePath}, DEADLINE: ${match[0]}`);
            deadlineExceeded = true;
        } else if (now > deadline7) {
            console.info(`::warning file=${filePath},line=${line}::Deadline in less than 7 days in file: ${filePath}, DEADLINE: ${match[0]}`);
        }
    }

    return deadlineExceeded;
}

run();
