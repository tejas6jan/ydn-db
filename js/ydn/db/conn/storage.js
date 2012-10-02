/**
 * @license Copyright 2012 YDN Authors. All Rights Reserved.
 */
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


/**
 * @fileoverview Wrappers for the all implemented Storage mechanisms.
 *
 * On application use, this is preferable over concrete storage implementation.
 * This wrapper has two purpose:
 * 1) select suitable supported storage mechanism and 2) deferred execute when
 * the database is not initialized. Database is initialized when dbname, version
 * and schema are set.
 *
 * Often, dbname involve login user identification and it is not available at
 * the time of application start up. Additionally schema may be prepared by
 * multiple module. This top level wrapper provide these use cases.
 *
 * @author kyawtun@yathit.com (Kyaw Tun)
 */

goog.provide('ydn.db.conn.Storage');
goog.require('goog.userAgent.product');
goog.require('ydn.async');
goog.require('ydn.db.conn.LocalStorage');
goog.require('ydn.db.conn.SessionStorage');
goog.require('ydn.db.conn.IndexedDb');
goog.require('ydn.db.conn.SimpleStorage');
goog.require('ydn.db.conn.WebSql');
goog.require('ydn.object');
goog.require('ydn.error.ArgumentException');
goog.require('ydn.db.conn.IStorage');


/**
 * Create a suitable storage mechanism from indexdb, to websql to
 * localStorage.
 *
 * If database name and schema are provided, this will immediately initialize
 * the database and ready to use. However if any of these two are missing,
 * the database is not initialize until they are set by calling
 * {@link #setsetDbName} and {@link #setSchema}.
 * @see goog.db Google Closure Library DB module.
 * @param {string=} opt_dbname database name.
 * @param {!ydn.db.DatabaseSchema=} opt_schema database schema
 * or its configuration in JSON format. If not provided, default empty schema
 * is used.
 * schema used in chronical order.
 * @param {!Object=} opt_options options.
 * @implements {ydn.db.conn.IStorage}
 * @constructor
 */
ydn.db.conn.Storage = function(opt_dbname, opt_schema, opt_options) {


  var options = opt_options || {};
  var schema = goog.isDef(opt_schema) ? opt_schema : new ydn.db.DatabaseSchema();

  this.preference = options['preference'];

  /**
   * @type {ydn.db.conn.IDatabase}
   * @private
   */
  this.db_ = null;
  /**
   * @type {!goog.async.Deferred}
   * @private
   */
  this.deferredDb_ = new goog.async.Deferred();
  // ?: keeping an object in deferred and non-deferred is not a good design

  /**
   * Transaction queue
   * @private
   * @final
   * @type {!Array.<{fnc: Function, scopes: Array.<string>,
   * mode: ydn.db.TransactionMode, oncompleted: Function}>}
   */
  this.txQueue_ = [];

  this.setSchema(schema);

  if (goog.isDef(opt_dbname)) {
    this.setName(opt_dbname);
  }
};


/**
 * If true, a new store schema will be generate on the fly.
 * @type {boolean}
 */
ydn.db.conn.Storage.prototype.auto_schema = false;


/**
 * @protected
 * @type {goog.debug.Logger} logger.
 */
ydn.db.conn.Storage.prototype.logger =
  goog.debug.Logger.getLogger('ydn.db.conn.Storage');



/**
 * Get configuration of this storage. This is useful from getting storage from
 * main thread to worker thread.
 * <pre>
 *   var db = new ydn.db.conn.Storage(...);
 *   ... initialize ...
 *   var config = db.getConfig();
 *
 *   ... in worker thread ...
 *   var worker_db = new ydn.db.conn.Storage(config.db_name, config.schema);
 * </pre>
 * In this way, data can be share between the two threads.
 *
 * @return {{name: string, schema: !Object}?} configuration
 * containing database and list of schema in JSON format.
 * @export
 */
ydn.db.conn.Storage.prototype.getConfig = function() {
  if (!this.schema) {
    return null;
  }

  return {
    'name': this.db_name,
    'schema': /** @type {!Object} */ (this.schema.toJSON())
  };
};


/**
 * Get current schema.
 * @return {!Object}
 */
