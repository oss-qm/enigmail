/*global do_load_module: false, do_get_file: false, do_get_cwd: false, testing: false, test: false, Assert: false, resetting: false, JSUnit: false, do_test_pending: false, do_test_finished: false, withTestGpgHome:false */
/*global withEnigmail: false, EnigmailCore: false, Enigmail: false, component: false, withEnvironment: false, nsIEnvironment: false, Ec: false, getEnigmailPrefs: false, EnigmailOS: false, EnigmailArmor: false, withLogFiles: false, assertLogContains: false, assertLogDoesNotContain: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js");

testing("core.jsm");
const EnigmailLog = component("enigmail/log.jsm").EnigmailLog;
const EnigmailFiles = component("enigmail/files.jsm").EnigmailFiles;

function newEnigmail(f) {
  var oldEnigmail = EnigmailCore.getEnigmailService();
  try {
    var enigmail = new Enigmail();
    EnigmailCore.setEnigmailService(enigmail);
    f(enigmail);
  } finally {
    EnigmailCore.setEnigmailService(oldEnigmail);
  }
}

// testing: initialize
test(function initializeWillPassEnvironmentIfAskedTo() {
  getEnigmailPrefs().setPref('keyRefreshOn', true);
  var window = JSUnit.createStubWindow();
  withEnvironment({
    "ENIGMAIL_PASS_ENV": "STUFF:BLARG",
    "STUFF": "testing"
  }, function() {
    newEnigmail(function(enigmail) {
      enigmail.initialize(window, "");
      Assert.assertArrayContains(EnigmailCore.getEnvList(), "STUFF=testing");
    });
  });
});

test(function initializeWillNotPassEnvironmentsNotAskedTo() {
  getEnigmailPrefs().setPref('keyRefreshOn', true);
  var window = JSUnit.createStubWindow();
  var environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  environment.set("ENIGMAIL_PASS_ENV", "HOME");
  environment.set("STUFF", "testing");
  newEnigmail(function(enigmail) {
    enigmail.initialize(window, "");
    Assert.assertArrayNotContains(EnigmailCore.getEnvList(), "STUFF=testing");
  });
});

test(function initializeWillNotSetEmptyEnvironmentValue() {
  getEnigmailPrefs().setPref('keyRefreshOn', true);
  var window = JSUnit.createStubWindow();
  var environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);
  environment.set("APPDATA", "");
  newEnigmail(function(enigmail) {
    enigmail.initialize(window, "");
    Assert.assertArrayNotContains(EnigmailCore.getEnvList(), "APPDATA=");
  });
});