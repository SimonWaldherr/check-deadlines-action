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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
            // Check if any file in the specified directory (and subdirectories) has an exceeded deadline.
            const deadlineExceeded = yield checkDeadlines(dir);
            // If at least one deadline is exceeded, mark the GitHub Action as failed.
            if (deadlineExceeded) {
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
 * @param dir - The directory path from where to start scanning files.
 * @returns A Promise that resolves to true if any file has a deadline that has been exceeded.
 */
function checkDeadlines(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        // Initialize a flag to track if any deadlines have been exceeded.
        let deadlineExceeded = false;
        // Retrieve all files (including those in subdirectories) from the directory.
        const files = yield getFiles(dir);
        // Process each file to check if deadlines have been exceeded.
        for (const file of files) {
            // Process the file and check its content for deadline markers.
            const exceeded = yield processFile(file);
            // If any file shows that its deadline is exceeded, update the flag.
            if (exceeded) {
                deadlineExceeded = true;
            }
        }
        // Return the overall result. True if at least one exceeded deadline is found.
        return deadlineExceeded;
    });
}
/**
 * Recursively retrieves all file paths from the specified directory and its subdirectories.
 *
 * @param dir - The directory from where files are listed.
 * @returns A Promise that resolves to an array of file paths.
 */
function getFiles(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        // Read the contents of the directory, including details about whether each entry is a file or a directory.
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        // Filter out files from the directory entries and create their full paths.
        const files = entries
            .filter((entry) => !entry.isDirectory()) // Only select entries that are files.
            .map((entry) => path.join(dir, entry.name)); // Create full paths for these files.
        // Filter out directories to search them recursively.
        const folders = entries.filter((entry) => entry.isDirectory());
        // Recursively get files from each subdirectory and add them to the list.
        for (const folder of folders) {
            // Construct the path for the subdirectory and fetch its files.
            const subDirFiles = yield getFiles(path.join(dir, folder.name));
            files.push(...subDirFiles); // Merge the files from the subdirectory into the main files array.
        }
        // Return the complete list of files found.
        return files;
    });
}
/**
 * Processes a single file to check if it contains deadline markers and whether deadlines are exceeded.
 *
 * The deadline markers are expected to be in the format: @CHECK(YYYY-MM-DD; any text)
 *
 * @param filePath - The full path of the file to be processed.
 * @returns A Promise that resolves to true if any deadline in the file is exceeded.
 */
function processFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        // Read the file content as a UTF-8 encoded string.
        const data = fs.readFileSync(filePath, 'utf8');
        // Regular expression to match the deadline markers.
        // It captures a date in the format YYYY-MM-DD followed by a semicolon and any characters until the closing parenthesis.
        const regex = /@CHECK\((\d{4}-\d{2}-\d{2});[^)]+\)/g;
        // Get the current date and time.
        const now = new Date();
        // Variable to track if any deadline in this file is exceeded.
        let deadlineExceeded = false;
        // This loop goes through all matches of the regex in the file data.
        let match;
        while ((match = regex.exec(data)) !== null) {
            // Parse the deadline date from the first captured group of the regex.
            const deadline = new Date(match[1]);
            // Determine the line number where the deadline marker is located.
            // We count the number of newline characters from the start of the file until the index of the match.
            let line = 1;
            for (let i = 0; i < match.index; i++) {
                if (data[i] === '\n') {
                    line++;
                }
            }
            // Calculate the date 7 days before the actual deadline.
            let deadline7 = new Date(deadline);
            deadline7.setDate(deadline.getDate() - 7);
            // Check if the current date is past the deadline.
            if (now > deadline) {
                // Log a warning in GitHub Actions annotation format, including file name and line number.
                console.warn(`::warning file=${filePath},line=${line}::Deadline exceeded in file: ${filePath}, DEADLINE: ${match[0]}`);
                deadlineExceeded = true;
            }
            // Check if the current date is within 7 days of the deadline.
            else if (now > deadline7) {
                // Log an informational message indicating that the deadline is approaching in less than 7 days.
                console.info(`::warning file=${filePath},line=${line}::Deadline in less than 7 days in file: ${filePath}, DEADLINE: ${match[0]}`);
            }
        }
        // Return whether any deadline in the file was exceeded.
        return deadlineExceeded;
    });
}
// Execute the main function.
run();
