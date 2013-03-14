/**
 * @fileoverview WHERE clause as keyRange object.
 */


goog.provide('ydn.db.Where');
goog.require('ydn.db.KeyRange');
goog.require('goog.string');
goog.require('ydn.db.utils');
goog.require('ydn.debug.error.ArgumentException');


/**
 * For those browser that not implemented IDBKeyRange.
 * @param {string} field index field name to query from.
 * @param {string|KeyRangeJson|ydn.db.KeyRange} op where operator.
 * @param {*=} value rvalue to compare.
 * @param {string=} op2 second operator.
 * @param {*=} value2 second rvalue to compare.
 * @constructor
 */
ydn.db.Where = function (field, op, value, op2, value2) {
  /**
   * @final
   */
  this.key_range_ = op instanceof ydn.db.KeyRange ?
    op : goog.isString(op) ?
      ydn.db.KeyRange.where(op, value, op2, value2) :
      ydn.db.KeyRange.parseKeyRange(op);
  /**
   * @final
   */
  this.field = field;
};


/**
 *
 * @type {string}
 * @private
 */
ydn.db.Where.prototype.field = '';

/**
 *
 * @type {ydn.db.KeyRange}
 * @private
 */
ydn.db.Where.prototype.key_range_;


/**
 *
 * @return {string}
 */
ydn.db.Where.prototype.getField = function() {
  return this.field;
};


/**
 *
 * @return {ydn.db.KeyRange}
 */
ydn.db.Where.prototype.getKeyRange = function() {
  return this.key_range_;
};


/**
 * @param {!Array.<string>|string} key_path field name.
 * @param {!Array.<ydn.db.schema.DataType>|ydn.db.schema.DataType|undefined} type data type.
 * @param {ydn.db.KeyRange|IDBKeyRange} key_range key range.
 * @return {{sql: string, params: !Array.<string>}}
 */
ydn.db.Where.toWhereClause = function (key_path, type, key_range) {

  // NOTE: this.field is different from key_path in general.

  var sql = '';
  var params = [];
  if (key_range) {
    if (ydn.db.Where.resolvedStartsWith(key_range)) {
      if (goog.isString(key_path)) {
        goog.asserts.assert(!goog.string.startsWith(key_path, '"'));
        var column = goog.string.quote(key_path);
        // should be 'TEXT'
        sql = column + ' LIKE ?';
        params.push(ydn.db.schema.Index.js2sql(key_range.lower, type) + '%');
      } else {
        goog.asserts.assertArray(key_path);
        goog.asserts.assertArray(key_range.lower,
          'lower value of key range must be an array, but ' + key_range.lower);

        for (var i = 0; i < key_range.lower.length; i++) {
          if (i > 0) {
            sql += ' AND ';
          }
          var column = goog.string.quote(key_path[i]);
          sql += column + ' = ?';
          params.push(key_range.lower[i]);
        }

        // NOTE: we don't need to care about upper value for LIKE
      }
    } else if (goog.isDefAndNotNull(key_range.lower) &&
        goog.isDefAndNotNull(key_range.upper) &&
        ydn.db.utils.cmp(key_range.lower, key_range.upper) == 0) {
      if (goog.isArray(type)) { // multiEntry = true
        goog.asserts.assertString(key_path);
        var column = goog.string.quote(key_path);
        sql = column + ' LIKE ?';
        params.push('%' + ydn.db.schema.Index.ARRAY_SEP +
          key_range.lower + // this should be string
          ydn.db.schema.Index.ARRAY_SEP + '%');
      } else if (goog.isArrayLike(key_range.lower)) {
        for(var i = 0; i < key_range.lower.length; i++) {
          if (i > 0) {
            sql += ' AND ';
          }
          var column = goog.string.quote(key_path[i]);
          sql += column + ' = ?';
          params.push(ydn.db.schema.Index.js2sql(key_range.lower[i], type[i]));
        }
      } else {
        var column = goog.string.quote(
          goog.isArray(key_path) ? this.field : key_path);
        sql = column + ' = ?';
        params.push(ydn.db.schema.Index.js2sql(key_range.lower, type));
      }
    } else {
      if (goog.isDefAndNotNull(key_range.lower)) {
        if (goog.isArray(key_path)) {
          goog.asserts.assert(goog.isArrayLike(key_range.lower),
              'lower value of keyRange must be array for ' + key_path);
          var op = '=';
          for (var i = 0; i < key_range.lower.length; i++) {
            if (i > 0) {
              sql += ' AND ';
            }
            if (i == key_range.lower.length-1) {
              op = key_range.lowerOpen ? ' > ' : ' >= ';
            }
            var column = goog.string.quote(key_path[i]);
            sql += ' ' + column + op + '?';
            var t = type ? type[i] : undefined;
            params.push(ydn.db.schema.Index.js2sql(key_range.lower[i], t));
          }
        } else {
          goog.asserts.assertString(key_path);
          var op = key_range.lowerOpen ? ' > ' : ' >= ';
          var column = goog.string.quote(key_path);
          sql += ' ' + column + op + '?';
          params.push(ydn.db.schema.Index.js2sql(key_range.lower, type));
        }
      }
      if (goog.isDefAndNotNull(key_range.upper)) {
        sql += sql.length > 0 ? ' AND ' : ' ';
        if (goog.isArray(key_path)) {
          goog.asserts.assert(goog.isArrayLike(key_range.upper),
            'upper value of keyRange must be array for ' + key_path);
          var op = '=';
          for (var i = 0; i < key_path.length; i++) {
            if (i > 0) {
              sql += ' AND ';
            }
            if (i >= key_range.upper.length-1) {
              op = key_range.upperOpen ? ' < ' : ' <= ';
            }
            var column = goog.string.quote(key_path[i]);
            sql += ' ' + column + op + '?';
            var t = type ? type[i] : undefined;
            var v = key_range.upper[i];
            v = goog.isDefAndNotNull(v) ? v : '\uffff';
            params.push(ydn.db.schema.Index.js2sql(v, t));
          }
        } else {
          goog.asserts.assertString(key_path);
          var op = key_range.upperOpen ? ' < ' : ' <= ';
          var column = goog.string.quote(key_path);
          sql += ' ' + column + op + '?';
          params.push(ydn.db.schema.Index.js2sql(key_range.upper, type));
        }
      }
    }
  }

  return {sql: sql, params: params};
};

