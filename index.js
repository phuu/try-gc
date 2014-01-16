require('es6-shim');
var fs = require('fs');
var RSVP = require('rsvp');
var Promise = RSVP.Promise;
var pathutil = require('path');

var readDir = RSVP.denodeify(fs.readdir);
var deleteFile = RSVP.denodeify(fs.unlink);
var readFile = RSVP.denodeify(fs.readFile);

var paths = {
    roots: './roots',
    heap: './heap'
};

var set = {
    white: new Set(),
    grey: new Set(),
    black: new Set()
};

var obj = {
    roots: null,
    heap: null
};

Promise.resolve()
    .then(getRoots)
    .then(getHeap)
    .then(function () {
        console.log('obj.roots', obj.roots);
        console.log('obj.heap', obj.heap);
        // Add the heap objects to the white set
        obj.heap.map(set.white.add.bind(set.white));
        // Visit the roots and add what we find to the grey set
        obj.roots.forEach(function (root) {
            resolveFiles(paths.heap, root.data.caches).map(function (cachePath) {
                set.white.delete(cachePath);
                set.grey.add(cachePath);
            });
        });

        console.log('GC:', getIterableElements(set.white));
        return deleteFiles(getIterableElements(set.white));
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

function getRoots() {
    return readDir(paths.roots)
        .then(resolveFiles.bind(null, paths.roots))
        .then(readFilesAsText)
        .then(jsonParseArray)
        .then(saveAs.bind(null, obj, 'roots'));
}

function getHeap() {
    return readDir(paths.heap)
        .then(resolveFiles.bind(null, paths.heap))
        .then(saveAs.bind(null, obj, 'heap'));
}

function deleteFiles(paths) {
    return Promise.all(paths.map(function (path) {
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

function readFilesAsText(paths) {
    return Promise.all(paths.map(function (path) {
        return readFile(path, { encoding: 'utf8' }).then(function (contents) {
            return {
                path: path,
                contents: contents
            };
        });
    }));
}

function jsonParseArray(files) {
    return files.map(function (fileData) {
        fileData.data = JSON.parse(fileData.contents);
        return fileData;
    });
}

function getIterableElements(iterable) {
    var elems = [];
    iterable.forEach(function (elem) {
        elems.push(elem);
    });
    return elems;
}