ydn.db.conn.Storage.prototype.getSchema = function() {
  return /** @type {!Object} */ (this.schema.toJSON());
};


/**
 * Get current schema.
 * @return {Object} null if give store do not exist
 */
ydn.db.conn.Storage.prototype.getStoreSchema = function(store_name) {
  var store = this.schema.getStore(store_name);
  return /** @type {!Object} */ (store.toJSON());
};


/**
 *
 * @param {!Object} store_schema
 */
ydn.db.conn.Storage.prototype.addStoreSchema = function(store_schema) {
  var store_name = store_schema['name'];
  var store = this.schema.getStore(store_name);
  if (store) {
    var new_store = ydn.db.StoreSchema.fromJSON(store_schema);
    if (!store.equals(new_store)) {
      if (!this.auto_schema) {
        throw new ydn.error.ConstrainError('Cannot update store: ' + store_name + '. Schema auto generation is disabled.');
      } //else {
        // do update
      //}
    }
  } else {
    if (!this.auto_schema) {
      throw new ydn.error.ConstrainError('Cannot add ' + store_name + '. Schema auto generation is disabled.');
    }
  }
};


/**
 * Set database. This will initialize the database.
 * @export
 * @throws {Error} if database is already initialized.
 * @param {string} opt_db_name set database name.
 */
ydn.db.conn.Storage.prototype.setName = function(opt_db_name) {
  if (this.db_) {
    throw Error('DB already initialized');
  }
  /**
   * @final
   * @type {string}
   */
  this.db_name = opt_db_name;
  this.initDatabase();
};


/**
 *
 * @return {string}
 */
ydn.db.conn.Storage.prototype.getName = function() {
  return this.db_name;
};


/**
 * Set the latest version of database schema. This will start initialization if
 * database name have been set. The the database is already initialized,
 * this will issue version change event and migrate to the schema.
 * @export
 * @param {!ydn.db.DatabaseSchema} schema set the schema
 * @protected
 * configuration in JSON format.
 */
ydn.db.conn.Storage.prototype.setSchema = function(schema) {

  /**
   * @final
   * @protected
   * @type {!ydn.db.DatabaseSchema}
   */
  this.schema = schema;

  if (!this.db_) {
    this.initDatabase();
  } else {
    this.db_.close();
    this.db_ = null;
    this.deferredDb_ = new goog.async.Deferred();
    this.initDatabase();
  }
};


/**
 * Specified storage mechanism ordering.
 * The default represent
 * IndexedDB, WebSql, localStorage and in-memory store.
 * @const
 * @type {!Array.<string>}
 */
ydn.db.conn.Storage.PREFERENCE = [
  ydn.db.conn.IndexedDb.TYPE,
  ydn.db.conn.WebSql.TYPE,
  ydn.db.conn.LocalStorage.TYPE,
  ydn.db.conn.SessionStorage.TYPE,
  ydn.db.conn.SimpleStorage.TYPE];


/**
 * Create database instance.
 * @protected
 * @param {string} db_type
 * @return {ydn.db.conn.IDatabase}
 */
ydn.db.conn.Storage.prototype.createDbInstance = function(db_type) {

  if (db_type == ydn.db.conn.IndexedDb.TYPE) {
    return new ydn.db.conn.IndexedDb(this.db_name, this.schema);
  } else if (db_type == ydn.db.conn.WebSql.TYPE) {
    var size = this.preference ? this.preference['size'] : undefined;
    return new ydn.db.conn.WebSql(this.db_name, this.schema, size);
  } else if (db_type == ydn.db.conn.LocalStorage.TYPE) {
    return new ydn.db.conn.LocalStorage(this.db_name, this.schema);
  } else if (db_type == ydn.db.conn.SessionStorage.TYPE) {
    return new ydn.db.conn.SessionStorage(this.db_name, this.schema);
  } else if (db_type == ydn.db.conn.SimpleStorage.TYPE)  {
    return new ydn.db.conn.SimpleStorage(this.db_name, this.schema);
  }
  return null;
};


/**
 * Initialize suitable database if {@code dbname} and {@code schema} are set,
 * starting in the following order of preference.
 * @protected
 */
