#!/usr/bin/env node

const { spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { promises: fsp } = fs;

/**
 * tag: replaces tags inside files
 * file: replaces files name:
 * className: replaces custom element class name inside files
 * suffix: replaces the className suffix inside files
 *         handled separately to allow it to be overwritten
 *         with a custom prefix or empty
 */
const fromCustomElementKey = Object.freeze({
    file: 'custom-element',
    tag: 'custom-element',
    className: 'CustomElement',
    suffix: 'Element',
});

/**
 * replacement templates using the format {from:} -> {to:}
 *      - from prefix: will use the fromCustomElementKey object
 *      - to prefix:   will use the targetCustomElementKey object
 */
const replacementTemplateMap = new Map([
  ["{from:file}s", "{to:file}"],
  ["{from:file}", "{to:file}"],
  ["{from:tag}", "{to:tag}"],
  ["{from:className}{from:suffix}", "{to:className}{to:suffix}"],
]);

/**
 * files that require update:
 *      - filename: will try to update the file name
 *      - contents: will try to update the content of the file
 */
const substitutionEnum = Object.freeze({
    filename: 'filename',
    contents: 'contents',
});
const filesToUpate = {
    'custom-elements.json': [substitutionEnum.filename, substitutionEnum.contents],
    'custom-elements-manifest.config.js': [substitutionEnum.filename],
    'examples/index.html': [substitutionEnum.contents],
    'src/custom-element.ts': [substitutionEnum.filename, substitutionEnum.contents],
    'test/test.ts': [substitutionEnum.contents],
};

//#region [ command line input ]
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const readlinePromise = (question) => new Promise(
    (resolve) => rl.question(question, answer => resolve(answer))
);
//#endregion

const ucFirst = (text) => !text ? text : `${text[0].toUpperCase()}${text.substring(1)}`;
const lcFirst = (text) => !text ? text : `${text[0].toLowerCase()}${text.substring(1)}`;

const tryFetchGitRepositoryName = () => {
    const spawnOptions = { encoding: 'utf8' };

    // try retrieving by remote:origin
    const { stdout: gitOriginRemote } = spawnSync(
        'git', 
        [ 'config', '--get', 'remote.origin.url' ],
        spawnOptions
    );
    
    const byOrigin = path.basename(gitOriginRemote.trim()).slice(0, -'.git'.length);
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

const calculateCustomElementNameFromRepositoryName = (repositoryName) => {
    const className = repositoryName
        .split('-')
        .map(word => ucFirst(word))
        .join('');
    
    return (className.endsWith(fromCustomElementKey.suffix)) 
        ? className.slice(0, -customElementKeys.suffix.length)
        : className;
};

const calculateTargetCustomElementKeysByClassName = (targetClassName) => {
    const dashCase = lcFirst(targetClassName).replace(
        /[A-Z]{1}/g,
        (match) => `-${match[0].toLowerCase()}`
    );

    return {
        file: dashCase,
        tag: dashCase,
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
        templateString = templateString.replace(key, value);
    }

    return templateString;
}

const calculateReplacementMap = (fromKeys, toKeys) => {
    const replacementMap = new Map();

    const prefixedKeyMap = new Map();
    setMapEntriesByPrefixedObjectKeys(prefixedKeyMap, 'from', fromKeys);
    setMapEntriesByPrefixedObjectKeys(prefixedKeyMap, 'to', toKeys);

    console.log(prefixedKeyMap);

    for (const [key, value] of replacementTemplateMap.entries()) {
        replacementMap.set(
            replaceStringByMapParts(key, prefixedKeyMap),
            replaceStringByMapParts(value, prefixedKeyMap)
        );
    }

    return replacementMap;
};

const calculateTargetFileFullPath = (fromFilePath, replacementMap) => {
    const fromFullPath = path.normalize(`${process.cwd()}${path.sep}${fromFilePath}`);
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
    const answer = ucFirst(promptAnswer.trim()) || customElementNameCandidate;
    rl.close();

    const toCustomElementKeys = calculateTargetCustomElementKeysByClassName(answer);
    console.log(toCustomElementKeys);
    
    const replacementMap = calculateReplacementMap(fromCustomElementKey, toCustomElementKeys);
    console.log(replacementMap);

    for (const [key, value] of Object.entries(filesToUpate)) {
        console.log(`Updating ${key}...`);

        const targetFullPath = calculateTargetFileFullPath(key, replacementMap);

        if (value.includes(substitutionEnum.filename)) await replaceFileName(key, targetFullPath);
        if (value.includes(substitutionEnum.contents)) await replaceFileContents(targetFullPath, replacementMap);
    }

    console.log('\nAll done! Happy hacking.\n');
})();