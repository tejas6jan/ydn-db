var options = {}; // options = {mechanisms: ['websql']};
if (/log/.test(location.hash)) {
  if (/ui/.test(location.hash)) {
    if (ydn.debug && ydn.debug.log) {
      var div = document.createElement('div');
      document.body.appendChild(div);
      ydn.debug.log('ydn.db', 'finest', div);
    } else {
      console.log('no logging facility');
    }
  } else {
    if (ydn.debug && ydn.debug.log) {
      ydn.debug.log('ydn.db', 'finest');
    } else {
      console.log('no logging facility');
    }
  }
}
if (/websql/.test(location.hash)) {
  options['mechanisms'] = ['websql'];
}

QUnit.config.testTimeout = 2000;
var reporter = new ydn.testing.Reporter('ydn-db');

var db_name = 'test_query_1';
var db_name_put = 'qunit_test_8_rw';
var store_inline = 'ts';    // in-line key store
var store_outline = 'ts2'; // out-of-line key store
var store_inline_auto = 'ts3'; // in-line key + auto
var store_outline_auto = 'ts4'; // out-of-line key + auto


var schema_1 = {
  stores: [
    {
      name: store_inline,
      keyPath: 'id'},
    {
      name: store_outline},
    {
      name: store_inline_auto,
      keyPath: 'id',
      autoIncrement: true},
    {
      name: store_outline_auto,
      autoIncrement: true
    }
  ]
};


(function() {

  var db_name = 'test_query_count';
  var db_r;

  var df = $.Deferred();

  // persist store data.
  (function() {
    var _db = new ydn.db.Storage(db_name, schema_1, options);
    _db.clear(store_inline_index);
    _db.put(store_inline_index, [
      {id: 1, value: 2, name: 'a' + Math.random()},
      {id: 2, value: 4, name: 'b' + Math.random()},
      {id: 3, value: 6, name: 'b' + Math.random()},
      {id: 4, value: 8, name: 'c' + Math.random()}
    ]);
    _db.clear(store_inline);
    _db.put(store_inline, [
      {id: 1, value: 'v' + Math.random()},
      {id: 2, value: 'v' + Math.random()},
      {id: 3, value: 'v' + Math.random()},
      {id: 4, value: 'v' + Math.random()}
    ]);
    _db.count(store_inline).always(function() {
      df.resolve();  // this ensure all transaction are completed
    });
    _db.close();
  })();

  var test_count = 0;

  var test_env = {
    setup: function() {
      db_r = new ydn.db.Storage(db_name, schema_1, options);

    },
    teardown: function() {
      db_r.close();
      test_count++;
      if (test_count >= 2) {
        //console.log(db_r.getName() + ' deleted.')
        var type = db_r.getType();
        db_r.close();
        ydn.db.deleteDatabase(db_r.getName(), type);
      }
    }
  };

  module('Count', test_env);
  reporter.createTestSuite('query', 'Count', ydn.db.version);

  asyncTest('1. primary key', 5, function() {

    df.always(function() {
      var q = db_r.from(store_inline, '>', 1, '<=', 3);
      q.count(function(x) {
        equal(x, 2, 'number of records in a bounded range');
        start();
      });
    });

  });

  asyncTest('2. by index iterator', 2, function() {
    df.always(function() {

      var q = db_r.from(store_inline_index);
      var value_iter = q.where('value', '>', 1, '<=', 3);
      var name_iter = q.where('name', '^', 'b');

      value_iter.count(function(x) {
        //console.log('count value')
        equal(x, 1, 'number of values in the range');
      });
      name_iter.count(function(x) {
        equal(x, 2, 'number of name in the range');
        start();
      });
    });

  });

})();


