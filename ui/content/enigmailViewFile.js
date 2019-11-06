/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

var EnigmailLog = ChromeUtils.import("chrome://enigmail/content/modules/log.jsm").EnigmailLog;
var EnigmailDialog = ChromeUtils.import("chrome://enigmail/content/modules/dialog.jsm").EnigmailDialog;
var EnigmailLocale = ChromeUtils.import("chrome://enigmail/content/modules/locale.jsm").EnigmailLocale;
var EnigmailFiles = ChromeUtils.import("chrome://enigmail/content/modules/files.jsm").EnigmailFiles;
var EnigmailCore = ChromeUtils.import("chrome://enigmail/content/modules/core.jsm").EnigmailCore;
var EnigmailWindows = ChromeUtils.import("chrome://enigmail/content/modules/windows.jsm").EnigmailWindows;
var EnigmailPrefs = ChromeUtils.import("chrome://enigmail/content/modules/prefs.jsm").EnigmailPrefs;


var gLogFileData; // global definition of log file data to be able to save
// same data as displayed

function saveLogFile() {
  let fileObj = EnigmailDialog.filePicker(window, EnigmailLocale.getString("saveLogFile.title"), null,
    true, "txt");

  EnigmailFiles.writeFileContents(fileObj, gLogFileData, null);

}

function enigLoadPage() {
  EnigmailLog.DEBUG("enigmailHelp.js: enigLoadPage\n");

  EnigmailCore.getService();

  var winOptions = getWindowOptions();

  if ("viewLog" in winOptions) {
    let cb = document.getElementById("contentBox");
    gLogFileData = EnigmailLog.getLogData(EnigmailCore.version, EnigmailPrefs);
    cb.firstChild.data = gLogFileData;
  }

  if ("title" in winOptions) {
    document.getElementById("EnigmailViewFile").setAttribute("title", winOptions.title);
  }
}

function getWindowOptions() {
  var winOptions = [];
  if (window.location.search) {
    var optList = window.location.search.substr(1).split(/&/);
    for (var i = 0; i < optList.length; i++) {
      var anOption = optList[i].split(new RegExp("="));
      winOptions[anOption[0]] = unescape(anOption[1]);
    }
  }
  return winOptions;
}
