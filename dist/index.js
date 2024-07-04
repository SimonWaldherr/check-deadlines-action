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
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const dir = core.getInput('dir') || '.';
            const deadlineExceeded = yield checkDeadlines(dir);
            if (deadlineExceeded) {
                core.setFailed('At least one deadline exceeded');
            }
        }
        catch (error) {
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
            else {
                core.setFailed('Unknown error occurred');
            }
        }
    });
}
function checkDeadlines(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        let deadlineExceeded = false;
        const files = yield getFiles(dir);
        for (const file of files) {
            const exceeded = yield processFile(file);
            if (exceeded) {
                deadlineExceeded = true;
            }
        }
        return deadlineExceeded;
    });
}
function getFiles(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = entries
            .filter((file) => !file.isDirectory())
            .map((file) => path.join(dir, file.name));
        const folders = entries.filter((folder) => folder.isDirectory());
        for (const folder of folders) {
            files.push(...yield getFiles(path.join(dir, folder.name)));
        }
        return files;
    });
}
function processFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = fs.readFileSync(filePath, 'utf8');
        const regex = /@CHECK\((\d{4}-\d{2}-\d{2});[^)]+\)/g;
        const now = new Date();
        let match;
        let deadlineExceeded = false;
        while ((match = regex.exec(data)) !== null) {
            const deadline = new Date(match[1]);
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
            }
            else if (now > deadline7) {
                console.info(`::warning file=${filePath},line=${line}::Deadline in less than 7 days in file: ${filePath}, DEADLINE: ${match[0]}`);
            }
        }
        return deadlineExceeded;
    });
}
run();
