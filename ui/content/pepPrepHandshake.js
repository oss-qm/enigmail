/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*global Components: false */

"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://enigmail/pEpAdapter.jsm"); /* global EnigmailPEPAdapter: false */
Cu.import("resource://enigmail/dialog.jsm"); /* global EnigmailDialog: false */
Cu.import("resource://enigmail/locale.jsm"); /* global EnigmailLocale: false */
Cu.import("resource://enigmail/windows.jsm"); /* global EnigmailWindows: false */
Cu.import("resource://enigmail/timer.jsm"); /* global EnigmailTimer: false */

/*
Arguments:
- addresses (array of email addresses)
- direction: 0 - incoming / 1 - outgoing
- myself: email-address of my identity
- parentWindow: nsIWindow of parent window of the handshake dialog
- onComplete: function to call upon closing the handshake dialog
*/

var isCancelled = false;

function onLoad() {
  let domWindowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
  domWindowUtils.loadSheetUsingURIString("chrome://enigmail/skin/enigmail.css", 1);

  let argsObj = window.arguments[0];
  EnigmailPEPAdapter.getRatingsForEmails(argsObj.addresses).then(
    function _ok(identities) {
      if (isCancelled) return;

      EnigmailTimer.setTimeout(function _f() {
        EnigmailWindows.pepHandshake(argsObj.parentWindow, argsObj.direction, argsObj.myself, identities);
        argsObj.onComplete();
      }, 5);
      window.close();
    }
  ).catch(function _err(data) {
    EnigmailDialog.alert(window, EnigmailLocale.getString("msgCompose.internalError"));
    window.close();
  });
}

function onCancel() {
  isCancelled = true;
}
