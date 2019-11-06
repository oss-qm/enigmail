/*global test:false, component: false, testing: false, Assert: false, do_load_module: false, do_get_cwd: false, do_get_file: false
  do_test_finished: false: do_test_pending: false*/
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

do_load_module("file://" + do_get_cwd().path + "/testHelper.js"); /*global withPreferences: false, resetting: false, withEnvironment: false, withEnigmail: false, withTestGpgHome: false, gKeyListObj: true */

testing("keyserver.jsm");
/*global false parseKeyserverUrl: false, accessHkpInternal: false, accessKeyBase: false, accessGnuPG: false
EnigmailPrefs: false, EnigmailKeyRing: false, EnigmailConstants: false, EnigmailLocale: false */

function setupKeyserverPrefs(keyservers, autoOn) {
  EnigmailPrefs.setPref("keyserver", keyservers);
  EnigmailPrefs.setPref("autoKeyServerSelection", autoOn);
}

function isGpgExecutable(fullPath) {
  let path = fullPath.replace(/^(.*\/)([^/]+)$/, "$2");
  return (path.search(/^gpg/i) === 0);
}

test(function testParseUrl() {
  let srv = "abc.de.fg";
  const HKP = "hkp";
  const HKP_PORT = "11371";
  let r = parseKeyserverUrl(srv);

  Assert.equal(r.host, srv);
  Assert.equal(r.protocol, HKP);
  Assert.equal(r.port, HKP_PORT);

  r = parseKeyserverUrl("hkps://" + srv);
  Assert.equal(r.host, srv);
  Assert.equal(r.protocol, "hkps");
  Assert.equal(r.port, "443");

  r = parseKeyserverUrl("ldap://" + srv + ":765");
  Assert.equal(r.host, srv);
  Assert.equal(r.protocol, "ldap");
  Assert.equal(r.port, "765");
});

test(function testHkpCreateRequestUrl() {
  let r = accessHkpInternal.createRequestUrl("hkps://example.com", EnigmailConstants.DOWNLOAD_KEY, "12345678");
  Assert.equal(r.method, "GET");
  Assert.equal(r.url, "https://example.com:443/pks/lookup?search=0x12345678&op=get&options=mr");

  r = accessHkpInternal.createRequestUrl("example.com", EnigmailConstants.SEARCH_KEY, "abc");
  Assert.equal(r.method, "GET");
  Assert.equal(r.url, "http://example.com:11371/pks/lookup?search=abc&fingerprint=on&op=index&options=mr");

  r = accessHkpInternal.createRequestUrl("example.com", EnigmailConstants.UPLOAD_KEY, "abc");
  Assert.equal(r.method, "POST");
  Assert.equal(r.url, "http://example.com:11371/pks/add");
});

test(withTestGpgHome(withEnigmail(function testAccessKeyServer() {
  // overwrite createRequestUrl to get local files
  accessHkpInternal.createRequestUrl = function(keyserver, actionFlag, searchTerm) {
    let fn = "";
    let method = "GET";
    let allowNonExist = false;

    switch (actionFlag) {
      case EnigmailConstants.DOWNLOAD_KEY:
        fn = "dev-strike.asc";
        break;
      case EnigmailConstants.SEARCH_KEY:
        fn = "hkp-listing.txt";
        break;
      case EnigmailConstants.UPLOAD_KEY:
        fn = "test-upload.txt";
        method = "PUT";
        allowNonExist = true;
        break;
    }

    let file = do_get_file("resources/" + fn, allowNonExist);
    let ioServ = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    let fileUri = ioServ.newFileURI(file);

    return {
      url: fileUri.spec,
      method: method
    };
  };

  let inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(Ci.nsIJSInspector);

  accessHkpInternal.download("781617319CE311C4", "dummy").then(res => {
    Assert.equal(res.keyList.length, 1);
    Assert.equal(res.result, 0);
    Assert.equal(res.keyList[0], "65537E212DC19025AD38EDB2781617319CE311C4");

    let o = EnigmailKeyRing.getKeyById("0x781617319CE311C4");
    Assert.notEqual(o, null);
    Assert.equal(o.fpr, "65537E212DC19025AD38EDB2781617319CE311C4");

    let data = accessHkpInternal.buildHkpPayload(EnigmailConstants.UPLOAD_KEY, "0x781617319CE311C4");
    Assert.equal(data.replace(/%0D%0A/g, "%0A").substr(0, 75), "keytext=-----BEGIN%20PGP%20PUBLIC%20KEY%20BLOCK-----%0A%0AmQINBFVHm5sBEACs9");

    return accessHkpInternal.search("anything", "dummy");
  }).then(res => {
    Assert.equal(res.result, 0);
    Assert.equal(res.pubKeys.length, 3);
    Assert.equal(res.pubKeys[0].keyId, "CCCCCCCCCCCCCCCCCCCCCCCC0003AAAA00010001");
    Assert.equal(res.pubKeys[1].keyId, "CCCCCCCCCCCCCCCCCCCCCCCC0004AAAA00010001");
    Assert.equal(res.pubKeys[1].created, "2017-12-30");
    Assert.equal(res.pubKeys[1].uid[1], "User Three <test-3@enigmail-test.net>");
    Assert.equal(res.pubKeys[2].keyId, "CCCCCCCCCCCCCCCCCCCCCCCC0005AAAA00010001");
    Assert.equal(res.pubKeys[2].status, "r");

    return accessHkpInternal.upload("0x781617319CE311C4", "dummy");
  }).then(res => {
    Assert.ok(false);

    inspector.exitNestedEventLoop();
  }).catch(res => {
    Assert.equal(res.result, EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE); // this is bound to fail ;-)
    inspector.exitNestedEventLoop();
  });

  inspector.enterNestedEventLoop(0);
})));


