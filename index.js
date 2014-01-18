console.time('   ');

require('es6-shim');
var fs = require('fs');
var RSVP = require('rsvp');
var Promise = RSVP.Promise;
var pathutil = require('path');
var chalk = require('chalk');
var _ = require('lodash');

var readDir = RSVP.denodeify(fs.readdir);
var deleteFile = RSVP.denodeify(fs.unlink);
var readFile = RSVP.denodeify(fs.readFile);

var heapPrefix = 'heap!';

var paths = {
    roots: './roots',
    heap: './heap'
};


RSVP.hash({
        white: getAllPaths(paths.heap),
        grey: getAllPaths(paths.roots),
        black: []
    })
    // .then(logPromise('pre GC'))
    .then(collectGarbage)
    // .then(logPromise('post GC'))
    .then(deleteFiles)
    .then(function () {
        console.timeEnd('   ');
    })
    .catch(function (why) {
        console.error(why.stack);
    });

/**
 * Utils
 */

function collectGarbage(sets) {
    var filesToScan = sets.grey;
    // All greys go into the black set as they are reachable
    sets.black = sets.black.concat(sets.grey);
    // Reset grey; it's our new target
    sets.grey = [];
    // Open & parse all the files in the grey set
    return Promise.resolve(filesToScan)
        .then(map(readFileAsText))
        .then(map(jsonParseFile))
        // current: { path: '', contents: '', data: {} }
        .then(map(function (current) {
            // Search the object for references to the heap
            var heapIds = getElements(searchObjectForHeapRefs(current.data));
            // Grab full paths for all heap references
            resolveFiles(paths.heap, heapIds).map(function (heapPath) {
                // Don't recurse!
                if (sets.black.indexOf(heapPath) > -1 || sets.grey.indexOf(heapPath) > -1) {
                    return console.log(chalk.red('circular'), current.path, chalk.yellow('<->'), heapPath);
                }
                // Don't try move something we ain't got.
                // TODO: this is a null-pointer. What to do?
                if (sets.white.indexOf(heapPath) > -1) {
                    // pull them out of white
                    sets.white = _.without(sets.white, heapPath);
                    // And into grey!
                    sets.grey.push(heapPath);
                }
            });
        }))
        .then(function () {
            // Do we have a new set of greys?
            if (sets.grey.length) {
                // Go again!
                return collectGarbage(sets);
            }
            // Ok, we're done here
            return sets;
        })
}

/**
 * Recursively search an object for heap references, which look like: "<heapPrefix><id>". Assumes
 * arrays of strings are homogeneous to avoid recursing into buffers.
 * Returns a Set.
 * TODO: Sets are meh
 */
function searchObjectForHeapRefs(obj, visited) {
    // Keep track of where we've been
    visited = visited || new Set();
    if (visited.has(obj)) return [];
    visited.add(obj);
    // Visit every key
    return Object.keys(obj).reduce(function (memo, key) {
        var value = obj[key];
        if (!value) return memo;
        if (typeof value === 'string' && value.startsWith(heapPrefix)) {
            memo.add(value.slice(heapPrefix.length));
        } else if (typeof value === 'object') {
            // Check array contains a string. We assume from here that it's homogeneous
            if (!Array.isArray(obj) || (typeof obj[0] === 'string')) {
                Object.mixin(memo, searchObjectForHeapRefs(value, visited));
            }
        }
        return memo;
    }, new Set());
}

function getAllPaths(directory) {
    return readDir(directory).then(resolveFiles.bind(null, directory))
}

function deleteFiles(sets) {
    console.log(chalk.red('GC'), require('util').inspect(sets.white, { depth: null, colors: true }));
    return Promise.all(sets.white.map(function (path) {
        return deleteFile(path);
    }));
}

function saveAs(obj, key, result) {
    obj[key] = result;
    return result;
}

function resolveFiles(rootPath, files) {
    return files.map(function (filename) {
        return pathutil.resolve(rootPath, filename);
    });
}

function readFileAsText(path) {
    return readFile(path, { encoding: 'utf8' }).then(function (contents) {
        return {
            path: path,
            contents: contents
        };
    });
}

function jsonParseFile(fileData) {
    fileData.data = JSON.parse(fileData.contents);
    return fileData;
}

function map(fn, ctx) {
    return function (iterable) {
        return Promise.all(iterable.map(fn, ctx));
    }
}

function getElements(iterable) {
    var elems = [];
    iterable.forEach(function (elem) {
        elems.push(elem);
    });
    return elems;
}

function logPromise(name) {
    return function (arg) {
        console.log(name, require('util').inspect(arg, { depth: null, colors: true }));
        return arg;
    }
}
