#!/usr/bin/env node

const { spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { promises: fsp } = fs;

/**
 * files that require update:
 *      - filename: will try to update the file name
 *      - contents: will try to update the content of the file
 */
const substitutionEnum = Object.freeze({
    filename: 'filename',
    contents: 'contents',
});
const filesToUpdate = {
    'custom-elements.json': [substitutionEnum.contents],
    'examples/index.html': [substitutionEnum.contents],
    'src/custom-element.ts': [substitutionEnum.filename, substitutionEnum.contents],
    'test/test.ts': [substitutionEnum.contents],
    'vscode.html-custom-data.json': [substitutionEnum.contents],
    '.eslintrc.json': [substitutionEnum.contents],
    'package.json': [substitutionEnum.contents],
};

/**
 * file: replaces files' names
 * tag: replaces tags inside files
 * tagName: replaces tag name strings if they're used
 * className: replaces custom element class name inside files
 * suffix: replaces the className suffix inside files
 *         handled separately to allow it to be overwritten
 *         with a custom prefix or empty
 */
const fromCustomElementKey = Object.freeze({
    file: 'custom-element',
    fileSuffix: 'element',
    tag: 'custom-element',
    tagName: 'CUSTOM-ELEMENT',
    className: 'CustomElement',
    suffix: 'Element',
});

/**
 * replacement templates using the format {from:} -> {to:}
 *      - from prefix: will use the fromCustomElementKey object
 *      - to prefix:   will use the targetCustomElementKey object
 */
const replacementTemplateMap = {
    filename: new Map([
        ['{from:file}', '{to:file}-{to:fileSuffix}'],
    ]),
    contents: new Map([
        // tags
        ['<{from:tag}>', '<{to:tag}>'],
        ['</{from:tag}>', '</{to:tag}>'],
        // strings
        ['"{from:tag}"', '"{to:tag}"'],
        ['\'{from:tag}\'', '\'{to:tag}\''],
        // index title
        ['{from:tag} demo', '{to:tag} demo'],
        // srcs
        ['src/{from:tag}\'', 'src/{to:tag}-{to:fileSuffix}\''],
        ['src/{from:tag}.ts', 'src/{to:tag}-{to:fileSuffix}.ts'],
        //tag name (tests)
        ['{from:tagName}', '{to:tagName}'],
        // class name
        ['{from:className}{from:suffix}', '{to:className}{to:suffix}'],
        //package.json
        ['"repository": "github/{from:tag}-boilerplate"', '"repository": "github/{to:tag}-{to:fileSuffix}"'],
        ['"name": "@github/{from:tag}-{from:fileSuffix}"', '"name": "{to:tag}-{to:fileSuffix}"'],
        ['"main": "dist/{from:tag}.js"', '"main": "dist/{to:tag}-{to:fileSuffix}.js"'],
        ['"module": "dist/{from:tag}.js"', '"module": "dist/{to:tag}-{to:fileSuffix}.js"'],
        ['"types": "dist/{from:tag}s.d.ts"', '"types": "dist/{to:tag}-{to:fileSuffix}.d.ts"'],
    ]),
};

//#region [ command line input / output ]
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const readlinePromise = (question) => new Promise(
    (resolve) => rl.question(question, answer => resolve(answer))
);
const isVerbose = () => process.argv.slice(-1)[0] === '--verbose';
const print = (...args) => isVerbose() && console.log(...args);
//#endregion

//#region [ text manipulation ]
const ucFirst = (text) => !text ? text : `${text[0].toUpperCase()}${text.substring(1)}`;
const lcFirst = (text) => !text ? text : `${text[0].toLowerCase()}${text.substring(1)}`;
const escapeRegex = (text) => !text ? text : text.replace(/[/\-\\^$*+?.()|[\]{}<>]/g, '\\$&');
const trimSuffix = (text, suffix) => !text ? text : ((text.endsWith(suffix)) ? text.slice(0, -suffix.length) : text);
//#endregion

const tryFetchGitRepositoryName = () => {
    const spawnOptions = { encoding: 'utf8' };
    const gitSuffix = '.git';

    // try retrieving by remote:origin
    const { stdout: gitOriginRemote } = spawnSync(
        'git', 
        [ 'config', '--get', 'remote.origin.url' ],
        spawnOptions
    );
    
    let byOrigin = path.basename(gitOriginRemote.trim());
    if (byOrigin.endsWith(gitSuffix)) byOrigin = byOrigin.slice(0, -gitSuffix.length);
    if (byOrigin) return byOrigin;

    // try retrieving by foldername
    const { stdout: gitPath } = spawnSync(
        'git',
        [ 'rev-parse', '--show-toplevel' ],
        spawnOptions
    );
    const byPath = path.basename(gitPath);

    return byPath;
};

const calculateCustomElementNameFromRepositoryName = (repositoryName) => 
    repositoryName.split('-').map(word => ucFirst(word)).join('');

const calculateTargetCustomElementKeysByClassName = (targetClassName) => {
    targetClassName = targetClassName

    const dashCase = lcFirst(targetClassName).replace(
        /[A-Z]{1}/g,
        (match) => `-${match[0].toLowerCase()}`
    );

    return {
        file: dashCase,
        fileSuffix: lcFirst(fromCustomElementKey.suffix),
        tag: dashCase,
        tagName: dashCase.toUpperCase(),
        className: targetClassName,
        suffix: fromCustomElementKey.suffix,
    };
};

const setMapEntriesByPrefixedObjectKeys = (replacementMap, prefix, keyValue) => {
    for (const [key, value] of Object.entries(keyValue)) {
        replacementMap.set(`{${prefix}:${key}}`, value);
    }

    return replacementMap;
}

const replaceStringByMapParts = (templateString, replacementMap) => {
    for (const [key, value] of replacementMap.entries()) {
        const regexKey = new RegExp(escapeRegex(key), 'g');
        templateString = templateString.replace(regexKey, value);
    }

    return templateString;
}

const calculateReplacementMap = (fromKeys, toKeys) => {
    const replacementMap = {
        filename: new Map(),
        contents: new Map(),
    };

    const prefixedKeyMap = new Map();
    setMapEntriesByPrefixedObjectKeys(prefixedKeyMap, 'from', fromKeys);
    setMapEntriesByPrefixedObjectKeys(prefixedKeyMap, 'to', toKeys);

    print('templates substitution: ', prefixedKeyMap);

    for (const [type, map] of Object.entries(replacementMap)) {
        for (const [key, value] of replacementTemplateMap[type].entries()) {
            map.set(
                replaceStringByMapParts(key, prefixedKeyMap),
                replaceStringByMapParts(value, prefixedKeyMap)
            );
        }
    }

    return replacementMap;
};

const getFileFullPath = (relativePath) => path.normalize(`${process.cwd()}${path.sep}${relativePath}`);

const calculateTargetFileFullPath = (fromFullPath, replacementMap) => {
    const directory = path.dirname(fromFullPath);
    const basename = path.basename(fromFullPath);
    const extension = path.extname(basename);
    const fileName = basename.slice(0, -extension.length);

    const fileNameReplacement = replaceStringByMapParts(fileName, replacementMap);
    return `${directory}${path.sep}${fileNameReplacement}${extension}`;
};

const replaceFileName = async (fromFullPath, targetFullPath) => {
    if (!fs.existsSync(fromFullPath)) return;
    await fsp.rename(fromFullPath, targetFullPath);
};

const replaceFileContents = async (fileFullPath, replacementMap) => {
    if (!fs.existsSync(fileFullPath)) return;

    const fileContent = await fsp.readFile(fileFullPath, 'utf8');
    const updatedFileContent = replaceStringByMapParts(fileContent, replacementMap);

    await fsp.truncate(fileFullPath);
    await fsp.writeFile(fileFullPath, updatedFileContent);
};

(async () => {
    console.log('');
    console.log('------------------------------------');
    console.log('> Custom Element Boilerplate Setup <');
    console.log('------------------------------------');

    // establishing custom element class name
    const repositoryName = tryFetchGitRepositoryName();
    const customElementNameCandidate = calculateCustomElementNameFromRepositoryName(repositoryName);
    const promptAnswer =  await readlinePromise(`Custom element class name in PascalCase (${customElementNameCandidate}): `);
    const answer = trimSuffix(
        ucFirst(promptAnswer.trim()) || customElementNameCandidate,
        fromCustomElementKey.suffix
    );
    rl.close();

    const toCustomElementKeys = calculateTargetCustomElementKeysByClassName(answer);
    print('target:', toCustomElementKeys);
    
    const replacementMap = calculateReplacementMap(fromCustomElementKey, toCustomElementKeys);
    print('replacements: ', replacementMap);

    for (const [fileRelativePath, flags] of Object.entries(filesToUpdate)) {
        console.log(`Updating ${fileRelativePath}...`);

        const fromFileFullPath = getFileFullPath(fileRelativePath);
        if (flags.includes(substitutionEnum.contents)) await replaceFileContents(fromFileFullPath, replacementMap.contents);

        if (!flags.includes(substitutionEnum.filename)) continue;

        const targetFullPath = calculateTargetFileFullPath(fromFileFullPath, replacementMap.filename);
        await replaceFileName(fromFileFullPath, targetFullPath);
    }

    console.log('\nAll done! Happy hacking.\n');
})();