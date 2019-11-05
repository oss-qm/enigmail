/* global ChromeUtils: false; Assert: false; dump: false; */

"use strict";

const Sqlite = ChromeUtils.import("resource://gre/modules/Sqlite.jsm").Sqlite;
const PromiseUtils = ChromeUtils.import("resource://gre/modules/PromiseUtils.jsm").PromiseUtils;
const JSUnit = ChromeUtils.import("resource://jsunit/jsunit-main.jsm").JSUnit;

function log(str) {
  /* how to log to stdout/stderr? */
  dump(str, str.length);
}

/**
 * Create the "simple" table and the corresponding index
 *
 * @param connection: Object - SQLite connection
 * @param deferred:   Promise
 */
function createTable(connection, deferred) {
  log("createTable()\n");
    
  connection.execute("create table simple (" +
                     "foo text not null, " + // string
                     "int text not null); "). // number
    then( function _ok() {
      log("createTable - index\n");
      connection.execute("create unique index xx on simple(foo)").
        then(function _f() {
          deferred.resolve();
        });
    });
}

function checkDatabaseStructure(connection) {
  log("checkDatabaseStructure\n");

  let deferred = PromiseUtils.defer();

  connection.tableExists("simple").then(
    function onSuccess(exists) {
      log("checkDatabaseStructure - success\n");
      if (!exists) {
        createTable(connection, deferred);
      }
      else {
        deferred.resolve();
      }
    },
    function onError(error) {
      log("checkDatabaseStructure - error\n");
      deferred.reject(error);
    }
  );
    
  return deferred.promise;
}


log("started sqlite test!!!\n");
JSUnit.testPending();
Sqlite.openConnection({
  path: "testing.sqlite",
  sharedMemoryCache: false
}).then(
  function onConnection(connection) {
    log("success!!!\n");
    var conn = connection;
    checkDatabaseStructure(conn).
      then(function _x() {
        conn.close();
        JSUnit.testSucceeded();
        JSUnit.testFinished();
      });
  },
  function onError(error) {
    JSUnit.testFailed();
    JSUnit.testFinished();
    log("failure!!!\n");
  }
);