(function() {

  var db_name = 'test_query_get_1';
  var schema_1 = {
    stores: [
      {
        name: store_inline_index,
        keyPath: 'id',
        type: 'NUMERIC',
        indexes: [
          {name: 'name', type: 'TEXT'},
          {name: 'value', type: 'NUMERIC'},
          {name: 'tags', type: 'TEXT', multiEntry: true}
        ]
      }

    ]
  };
  var test_count = 0;
  var db_r = new ydn.db.Storage(db_name, schema_1, options);

  var objs = [
    {id: 1, value: 2, name: 'a' + Math.random()},
    {id: 2, value: 4, name: 'b' + Math.random()},
    {id: 3, value: 6, name: 'b' + Math.random()},
    {id: 4, value: 8, name: 'c' + Math.random()}
  ];


  module('Get', {
    setup: function() {
      db_r.clear(store_inline_index);
      db_r.put(store_inline_index, objs);
    },
    teardown: function() {
      test_count++;
      if (test_count >= 4) {
        var type = db_r.getType();
        db_r.close();
        ydn.db.deleteDatabase(db_r.getName(), type);
      }
    }
  });
  reporter.createTestSuite('iterator', 'Get', ydn.db.version);

  asyncTest('ref value by an iterator', 1, function() {
    expect(1);
    var iter = db_r.from(store_inline_index, '>', 1, '<=', 3);
    iter.get(function(x) {
      deepEqual(x, objs[1], 'get item 2 value');
      start();
    });
  });

  asyncTest('ref value by an iterator', 1, function() {

    var q = db_r.from(store_inline_index);
    var iter = q.where('name', '^', 'c');
    iter.get(function(x) {
      deepEqual(x, objs[3], 'get item 3 value');
      start();
    });
  });

})();


(function() {

  var db_name = 'test_query_to_array';
  var test_count = 0;
  var df = $.Deferred();

  var objs = [
    {test: 't' + Math.random(), value: 0, id: 0, name: 'a', tags: ['a', 'b']},
    {test: 't' + Math.random(), value: 2, id: 1, name: 'b', tags: ['x']},
    {test: 't' + Math.random(), value: 4, id: 2, name: 'ba', tags: ['z']},
    {test: 't' + Math.random(), value: 6, id: 3, name: 'bc', tags: ['a', 'd', 'c']},
    {test: 't' + Math.random(), value: 8, id: 4, name: 'bd', tags: ['e', 'c']},
    {test: 't' + Math.random(), value: 10, id: 5, name: 'c', tags: ['b']},
    {test: 't' + Math.random(), value: 12, id: 6, name: 'c', tags: ['a']}
  ];

  // persist store data.
  (function() {
    var _db = new ydn.db.Storage(db_name, schema_1, options);
    _db.clear(store_inline_index);
    _db.put(store_inline_index, objs);

    _db.count(store_inline_index).always(function() {
      df.resolve();  // this ensure all transactions are completed
    });
    _db.close();
  })();

  var db;
  var test_env = {
    setup: function() {
      db = new ydn.db.Storage(db_name, schema_1, options);

    },
    teardown: function() {
      var type = db.getType();
      db.close();
      test_count++;
      if (test_count >= 5) {
        ydn.db.deleteDatabase(db_name, type);
      }
    }
  };

  module('values', test_env);
  reporter.createTestSuite('iterator', 'values', ydn.db.version);

  asyncTest('1. Ref value by primary key range', 3, function() {
    df.always(function() {

      var q = db.from(store_inline_index, '>=', 1, '<=', 3);
      q.values(function(x) {
        //console.log(q)
        deepEqual(x, objs.slice(1, 4), 'closed bound');
      });

      q.reverse().values(function(x) {
        var exp = objs.slice(1, 4).reverse();
        deepEqual(x, exp, 'closed bound reverse');
      });

      q.values(q, 1).always(function(x) {
        deepEqual(x, objs.slice(1, 2), 'closed bound limit');
        start();
      });

    });
  });

  asyncTest('2. Ref value by index key range', 5, function() {

    var q = db.from(store_inline_index).where('value', '>=', 2, '<=', 4);
    q.values(function(x) {
      //console.log(q)
      deepEqual(x, objs.slice(1, 3), 'closed bound');
    });

    q = db.from(store_inline_index).where('value', '>=', 4);
    q.values(function(x) {
      //console.log(q)
      deepEqual(x, objs.slice(2), 'lowerBound');
    });

    q = db.from(store_inline_index).where('value', '>', 4);
    q.values(function(x) {
      //console.log(q)
      deepEqual(x, objs.slice(3), 'open lowerBound');
    });

    q = db.from(store_inline_index).where('value', '<=', 4);
    q.values(function(x) {
      //console.log(q)
      deepEqual(x, objs.slice(0, 3), 'upperBound');
    });

    q = db.from(store_inline_index).where('value', '<', 4);
    q.values(function(x) {
      //console.log(q)
      deepEqual(x, objs.slice(0, 2), 'open upperBound');
      start();
    });
  });

  asyncTest('3. Ref value by index key range', 6, function() {
    var keys = objs.map(function(x) {
      return x.id;
    });

    var q = ydn.db.Cursors.where(store_inline_index, 'value', '>=', 2, '<=', 4);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(1, 3), 'closed bound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '>=', 4);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(2), 'lowerBound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '>', 4);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(3), 'open lowerBound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '<=', 4);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(0, 3), 'upperBound');
    });


    q = new ydn.db.Cursors(store_inline_index, 'value', null, true);
    db.values(q, 3).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice().reverse().slice(0, 3), 'reverse key range');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '<', 4);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(0, 2), 'open upperBound');
      start();
    });
  });


  asyncTest('4. Ref value by string index key range', 4, function() {

    var q = ydn.db.IndexValueCursors.where(store_inline_index, 'name', '^', 'b');
    db.values(q).always(function(x) {
      //console.log(q)
      equal(x.length, 4, 'LIKE%');
    });

    q = ydn.db.IndexValueCursors.where(store_inline_index, 'name', '=', 'b');
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x.length, 1, 'equal');
    });

    q = ydn.db.IndexValueCursors.where(store_inline_index, 'name', '<', 'b');
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x.length, 1, '<');
    });

    q = ydn.db.IndexValueCursors.where(store_inline_index, 'name', '^', 'd');
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x.length, 0, 'LIKE% no result');
      start();
    });

  });

  asyncTest('5. multiEntry IndexIterator', 4, function() {

    var range = ydn.db.KeyRange.only('a');
    var q = new ydn.db.Cursors(store_inline_index, 'tags', range);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, [objs[0].id, objs[3].id, objs[6].id], 'ref value only a');

    });

    range = ydn.db.KeyRange.only('a');
    q = new ydn.db.IndexValueCursors(store_inline_index, 'tags', range);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, [objs[0], objs[3], objs[6]], 'only a');

    });

    q = new ydn.db.Cursors(store_inline_index, 'tags', range, false, true);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, [objs[0].id], 'only a unique');

    });

    q = new ydn.db.IndexValueCursors(store_inline_index, 'tags', range, false, true);
    db.values(q).always(function(x) {
      //console.log(q)
      deepEqual(x, [objs[0]], 'only a unique');
      start();
    });

  });


})();