ydn.db.conn.Storage.prototype.initDatabase = function() {
  // handle version change
  if (goog.isDef(this.db_name) && goog.isDef(this.schema)) {
    var db = null;
    if (goog.userAgent.product.ASSUME_CHROME ||
      goog.userAgent.product.ASSUME_FIREFOX) {
      // for dead-code elimination
      db = this.createDbInstance(ydn.db.conn.IndexedDb.TYPE);
    } else if (goog.userAgent.product.ASSUME_SAFARI) {
      // for dead-code elimination
      db = this.createDbInstance(ydn.db.conn.WebSql.TYPE);
    } else {
      // go according to ordering
      var preference = this.preference || ydn.db.conn.Storage.PREFERENCE;
      for (var i = 0; i < preference.length; i++) {
        var db_type = preference[i].toLowerCase();
        if (db_type == ydn.db.conn.IndexedDb.TYPE && ydn.db.conn.IndexedDb.isSupported()) { // run-time detection
          db = this.createDbInstance(db_type);
          break;
        } else if (db_type == ydn.db.conn.WebSql.TYPE && ydn.db.conn.WebSql.isSupported()) {
          db = this.createDbInstance(db_type);
          break;
        } else if (db_type == ydn.db.conn.LocalStorage.TYPE && ydn.db.conn.LocalStorage.isSupported()) {
          db = this.createDbInstance(db_type);
          break;
        } else if (db_type == ydn.db.conn.SessionStorage.TYPE && ydn.db.conn.SessionStorage.isSupported()) {
          db = this.createDbInstance(db_type);
          break;
        } else if (db_type == ydn.db.conn.SimpleStorage.TYPE)  {
          db = this.createDbInstance(db_type);
          break;
        }
      }
    }
    if (goog.isNull(db)) {
      throw new ydn.error.ConstrainError('No storage mechanism found.');
    } else {
      this.setDb_(db);
    }
  }
};


/**
 *
 * @return {string}
 * @export
 */
ydn.db.conn.Storage.prototype.type = function() {
  if (this.db_) {
    return this.db_.type();
  } else {
    return '';
  }
};


/**
 * Setting db .
 * @param {!ydn.db.conn.IDatabase} db
 * @private
 */
ydn.db.conn.Storage.prototype.setDb_ = function(db) {
  this.db_ = db;
  this.init(); // let super class to initialize.
  if (this.deferredDb_.hasFired()) {
    this.deferredDb_ = new goog.async.Deferred();
  }
  var me = this;

  var success = function(db) {
    me.deferredDb_.callback(me.db_);
    me.last_queue_checkin_ = NaN;
    me.popTxQueue_();
  };

  var error = function(e) {
    // this could happen if user do not allow to use the storage
    me.deferredDb_.callback(null);
    me.purgeTxQueue_(db);
  };

  this.db_.onReady(success, error);
};


/**
 * Database database is instantiated, but may not ready.
 * Subclass may perform initialization.
 * When ready, deferred call are invoked and transaction queue
 * will run.
 * @protected
 */
ydn.db.conn.Storage.prototype.init = function() {
};


/**
 * Close the database.
 * @export
 */
ydn.db.conn.Storage.prototype.close = function() {
  if (this.db_) {
    this.db_.close();
    this.db_ = null;
  }
};

//
//
///**
// * Access readied database instance asynchronously.
// * @param {function(!ydn.db.conn.IDatabase)} callback
// * @export
// */
//ydn.db.conn.Storage.prototype.onReady = function(callback) {
//  if (this.db_ && !this.db_.getDbInstance()) {
//    // we can skip this check, but it saves one function wrap.
//    callback(this.db_);
//  } else {
//    this.deferredDb_.addCallback(callback);
//  }
//};


/**
 * Get database instance.
 * @protected
 * @return {ydn.db.conn.IDatabase}
 */
ydn.db.conn.Storage.prototype.getDb = function() {
  return this.db_;
};



/**
 * Get database instance.
 * @see {@link #getDb}
 * @return {*}
 */
ydn.db.conn.Storage.prototype.getDbInstance = function() {
  return this.db_ ? this.db_.getDbInstance() : null;
};


