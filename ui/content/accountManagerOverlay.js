/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

var EnigmailPEPAdapter = ChromeUtils.import("chrome://enigmail/content/modules/pEpAdapter.jsm").EnigmailPEPAdapter;


var Enigmail = {
  usingPep: null,
  onLoad: function(event) {
    this.usingPep = EnigmailPEPAdapter.usingPep();
  },

  onClose: function(event) {
    let usingPep = EnigmailPEPAdapter.usingPep();

    if (usingPep !== this.usingPep) {
      EnigmailPEPAdapter.handleJuniorModeChange();
    }

    if (usingPep) {
      EnigmailPEPAdapter.setOwnIdentities(0);
    }
  },

  onUnloadEnigmail: function() {
    window.removeEventListener("load-enigmail", Enigmail.onLoad, true);
    window.removeEventListener("unload-enigmail", Enigmail.onUnload, true);
    window.removeEventListener("dialogaccept", Enigmail.onClose, false);
    window.removeEventListener("dialogcancel", Enigmail.onClose, false);
  }
};

window.addEventListener("load-enigmail", Enigmail.onLoad.bind(Enigmail), true);
window.addEventListener("unload-enigmail", Enigmail.onUnloadEnigmail.bind(Enigmail), true);
window.addEventListener("dialogaccept", Enigmail.onClose.bind(Enigmail), false);
window.addEventListener("dialogcancel", Enigmail.onClose.bind(Enigmail), false);
