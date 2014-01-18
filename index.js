require('es6-shim');
var fs = require('fs');
var RSVP = require('rsvp');
var Promise = RSVP.Promise;
var pathutil = require('path');
var _ = require('lodash');

var readDir = RSVP.denodeify(fs.readdir);
var deleteFile = RSVP.denodeify(fs.unlink);
var readFile = RSVP.denodeify(fs.readFile);

var heapPrefix = 'heap!';

var paths = {
    roots: './roots',
    heap: './heap'
};

RSVP.hash({ roots: getAllPaths(paths.roots), heap: getAllPaths(paths.heap) })
    .then(function (obj) {
        console.log(require('util').inspect(obj.roots, { depth: null, colors: true }));
        console.log(require('util').inspect(obj.heap, { depth: null, colors: true }));

        return collectGarbage({
            white: obj.heap,
            grey: obj.roots,
            black: []
        })
        .then(deleteFiles);
    })
    .then(function () {
        console.log('Done!');
    })
    .catch(function (why) {
        console.error(why.stack);
    });

/**
 * Utils
 */

// TODO: protect against circular references
function collectGarbage(sets) {
    var newSets = {
        white: sets.white.slice(),
        grey: [],
        black: sets.black.concat(sets.grey)
    }
    return Promise.resolve(sets.grey)
        .then(map(readFileAsText))
        .then(map(jsonParseFile))
        .then(map(function (current) {
            console.log('== == ========================');
            console.log(require('util').inspect(current, { depth: null, colors: true }));

            var heapIds = getElements(searchObjectForHeapRefs(current.data));
            console.log('heapIds', heapIds);

            // Grab full paths for all heap references and pull them out of white
            resolveFiles(paths.heap, heapIds)
                .map(function (heapPath) {
                    if (newSets.white.indexOf(heapPath) > -1) {
                        newSets.white = _.without(newSets.white, heapPath);
                        newSets.grey.push(heapPath);
                    }
                });
        }))
        .then(function () {
            if (newSets.grey.length) {
                return collectGarbage(newSets);
            }
            return newSets;
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