/**
 *
 * @type {number}
 * @private
 */
ydn.db.conn.Storage.prototype.last_queue_checkin_ = NaN;


/**
 * @const
 * @type {number}
 */
ydn.db.conn.Storage.timeOut = goog.DEBUG || ydn.db.conn.IndexedDb.DEBUG ?
  500 : 3000;


/**
 * @const
 * @type {number}
 */
ydn.db.conn.Storage.MAX_QUEUE = 1000;


/**
 * Run the first transaction task in the queue. DB must be ready to do the
 * transaction.
 * @private
 */
ydn.db.conn.Storage.prototype.popTxQueue_ = function() {

  var task = this.txQueue_.shift();
  if (task) {
    ydn.db.conn.Storage.prototype.transaction.call(this,
      task.fnc, task.scopes, task.mode, task.oncompleted);
  }
  this.last_queue_checkin_ = goog.now();
};


/**
 * Push a transaction job to the queue.
 * @param {Function} trFn function that invoke in the transaction.
 * @param {!Array.<string>} store_names list of keys or
 * store name involved in the transaction.
 * @param {ydn.db.TransactionMode=} opt_mode mode, default to 'readonly'.
 * @param {function(ydn.db.TransactionEventTypes, *)=} completed_event_handler
 * @private
 */
ydn.db.conn.Storage.prototype.pushTxQueue_ = function (trFn, store_names,
    opt_mode, completed_event_handler) {
  this.txQueue_.push({
    fnc:trFn,
    scopes:store_names,
    mode:opt_mode,
    oncompleted:completed_event_handler
  });
  var now = goog.now();
  //if (!isNaN(this.last_queue_checkin_)) {
    //if ((now - this.last_queue_checkin_) > ydn.db.conn.Storage.timeOut) {
    //  this.logger.warning('queue is not moving.');
      // todo: actively push the queue if transaction object is available
      // this will make robustness to the app.
      // in normal situation, queue will automatically empty since
      // pop queue will call whenever transaction is finished.
    //}
  //}
  if (this.txQueue_.length > ydn.db.conn.Storage.MAX_QUEUE) {
    this.logger.warning('Maximum queue size exceed, dropping the first job.');
    this.txQueue_.shift();
  }

};


/**
 * Abort the queuing tasks.
 * @protected
 * @param e
 */
ydn.db.conn.Storage.prototype.purgeTxQueue_ = function(e) {
  if (this.txQueue_) {
    var task = this.txQueue_.shift();
    while (task) {
      task = this.txQueue_.shift();
      task.oncompleted(ydn.db.TransactionEventTypes.ERROR, e);
    }
  }
};



/**
 * Run a transaction.
 *
 * @param {Function} trFn function that invoke in the transaction.
 * @param {!Array.<string>} store_names list of keys or
 * store name involved in the transaction.
 * @param {ydn.db.TransactionMode=} opt_mode mode, default to 'readonly'.
 * @param {function(ydn.db.TransactionEventTypes, *)=} completed_event_handler
 * @export
 * @final
 */
ydn.db.conn.Storage.prototype.transaction = function (trFn, store_names,
     opt_mode, completed_event_handler) {

  var is_ready = !!this.db_ && this.db_.isReady();
  if (is_ready) {
    var me = this;
    var names = store_names;
    if (goog.isString(store_names)) {
      names = [store_names];
    } else if (!goog.isArray(store_names) ||
      (store_names.length > 0 && !goog.isString(store_names[0]))) {
      throw new ydn.error.ArgumentException("storeNames");
    }
    var mode = goog.isDef(opt_mode) ? opt_mode : ydn.db.TransactionMode.READ_ONLY;

    var on_complete = function (type, ev) {
      if (goog.isFunction(completed_event_handler)) {
        completed_event_handler(type, ev);
      }
      me.popTxQueue_();
    };

    //console.log('core running ' + trFn.name);
    this.db_.doTransaction(function (tx) {
      trFn(tx);
    }, names, mode, on_complete);
  } else {
    //console.log('core queuing ' + trFn.name);
    this.pushTxQueue_(trFn, store_names, opt_mode, completed_event_handler);
  }
};

