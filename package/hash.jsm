/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailHash"];



const EnigmailLog = ChromeUtils.import("chrome://enigmail/content/modules/log.jsm").EnigmailLog;
const EnigmailWindows = ChromeUtils.import("chrome://enigmail/content/modules/windows.jsm").EnigmailWindows;
const EnigmailLocale = ChromeUtils.import("chrome://enigmail/content/modules/locale.jsm").EnigmailLocale;
const EnigmailPrefs = ChromeUtils.import("chrome://enigmail/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailEncryption = ChromeUtils.import("chrome://enigmail/content/modules/encryption.jsm").EnigmailEncryption;
const EnigmailDialog = ChromeUtils.import("chrome://enigmail/content/modules/dialog.jsm").EnigmailDialog;
const EnigmailConstants = ChromeUtils.import("chrome://enigmail/content/modules/constants.jsm").EnigmailConstants;



const keyAlgorithms = [];
const mimeHashAlgorithms = [null, "sha1", "ripemd160", "sha256", "sha384", "sha512", "sha224", "md5"];

var EnigmailHash = {
  determineAlgorithm: function(win, uiFlags, fromMailAddr, hashAlgoObj) {
    EnigmailLog.DEBUG("hash.jsm: determineAlgorithm\n");

    if (!win) {
      win = EnigmailWindows.getMostRecentWindow();
    }

    const sendFlags = EnigmailConstants.SEND_TEST | EnigmailConstants.SEND_SIGNED;
    const hashAlgo = mimeHashAlgorithms[EnigmailPrefs.getPref("mimeHashAlgorithm")];

    if (typeof(keyAlgorithms[fromMailAddr]) != "string") {
      // hash algorithm not yet known

      const testUiFlags = EnigmailConstants.UI_TEST;
      const listener = {
        stdoutData: "",
        stderrData: "",
        exitCode: -1,
        stdin: function(pipe) {
          pipe.write("Dummy Test");
          pipe.close();
        },
        stdout: function(data) {
          this.stdoutData += data;
        },
        stderr: function(data) {
          this.stderrData += data;
        },
        done: function(exitCode) {
          this.exitCode = exitCode;
        }
      };

      let errorMsgObj = {};
      let statusFlagsObj = {};
      const proc = EnigmailEncryption.encryptMessageStart(win, testUiFlags, fromMailAddr, "",
        "", hashAlgo, sendFlags,
        listener, statusFlagsObj, errorMsgObj);

      if (!proc) {
        hashAlgoObj.errorMsg = errorMsgObj.value;
        hashAlgoObj.statusFlags = statusFlagsObj.value;
        return 1;
      }

      proc.wait();

      const msgText = listener.stdoutData;
      const exitCode = listener.exitCode;

      const retStatusObj = {};
      let exitCode2 = EnigmailEncryption.encryptMessageEnd(fromMailAddr, listener.stderrData, exitCode,
        testUiFlags, sendFlags, 10,
        retStatusObj);

      if ((exitCode2 === 0) && !msgText) exitCode2 = 1;
      // if (exitCode2 > 0) exitCode2 = -exitCode2;

      if (exitCode2 !== 0) {
        // Abormal return
        if (retStatusObj.statusFlags & EnigmailConstants.BAD_PASSPHRASE) {
          // "Unremember" passphrase on error return
          retStatusObj.errorMsg = EnigmailLocale.getString("badPhrase");
        }
        EnigmailDialog.alert(win, retStatusObj.errorMsg);
        return exitCode2;
      }

      let hashAlgorithm = "sha1"; // default as defined in RFC 4880, section 7 is MD5 -- but that's outdated

      const m = msgText.match(/^(Hash: )(.*)$/m);
      if (m && (m.length > 2) && (m[1] == "Hash: ")) {
        hashAlgorithm = m[2].toLowerCase();
      }
      else {
        EnigmailLog.DEBUG("hash.jsm: determineAlgorithm: no hashAlgorithm specified - using MD5\n");
      }

      for (let i = 1; i < mimeHashAlgorithms.length; i++) {
        if (mimeHashAlgorithms[i] === hashAlgorithm) {
          EnigmailLog.DEBUG("hash.jsm: determineAlgorithm: found hashAlgorithm " + hashAlgorithm + "\n");
          keyAlgorithms[fromMailAddr] = hashAlgorithm;
          hashAlgoObj.value = hashAlgorithm;
          return 0;
        }
      }

      EnigmailLog.ERROR("hash.jsm: determineAlgorithm: no hashAlgorithm found\n");
      return 2;
    }
    else {
      EnigmailLog.DEBUG("hash.jsm: determineAlgorithm: hashAlgorithm " + keyAlgorithms[fromMailAddr] + " is cached\n");
      hashAlgoObj.value = keyAlgorithms[fromMailAddr];
    }

    return 0;
  }
};
