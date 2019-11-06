/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

var EnigmailWindows = ChromeUtils.import("chrome://enigmail/content/modules/windows.jsm").EnigmailWindows;
var EnigmailDialog = ChromeUtils.import("chrome://enigmail/content/modules/dialog.jsm").EnigmailDialog;
var EnigmailPrefs = ChromeUtils.import("chrome://enigmail/content/modules/prefs.jsm").EnigmailPrefs;
var EnigmailLocale = ChromeUtils.import("chrome://enigmail/content/modules/locale.jsm").EnigmailLocale;
var EnigmailApp = ChromeUtils.import("chrome://enigmail/content/modules/app.jsm").EnigmailApp;
var EnigmailBuildDate = ChromeUtils.import("chrome://enigmail/content/modules/buildDate.jsm").EnigmailBuildDate;
var EnigmailPEPAdapter = ChromeUtils.import("chrome://enigmail/content/modules/pEpAdapter.jsm").EnigmailPEPAdapter;

var gAccountList;
var gAccountManager;
var gCurrentIdentity = null;
var gTrustedServer;
var gEnableEncryption;
var gPassiveMode;
var gProtectedSubject;
var gWarnReply;
var gLookupKeys;
var gJuniorMode;

function onLoad() {
  gAccountList = document.getElementById("selectedAccount");
  gTrustedServer = document.getElementById("trustedServer");
  gEnableEncryption = document.getElementById("enableEncryption");
  gPassiveMode = document.getElementById("passiveMode");
  gProtectedSubject = document.getElementById("protectedSubject");
  gWarnReply = document.getElementById("warnReply");
  gLookupKeys = document.getElementById("lookupKeys");
  gJuniorMode = EnigmailPrefs.getPref("juniorMode");
  document.getElementById("juniorMode").value = gJuniorMode;
  document.getElementById("aboutLicense").innerHTML = EnigmailLocale.getString("aboutLicense.desc");

  gLookupKeys.checked = (EnigmailPrefs.getPref("autoKeyRetrieve").length > 0);

  let versionNum = EnigmailApp.getVersion() + " (" + EnigmailBuildDate.built + ")";
  let displayVersion = EnigmailLocale.getString("enigmailPepVersion", versionNum);
  document.getElementById("enigmailVersion").setAttribute("value", displayVersion);

  gAccountManager = Cc["@mozilla.org/messenger/account-manager;1"].getService(Ci.nsIMsgAccountManager);

  for (let acct = 0; acct < gAccountManager.accounts.length; acct++) {
    let ac = gAccountManager.accounts.queryElementAt(acct, Ci.nsIMsgAccount);

    for (let i = 0; i < ac.identities.length; i++) {
      let id = ac.identities.queryElementAt(i, Ci.nsIMsgIdentity);
      createIdentityEntry(ac, id);
    }
  }
  gAccountList.selectedIndex = 0;

}

function onAccept() {
  storeIdentitySettings();

  let origLookupKeys = (EnigmailPrefs.getPref("autoKeyRetrieve").length > 0);

  EnigmailPrefs.setPref("autoKeyRetrieve", gLookupKeys.checked ? "pool.sks-keyservers.net" : "");
  EnigmailPrefs.setPref("juniorMode", gJuniorMode);

  if (gLookupKeys.checked && (!origLookupKeys)) {
    EnigmailPEPAdapter.pep.startKeyserverLookup();
  } else if ((!gLookupKeys.checked) && origLookupKeys) {
    EnigmailPEPAdapter.pep.stopKeyserverLookup();
  }

  EnigmailPrefs.savePrefs();
}

function onSelectAccount(element) {
  if (gCurrentIdentity) {
    storeIdentitySettings();
  }

  gCurrentIdentity = element.value;
  loadIdentitySettings();
}

function createIdentityEntry(acct, id) {
  let srv = acct.incomingServer.prettyName;
  if (!gCurrentIdentity) {
    gCurrentIdentity = id.key;
    loadIdentitySettings();
  }

  gAccountList.appendItem(srv + " - " + id.identityName, id.key);
}


function loadIdentitySettings() {
  let id = gAccountManager.getIdentity(gCurrentIdentity);

  gTrustedServer.checked = id.getBoolAttribute("autoEncryptDrafts");
  gEnableEncryption.checked = id.getBoolAttribute("enablePEP");
  gPassiveMode.checked = id.getBoolAttribute("attachPepKey");
  gProtectedSubject.checked = id.getBoolAttribute("protectSubject");
  gWarnReply.checked = id.getBoolAttribute("warnWeakReply");
}

function storeIdentitySettings() {
  let id = gAccountManager.getIdentity(gCurrentIdentity);

  id.setBoolAttribute("autoEncryptDrafts", gTrustedServer.checked);
  id.setBoolAttribute("enablePEP", gEnableEncryption.checked);
  id.setBoolAttribute("attachPepKey", gPassiveMode.checked);
  id.setBoolAttribute("protectSubject", gProtectedSubject.checked);
  id.setBoolAttribute("warnWeakReply", gWarnReply.checked);
}


function contentAreaClick(event) {
  let t = event.target;

  return openURL(t);
}

function openURL(hrefObj) {
  if (!hrefObj) return true;

  let href = hrefObj.getAttribute("href");
  if (!href || !href.length) return true;

  if (href.substr(0, 1) === ">") {
    href = hrefObj.getAttribute(href.substr(1));
  }

  EnigmailWindows.openMailTab(href);

  return false;
}

function juniorModeCallback(item) {
  gJuniorMode = Number(item.value);
}

document.addEventListener("dialogaccept", function(event) {
  onAccept();
});