test(function testKeybaseCreateRequestUrl() {
  let r = accessKeyBase.createRequestUrl(EnigmailConstants.DOWNLOAD_KEY, "Dev Test");
  Assert.equal(r.method, "GET");
  Assert.equal(r.url, "https://keybase.io/_/api/1.0/user/lookup.json?key_fingerprint=" + escape("Dev Test") + "&fields=public_keys");

  r = accessKeyBase.createRequestUrl(EnigmailConstants.SEARCH_KEY, "abc");
  Assert.equal(r.method, "GET");
  Assert.equal(r.url, "https://keybase.io/_/api/1.0/user/autocomplete.json?q=abc");

  try {
    accessKeyBase.createRequestUrl(EnigmailConstants.UPLOAD_KEY, "abc");
    Assert.ok(false);
  } catch (ex) {
    Assert.ok(true);
  }
});


test(withTestGpgHome(withEnigmail(function testAccessKeybase() {
  // overwrite createRequestUrl to get local files
  accessKeyBase.createRequestUrl = function(actionFlag, searchTerm) {
    let fn = "";
    let method = "GET";
    let allowNonExist = false;

    switch (actionFlag) {
      case EnigmailConstants.DOWNLOAD_KEY:
        fn = "keybase-download.txt";
        break;
      case EnigmailConstants.SEARCH_KEY:
        fn = "keybase-search.txt";
        break;
    }

    let file = do_get_file("resources/" + fn, allowNonExist);
    let ioServ = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    let fileUri = ioServ.newFileURI(file);

    return {
      url: fileUri.spec,
      method: method
    };
  };

  let o = EnigmailKeyRing.getKeyById("0x8439E17046977C46");
  Assert.equal(o, null);

  let inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(Ci.nsIJSInspector);

  accessKeyBase.search("anything", "dummy").then(res => {
    Assert.equal(res.result, 0);
    Assert.equal(res.pubKeys.length, 3);
    Assert.equal(res.pubKeys[0].keyId, "1234567890ABCDEF1234567890ABCDEF12345678");
    Assert.equal(res.pubKeys[1].keyId, "ABCDEF0123456780000000000000000012345678");
    Assert.equal(res.pubKeys[1].created, "");
    Assert.equal(res.pubKeys[1].uid[0], "devtiger (Dev Tiger)");
    Assert.equal(res.pubKeys[2].keyId, "9876543210111111111BBBBBBBBCCCCCCCAAAAAA");
    Assert.equal(res.pubKeys[2].status, "");

    return accessKeyBase.download("0x8439E17046977C46", "dummy");
  }).then(res => {
    Assert.equal(res.keyList.length, 1);
    Assert.equal(res.result, 0);

    let o = EnigmailKeyRing.getKeyById("0x8439E17046977C46");
    Assert.notEqual(o, null);
    Assert.equal(o.fpr, "8C140834F2D683E9A016D3098439E17046977C46");

    inspector.exitNestedEventLoop();
  }).catch(res => {
    Assert.ok(false);
    inspector.exitNestedEventLoop();
  });

  inspector.enterNestedEventLoop(0);
})));


