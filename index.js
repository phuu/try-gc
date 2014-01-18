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

var set = {
    white: [],
    grey: [],
    black: []
};

RSVP.hash({ roots: getRoots(), heap: getHeap() })
    .then(function (obj) {
        console.log(require('util').inspect(obj.roots, { depth: null, colors: true }));
        console.log(require('util').inspect(obj.heap, { depth: null, colors: true }));
        // Add the roots to the black set
        set.black = set.black.concat(obj.roots.slice());
        // Add the heap objects to the white set
        set.white = set.white.concat(obj.heap.slice());
        // Visit the roots and add what we find to the grey set
        set.black.forEach(function (root) {
            var heapIds = getIterableElements(searchObject(root));
            resolveFiles(paths.heap, heapIds).map(function (heapPath) {
                set.white = _.without(set.white, heapPath);
                set.grey.push(heapPath);
            });
        });

        var gcPromises = infiniterate(set.grey, function (heapPath) {
            return readFileAsText(heapPath)
                .then(jsonParseFile)
                .then(function (heapObject) {
                    var heapIds = getIterableElements(searchObject(heapObject));
                    resolveFiles(paths.heap, heapIds).map(function (heapPath) {
                        set.white = _.without(set.white, heapPath);
                        set.grey.push(heapPath);
                    });
                    set.grey = _.without(set.grey, heapPath);
                    set.black.push(heapObject);
                    return heapObject;
                });
        });
        return Promise.all(gcPromises).then(function () {
            console.log('GC:', getIterableElements(set.white));
            return deleteFiles(getIterableElements(set.white));
        })
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

/**
 * Recursively search an object for heap references, which look like: "<heapPrefix><id>". Assumes
 * arrays of strings are homogeneous to avoid recursing into buffers.
 * Returns a Set.
 * TODO: Sets are meh
 */
function searchObject(obj, visited) {
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
                Object.mixin(memo, searchObject(value, visited));
            }
        }
        return memo;
    }, new Set());
}

function getRoots() {
    return readDir(paths.roots)
        .then(resolveFiles.bind(null, paths.roots))
        .then(readFilesAsText)
        .then(jsonParseFileArray);
}

function getHeap() {
    return readDir(paths.heap)
        .then(resolveFiles.bind(null, paths.heap));
}

function deleteFiles(paths) {
    return Promise.all(paths.map(function (path) {
        return console.log('delete', path);
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

function readFilesAsText(paths) {
    return Promise.all(paths.map(readFileAsText));
}

function readFileAsText(path) {
    return readFile(path, { encoding: 'utf8' }).then(function (contents) {
        return {
            path: path,
            contents: contents
        };
    });
}

function jsonParseFileArray(files) {
    return files.map(jsonParseFile);
}

function jsonParseFile(fileData) {
    fileData.data = JSON.parse(fileData.contents);
    return fileData;
}

function getIterableElements(iterable) {
    var elems = [];
    iterable.forEach(function (elem) {
        elems.push(elem);
    });
    return elems;
}

function infiniterate(iterable, fn, ctx) {
    var i = 0;
    var result = [];
    while (i < iterable.length) {
        result.push(fn.call(ctx, iterable[i], i, iterable));
        i++;
    }
    return result;
}

function logPromise(name) {
    return function (arg) {
        console.log(name, arg);
        return arg;
    }
}
