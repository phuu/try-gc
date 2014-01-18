# try-gc

This is just me messing around with GCing files. It will make its way into the [ServiceWorker Polyfill](/phuu/ServiceWorker-Polyfill).

To run:

```
$ ./reset && node index.js
circular /path/to/try-gc/heap/9.json <-> /path/to/try-gc/heap/3.json
GC [ '/path/to/try-gc/heap/8.json' ]
   : 47ms
```