(function() {

  var test_count = 0;
  var db_name = 'test_tck2_key';
  var df = $.Deferred();

  var objs = [
    {test: 't' + Math.random(), value: 0, id: 0, name: 'a', tags: ['a', 'b']},
    {test: 't' + Math.random(), value: 2, id: 1, name: 'b', tags: []},
    {test: 't' + Math.random(), value: 4, id: 2, name: 'ba', tags: ['z']},
    {test: 't' + Math.random(), value: 6, id: 3, name: 'bc', tags: ['a', 'd', 'c']},
    {test: 't' + Math.random(), value: 8, id: 4, name: 'bd', tags: ['e', 'c']},
    {test: 't' + Math.random(), value: 10, id: 5, name: 'c', tags: []},
    {test: 't' + Math.random(), value: 12, id: 6, name: 'c', tags: ['a']}
  ];

  // persist store data.
  // we don't want to share this database connection and test database connection.
  (function() {
    var _db = new ydn.db.Storage(db_name, schema_1, options);
    _db.clear(store_inline_index);
    _db.put(store_inline_index, objs);

    _db.count(store_inline_index).always(function() {
      df.resolve();  // this ensure all transactions are completed
    });
    _db.close();
  })();

  var db;
  var test_env = {
    setup: function() {
      db = new ydn.db.Storage(db_name, schema_1, options);

    },
    teardown: function() {
      db.close();
      test_count++;
      if (test_count >= 3) {
        var type = db.getType();
        ydn.db.deleteDatabase(db_name, type);
      }
    }
  };

  module('keys', test_env);
  reporter.createTestSuite('iterator', 'keys', ydn.db.version);


  asyncTest('1. Effective key by by primary key range', 8, function() {
    df.always(function() {

      var keys = objs.map(function(x) {
        return x.id;
      });


      var key_range = ydn.db.KeyRange.bound(1, 3);
      var q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q).always(function(x) {
        //console.log(q)
        deepEqual(x, keys.slice(1, 4), 'closed bound');
      });

      key_range = ydn.db.KeyRange.bound(1, 3);
      q = new ydn.db.ValueCursors(store_inline_index, key_range, true);
      db.keys(q).always(function(x) {
        var exp = keys.slice(1, 4).reverse();
        deepEqual(x, exp, 'closed bound reverse');
      });

      key_range = ydn.db.KeyRange.bound(1, 3);
      q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q, 1).always(function(x) {
        deepEqual(x, keys.slice(1, 2), 'closed bound limit');
      });

      key_range = ydn.db.KeyRange.bound(1, 3);
      q = new ydn.db.ValueCursors(store_inline_index, key_range, true);
      db.keys(q, 1).always(function(x) {
        deepEqual(x, keys.slice(3, 4), 'closed bound reverse limit');
      });

      key_range = ydn.db.KeyRange.lowerBound(2);
      q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q).always(function(x) {
        //console.log(q)
        deepEqual(x, keys.slice(2), 'lowerBound');
      });

      key_range = ydn.db.KeyRange.lowerBound(2, true);
      q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q).always(function(x) {
        //console.log(q)
        deepEqual(x, keys.slice(3), 'open lowerBound');
      });

      key_range = ydn.db.KeyRange.upperBound(2);
      q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q).always(function(x) {
        //console.log(q)
        deepEqual(x, keys.slice(0, 3), 'upperBound');
      });

      key_range = ydn.db.KeyRange.upperBound(2, true);
      q = new ydn.db.ValueCursors(store_inline_index, key_range);
      db.keys(q).always(function(x) {
        //console.log(q)
        deepEqual(x, keys.slice(0, 2), 'open upperBound');
        start();
      });
    });
  });

  asyncTest('2. Effective key by index key range', function() {

    var keys = objs.map(function(x) {
      return x.value;
    });
    expect(5);
    var q = ydn.db.Cursors.where(store_inline_index, 'value', '>=', 2, '<=', 4);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(1, 3), 'closed bound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '>=', 4);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(2), 'lowerBound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '>', 4);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(3), 'open lowerBound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '<=', 4);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(0, 3), 'upperBound');
    });

    q = ydn.db.Cursors.where(store_inline_index, 'value', '<', 4);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, keys.slice(0, 2), 'open upperBound');
      start();
    });

  });


  asyncTest('3. Effective key by multiEntry index key range', 6, function() {

    var range = ydn.db.KeyRange.only('a');
    var q = new ydn.db.Cursors(store_inline_index, 'tags', range);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, ['a', 'a', 'a'], 'only a');
    });

    range = ydn.db.KeyRange.only('a');
    q = new ydn.db.IndexValueCursors(store_inline_index, 'tags', range);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, ['a', 'a', 'a'], 'only a');
    });

    q = new ydn.db.Cursors(store_inline_index, 'tags', range, false, true);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, ['a'], 'only a unique');
    });

    q = new ydn.db.IndexValueCursors(store_inline_index, 'tags', range, false, true);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, ['a'], 'only a unique');
    });

    var result = [];
    for (var i = 0; i < objs.length; i++) {
      result = result.concat(objs[i].tags);
    }
    result.sort();

    var q = new ydn.db.Cursors(store_inline_index, 'tags');
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, result, 'all');
    });

    var q = new ydn.db.Cursors(store_inline_index, 'tags', null, false, true);
    db.keys(q).always(function(x) {
      //console.log(q)
      deepEqual(x, ['a', 'b', 'c', 'd', 'e', 'z'], 'all unique');
      start();
    });

  });

})();


/*
 QUnit.testDone(function(result) {
 reporter.addResult('iterator', result.module,
 result.name, result.failed, result.passed, result.duration);
 });

 QUnit.moduleDone(function(result) {
 reporter.endTestSuite('iterator', result.name,
 {passed: result.passed, failed: result.failed});
 });

 QUnit.done(function(results) {
 reporter.report();
 });
 */