test(withTestGpgHome(withEnigmail(function testAccessGnuPG() {
  let inspector = Cc["@mozilla.org/jsinspector;1"].createInstance(Ci.nsIJSInspector);


  // overwrite accessKeyServer to mock it
  accessGnuPG.accessKeyServer = function(actionFlag, keyserver, keyId, listener) {
    return new Promise((resolve) => {
      let retObj = {
        exitCode: 0,
        stdoutData: "",
        stderrData: "",
        errorMsg: "",
        statusFlags: 0,
        statusMsg: "",
        blockSeparation: "",
        isKilled: 0
      };

      switch (actionFlag) {
        case EnigmailConstants.DOWNLOAD_KEY:
          if (keyId == "ok") {
            retObj.stderrData =
              `[GNUPG:] KEY_CONSIDERED 8C140834F2D683E9A016D3098439E17046977C46 0
[GNUPG:] KEY_CONSIDERED 8C140834F2D683E9A016D3098439E17046977C46 0
[GNUPG:] IMPORT_OK 0 8C140834F2D683E9A016D3098439E17046977C46
[GNUPG:] IMPORT_OK 0 ABCDEF0123456780000000000000000012345678
[GNUPG:] KEY_CONSIDERED 8C140834F2D683E9A016D3098439E17046977C46 0
[GNUPG:] IMPORT_RES 2 0 0 0 2 0 0 0 0 0 0 0 0 0 0`;
            retObj.statusMsg = retObj.stderrData.replace(/^\[GNUPG: \] /mg, "");
          }
          break;
        case EnigmailConstants.SEARCH_KEY:
          if (keyId == "ok") {
            retObj.stdoutData =
              `info:1:3
pub:CCCCCCCCCCCCCCCCCCCCCCCC0003AAAA00010001:1:2048:1516625442::
uid:Test User <test.user@enigmail-test.net>:1516625444::
pub:CCCCCCCCCCCCCCCCCCCCCCCC0004AAAA00010001:1:4096:1514659468::
uid:User Two <test-2@enigmail-test.net>:1514659471::
uid:User Three <test-3@enigmail-test.net>:1514679471::
pub:CCCCCCCCCCCCCCCCCCCCCCCC0005AAAA00010001:1:4096:1510762768:1668442768:r
uid:Revoked User <revoked-key@enigmail-test.net>:1510762768::
uat::::
uat::::`;
          } else {
            retObj.stderrData = "[GNUPG:] FAILURE search-keys 167772380\n";
          }
          break;
        case EnigmailConstants.UPLOAD_KEY:
          if (keyId == "ok") {
            retObj.stderrData = "[GNUPG:] EXPORTED ABCDEF0123456780000000000000000012345678\n";
          } else {
            retObj.stderrData = "[GNUPG:] ERROR keyserver_send 167804953\n[GNUPG:] FAILURE send-keys 167804953\n";
          }

      }

      resolve(retObj);
    });
  };

  async function doTest() {
    try {
      let res = await accessGnuPG.download("ok", null, null);
      Assert.equal(res.keyList.length, 2);
      Assert.equal(res.keyList[1], "ABCDEF0123456780000000000000000012345678");
      Assert.equal(res.result, 0);

      res = await accessGnuPG.search("ok", null, null);
      Assert.equal(res.pubKeys.length, 3);
    } catch (ex) {
      Assert.ok(false);
    }

    try {
      let res = await accessGnuPG.search("error", null, null);
      Assert.ok(false);
    } catch (ex) {
      Assert.equal(ex.result, EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE);
      Assert.equal(ex.errorDetails, EnigmailLocale.getString("keyserver.error.unavailable"));
    }

    try {
      let res = await accessGnuPG.upload("ok", null, null);
      Assert.equal(res.keyList.length, 1);
      Assert.equal(res.result, 0);

      res = await accessGnuPG.search("ok", null, null);
      Assert.equal(res.pubKeys.length, 3);

      res = await accessGnuPG.search("error", null, null);
      Assert.ok(false);
    } catch (ex) {
      Assert.equal(ex.result, 5);
    }

    inspector.exitNestedEventLoop();
  }

  doTest();
  inspector.enterNestedEventLoop(0);
})));