/**
 * @param {!Array.<ydn.db.schema.DataType>|ydn.db.schema.DataType|undefined} type data type.
 * @return {{sql: string, params: !Array.<string>}}
 */
ydn.db.Where.prototype.toWhereClause = function (type) {
  return ydn.db.Where.toWhereClause(this.field, type, this.key_range_);
};


/**
 * Try to resolve keyRange with starts with keyRange.
 * @param {ydn.db.KeyRange|ydn.db.IDBKeyRange=} keyRange key range to check.
 * @return {boolean} true if given key range can be resolved to starts with
 * keyRange.
 */
ydn.db.Where.resolvedStartsWith = function(keyRange) {
  if (!goog.isDefAndNotNull(keyRange) ||
      !goog.isDefAndNotNull(keyRange.lower) ||
      !goog.isDefAndNotNull(keyRange.upper)) {
    return false;
  }
  if (goog.isArray(keyRange.lower) && goog.isArray(keyRange.upper)) {
    return (keyRange.lower.length == keyRange.upper.length - 1) &&
        keyRange.upper[keyRange.upper.length - 1] == '\uffff' &&
        keyRange.lower.every(function (x, i) {return x == keyRange.upper[i]});
  } else {
    return !keyRange.lowerOpen && !keyRange.upperOpen &&
        keyRange.lower.length == keyRange.upper.length + 1 &&
        keyRange.upper[keyRange.lower.length - 1] == '\uffff';
  }

};


/**
 * Combine another where clause.
 * @param {!ydn.db.Where} that
 * @return {ydn.db.Where} return null if fail.
 */
ydn.db.Where.prototype.and = function(that) {
  if (this.field != that.field) {
    return null;
  }

  var key_range = goog.isDefAndNotNull(this.key_range_) &&
      goog.isDefAndNotNull(that.key_range_) ?
    this.key_range_.and(that.key_range_) : this.key_range_ || that.key_range_;


  return new ydn.db.Where(this.field, key_range);
};



