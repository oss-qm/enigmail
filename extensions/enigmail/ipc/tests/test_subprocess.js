/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "MPL"); you may not use this file
 * except in compliance with the MPL. You may obtain a copy of
 * the MPL at http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the MPL for the specific language governing
 * rights and limitations under the MPL.
 *
 * The Original Code is ipc-pipe.
 *
 * The Initial Developer of the Original Code is Patrick Brunschwig.
 * Portions created by Patrick Brunschwig <patrick@mozilla-enigmail.org> are
 * Copyright (C) 2010 Patrick Brunschwig. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * ***** END LICENSE BLOCK ***** */

/**
 * This file tests the implementation of subprocess.jsm
 */

Components.utils.import("resource://gre/modules/subprocess.jsm");

//const Cc = Components.classes;
//const Ci = Components.interfaces;

var gTestLines;
var gResultData;
var gErrorData;

function run_test()
{
  var isWindows = ("@mozilla.org/windows-registry-key;1" in Components.classes);
  var dataFile = do_get_file("ipc-data.txt" , true);

  var processDir = do_get_workdir();
  var cmd = processDir.clone();
  cmd.append("IpcCat" + (isWindows ? ".exe" : ""));

  if (!cmd.exists())
    do_throw("Could not locate the IpcCat helper executable\n");

  var dirSvc = Cc["@mozilla.org/file/directory_service;1"].
                      getService(Ci.nsIProperties).
                      QueryInterface(Ci.nsIDirectoryService);
  var greDir = dirSvc.get("GreD", Ci.nsIFile);


  var envList = [
    "DYLD_LIBRARY_PATH="+greDir.path, // for Mac
    "LD_LIBRARY_PATH="+greDir.path    // for Linux
  ];

  var eol = isWindows ? "\r\n" : "\n";
  gTestLines = [ "Writing example data"+eol,
                  "Writing something more"+eol,
                  "And yet some more text"+eol ];

  /////////////////////////////////////////////////////////////////
  // Test standard scenario
  /////////////////////////////////////////////////////////////////

  do_print("Test 1 - standard scenario\n");

  gResultData = "";
  gErrorData = "";
  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'dump' ],
    environment: envList,
    stdin: function(pipe) {
        for (var i=0; i < gTestLines.length; i++) {
          pipe.write(gTestLines[i]);
        }
        pipe.close();
    },
    stdout: function (data) {
      gResultData += data;
    },
    stderr: function(data) {
      gErrorData += data;
    },
    done: function(result) {
      do_check_eq(0, result.exitCode);
    },
    mergeStderr: false
  });

  p.wait();

  let len = gTestLines.join("").length;
  if (isWindows) len -= gTestLines.length;
    do_check_eq("Starting dump\nDumped "+len+" bytes\n",
  gErrorData.replace(/\r\n/g, "\n"));
  do_check_eq(gTestLines.join(""), gResultData);


  /////////////////////////////////////////////////////////////////
  // Test mergeStderr=true & stdin as string
  /////////////////////////////////////////////////////////////////

  do_print("Test 2 - mergeStderr = true\n");

  gResultData = "";
  p = subprocess.call({
    command:     cmd,
    arguments:   [ 'dump' ],
    environment: envList,
    stdin: gTestLines.join(""),
    stdout: function (data) {
      gResultData += data;
    },
    stderr: function(data) {
      do_throw("Got unexpected data '"+data+"' on stderr\n");
    },
    done: function(result) {
      do_check_eq(0, result.exitCode);
    },
    mergeStderr: true
  });

  p.wait();
  do_check_eq(gTestLines.join("").length + (isWindows ? 32 : 30), gResultData.length);


  /////////////////////////////////////////////////////////////////
  // Test with workdir & no stderr
  /////////////////////////////////////////////////////////////////

  do_print("Test 3 - workdir; no stderr\n");

  gResultData = "";
  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'dump' ],
    environment: envList,
    workdir: do_get_file(".", true),
    stdin: function(pipe) {
        for (var i=0; i < gTestLines.length; i++) {
          pipe.write(gTestLines[i]);
        }
        pipe.close();
    },
    done: function(result) {
      gResultData = result.stdout;
      do_check_eq(0, result.exitCode);
    },
    mergeStderr: false
  });

  p.wait();
  do_check_eq(gTestLines.join(""), gResultData);

  /////////////////////////////////////////////////////////////////
  // Test exit code != 0
  /////////////////////////////////////////////////////////////////

  do_print("Test 4 - exit code != 0\n");

  gResultData = "";

  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'wrong', 'arguments' ],
    environment: envList,
    stdin: "Dummy text",
    stdout: function (data) {
      gResultData += data;
    },
    stderr: function(data) {
      do_check_eq(0, data.length);
    },
    done: function(result) {
      do_check_neq(0, result.exitCode);
    },
    mergeStderr: false
  });

  p.wait();
  do_check_eq("", gResultData);

  /////////////////////////////////////////////////////////////////
  // Test minimal scenario with stdout only
  /////////////////////////////////////////////////////////////////

  do_print("Test 5 - minimal scenario with stdout\n");

  gResultData = "";
  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'write', dataFile.path ],
    stdin: gTestLines.join(""),
  });

  var exitCode = p.wait();
  do_check_eq(0, exitCode);

  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'read', dataFile.path ],
    environment: envList,
    stdout: function (data) {
      gResultData += data;
    }
  });

  p.wait();
  do_check_eq(gTestLines.join(""), gResultData);

  /////////////////////////////////////////////////////////////////
  // Test minimal scenario with done only
  /////////////////////////////////////////////////////////////////

  do_print("Test 6 - minimal scenario with done\n");

  var p = subprocess.call({
    command:     cmd,
    arguments:   [ 'read', dataFile.path ],
    environment: envList,
    done: function(result) {
      gResultData = result.stdout;
      do_check_eq(0, result.exitCode);
    }
  });

  p.wait();
  do_check_eq(gTestLines.join(""), gResultData);


  /////////////////////////////////////////////////////////////////
  // Test environment variables
  /////////////////////////////////////////////////////////////////

  do_print("Test 7 - environment variables\n");

  gTestLines= [ "This is a test variable" ];
  envList.push("TESTVAR="+gTestLines[0]);

  gResultData = "";
  var p = subprocess.call({
    command:     cmd.path,
    arguments:   [ 'getenv', 'TESTVAR' ],
    workdir: do_get_file(".", true),
    environment: envList,
    done: function(result) {
      gResultData = result.stdout;
      do_check_eq(0, result.exitCode);
    },
    mergeStderr: false
  });

  p.wait();
  do_check_eq(gTestLines.join(""), gResultData);
}
