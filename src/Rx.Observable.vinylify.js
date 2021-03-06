// Import vinyl-fs@2.4.3 stream functions
const wrapWithVinylFile = require('vinyl-fs/lib/src/wrapWithVinylFile');
const filterSince = require('vinyl-fs/lib/filterSince');
const getContents = require('vinyl-fs/lib/src/getContents');
const Vinyl = require('vinyl');
const wrapWithVinylFileSync = require('./wrapWithVinylFileSync');
const filterSinceSync = require('./filterSinceSync');
const getContentsSync = require('./getContentsSync');

// Use the specific library entity from outside
function use(Rx) {
  
  return { vinylify };
  
  // `vinylify()` will filter the file event and then map a passed value to Vinyl.
  //
  // @param filter An array or a string. The possible values are `add`, `change`,
  // `unlink`, `addDir`, `unlinkDir`, and `all` (default is `['add', 'change']`).
  function vinylify(opt = {}) {
    
    const options = Object.assign({
      // vinylify asynchronously or not
      async: true,
      
      // For whitelist filter
      eventFilter: ['add', 'change', 'unlink'],
      
      // For creating vinyl file (followSymlinks)
      followSymlinks: true,
      
      // For reading the file into buffer (getContents)
      read: true,
      buffer: true,
      stripBOM: true,
      
    }, opt);
    
    // whitelist: list the fs.events which we allow to pass the filter.
    const eventFilter = extract(options, "eventFilter");
    const filtered$ = filterByWhitelist(this, eventFilter);
    
    // Map to a vinyl file for gulp stream.
    const vinyl$ = mapToVinyl(filtered$, options);
    
    return vinyl$;
    
    // ---------
    // Functions
    // ---------
    
    function extract(obj, key) { 
      const val = obj[key];
      delete obj[key];
      return val;
    };
    
    // Whitelist
    // 
    // * Filter the proerty `type` of the stream values from this Observable 
    //   against the whitelist parameter `filter`.
    // * ['all', ...] or 'all' will not filter stream values (pass_all_mode).
    // * [...] or single string value, e.g. 'add', will filter stream values by
    //   the whitelist (filter_mode).
    // * If the stream value doesn't contain the `type` property, then it won't
    //   do filter.
    function normalizeWhitelist(eventTypes) {
      let whitelist = eventTypes;
      
      // Normalize into an array
      if (typeof whitelist === 'string' || whitelist instanceof String) {
        whitelist = [whitelist];
        
      } else if (!Array.isArray(whitelist)) {
        const err = new Error('The parameter `filter` of `vinylify()` should be an valid array or string.');
        throw(err);
        // Returning an empty array will filter out all event types.
        whitelist = [];
      }
      
      // Replace for keywords
      const validList = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];
      whitelist = whitelist.includes('all') ? validList : intersect(validList, whitelist);
      
      return whitelist;
      
      function union(...arrays) {
        const _union = {};
        arrays.forEach(array => {
          array.forEach(v => {
            var x = _union[v];
            _union[v] = (x) ? (x+1) : 1;
          });
        });
        return Object.keys(_union);
      }
      
      function intersect(...arrays) {
        const _union = {};
        const count = arrays.length;
        arrays.forEach(array => {
          array.forEach(v => {
            var x = _union[v];
            _union[v] = (x) ? (x+1) : 1;
          });
        });
        return Object.keys(_union).filter(v => _union[v] === count);
      }
    };
    
    function filterByWhitelist(source, whitelist) {
      const normalizedWhitelist = normalizeWhitelist(eventFilter);
      // an empty whitelist will filter out all event types.
      // a null whitelist will allow to pass all event types.
      return (normalizedWhitelist) 
        ? source.filter(match => normalizedWhitelist.includes(match.event))
        : source;  // don't filter
    }
    
    // We follow gulp using vinyl-fs to generate a Vinyl file:
    // 
    // * use Vinyl to create a vinyl file
    // * use graceful-fs to update `stat`
    // 
    // @see https://github.com/gulpjs/vinyl-fs/blob/v2.4.3/lib/src/index.js#L15
    function mapToVinyl(source, options) {
      // Don't pass `read` option on to through2
      const read = extract(options, "read");
      const async = extract(options, "async");
      const autoconnectSource$ = source.publish().refCount();
      
      // plain vinyl file without stat for unlink/unlinkDir
      const vinylWithoutStat$ = autoconnectSource$
        .filter(f => (f.event === 'unlink' || f.event === 'unlinkDir'))
        .map(x => new Vinyl(x))
        ;

      // vinyl file with stat for add/change/addDir
      let vinylWithStat$ = autoconnectSource$
        .filter(f => (f.event === 'add' || f.event === 'change' || f.event === 'addDir'));
      
      vinylWithStat$ = (async) 
        ? vinylWithStat$.hook(wrapWithVinylFile(options))
        : vinylWithStat$.map(wrapWithVinylFileSync(options));
      
      if (options.since != null) {
        vinylWithStat$ = (async) 
          ? vinylWithStat$.hook(filterSince(options.since))
          : vinylWithStat$.map(filterSinceSync(options.since));
      }

      if (read) {
        vinylWithStat$ = (async) 
          ? vinylWithStat$.hook(getContents(options))
          : vinylWithStat$.map(getContentsSync(options));
      }
      
      return Rx.Observable.merge(vinylWithStat$, vinylWithoutStat$);
    }
  }
}



module.exports = { use };
