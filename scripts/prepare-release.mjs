import {mkdir, readFile, writeFile, cp, rm} from 'node:fs/promises';
import path from 'node:path';
import {builtinModules} from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const staging = path.resolve(root, '.build-cache', 'app');
if (staging !== path.join(root, '.build-cache', 'app')) throw new Error('Invalid staging path');
await rm(staging, {recursive: true, force: true});
await mkdir(path.join(staging, 'dist-electron'), {recursive: true});
await cp(path.join(root, 'dist'), path.join(staging, 'dist'), {recursive: true});

// Ship only the main bundle's reachable chunks, never stale builds or source dependencies.
const copied = new Set();
async function copyChunk(relative) {
    if (copied.has(relative)) return;
    if (path.basename(relative) !== relative) throw new Error('Unexpected chunk path');
    copied.add(relative);
    const source = await readFile(path.join(root, 'dist-electron', relative), 'utf8');
    const imports = [];
    const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const specifier of imports) {
        if (specifier.startsWith('./')) await copyChunk(specifier.slice(2));
        else if (specifier !== 'electron' && !builtinModules.includes(specifier) && !specifier.startsWith('node:')) {
            throw new Error(`Unbundled runtime dependency: ${specifier}`);
        }
    }
    await writeFile(path.join(staging, 'dist-electron', relative), source);
}
await copyChunk('main.js');
await copyChunk('preload.mjs');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const {name, version, description, author, license, type, main} = pkg;
await writeFile(path.join(staging, 'package.json'), JSON.stringify({name, version, description, author, license, type, main}, null, 2));
console.log(`Prepared ${version}, ${copied.size} runtime files; all dependencies bundled.`);
