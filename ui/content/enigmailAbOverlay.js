/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

/* global DirPaneHasFocus: false, GetSelectedAddressesFromDirTree: false, GetSelectedAddresses: false */

var EnigmailFuncs = ChromeUtils.import("chrome://enigmail/content/modules/funcs.jsm").EnigmailFuncs;
var EnigmailWindows = ChromeUtils.import("chrome://enigmail/content/modules/windows.jsm").EnigmailWindows;

var EnigmailAbOverlay = {
  createRuleFromAddress: function(emailAddressNode) {
    if (emailAddressNode) {
      var r = new RegExp("^" + emailAddressNode.protocol);
      var emailAddress = emailAddressNode.href.replace(r, "");
      EnigmailWindows.createNewRule(window, emailAddress);
    }
  },

  createRuleFromCard: function() {
    var emailAddress = "";
    if (DirPaneHasFocus())
      emailAddress = GetSelectedAddressesFromDirTree();
    else
      emailAddress = GetSelectedAddresses();

    if (emailAddress)
      EnigmailWindows.createNewRule(window, EnigmailFuncs.stripEmail(emailAddress).replace(/,/g, " "));
  }
};

window.addEventListener("unload-enigmail", function _unload() {
    window.removeEventListener("unload-enigmail", _unload, false);
    EnigmailAbOverlay = undefined;
  },
  false);
