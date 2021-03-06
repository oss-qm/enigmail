/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailProtocolHandler"];

const EnigmailCompat = ChromeUtils.import("chrome://enigmail/content/modules/compat.jsm").EnigmailCompat;
const EnigmailCore = ChromeUtils.import("chrome://enigmail/content/modules/core.jsm").EnigmailCore;
const EnigmailData = ChromeUtils.import("chrome://enigmail/content/modules/data.jsm").EnigmailData;
const EnigmailLog = ChromeUtils.import("chrome://enigmail/content/modules/log.jsm").EnigmailLog;
const EnigmailStreams = ChromeUtils.import("chrome://enigmail/content/modules/streams.jsm").EnigmailStreams;
const EnigmailURIs = ChromeUtils.import("chrome://enigmail/content/modules/uris.jsm").EnigmailURIs;
const EnigmailKeyRing = ChromeUtils.import("chrome://enigmail/content/modules/keyRing.jsm").EnigmailKeyRing;
const NetUtil = ChromeUtils.import("resource://gre/modules/NetUtil.jsm").NetUtil;

const NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID = "@mozilla.org/network/protocol;1?name=enigmail";
const NS_ENIGMAILPROTOCOLHANDLER_CID = Components.ID("{847b3a11-7ab1-11d4-8f02-006008948af5}");
const ASS_CONTRACTID = "@mozilla.org/appshell/appShellService;1";
const WMEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";

const nsIProtocolHandler = Ci.nsIProtocolHandler;

var EC = EnigmailCore;

const gDummyPKCS7 =
  'Content-Type: multipart/mixed;\r\n boundary="------------060503030402050102040303\r\n\r\nThis is a multi-part message in MIME format.\r\n--------------060503030402050102040303\r\nContent-Type: application/x-pkcs7-mime\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303\r\nContent-Type: application/x-enigmail-dummy\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303--\r\n';


function EnigmailProtocolHandler() {}

EnigmailProtocolHandler.prototype = {
  classDescription: "Enigmail Protocol Handler",
  classID: NS_ENIGMAILPROTOCOLHANDLER_CID,
  contractID: NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID,
  scheme: "enigmail",
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT |
    nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
    nsIProtocolHandler.URI_NORELATIVE |
    nsIProtocolHandler.URI_NOAUTH |
    nsIProtocolHandler.URI_OPENING_EXECUTES_SCRIPT,

  QueryInterface: EnigmailCompat.generateQI([nsIProtocolHandler]),

  newURI: function(aSpec, originCharset, aBaseURI) {
    EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.newURI: aSpec='" + aSpec + "'\n");

    // cut of any parameters potentially added to the URI; these cannot be handled
    if (aSpec.substr(0, 14) == "enigmail:dummy") aSpec = "enigmail:dummy";

    let uri;

    try {
      uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    } catch (x) {
      uri = NetUtil.newURI("data:text/plain,enigmail");
    }

    try {
      // TB <= 58
      uri.spec = aSpec;
    } catch (x) {
      aSpec = aSpec.substr(9);
      let i = aSpec.indexOf("?");
      try {
        // TB < 60
        uri.scheme = "enigmail";
        if (i >= 0) {
          uri.query = aSpec.substr(i + 1);
          uri.pathQueryRef = aSpec.substr(0, i);
        } else {
          uri.pathQueryRef = aSpec;
        }
      } catch (ex) {
        uri = uri.mutate().setScheme("enigmail").finalize();
        if (i >= 0) {
          uri = uri.mutate().setQuery(aSpec.substr(i + 1)).finalize();
          uri = uri.mutate().setPathQueryRef(aSpec.substr(0, i)).finalize();
        } else {
          uri = uri.mutate().setPathQueryRef(aSpec).finalize();
        }
      }

    }

    return uri;
  },

  newChannel: function(aURI, loadInfo) {
    EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.newChannel: URI='" + aURI.spec + "'\n");

    var messageId = EnigmailData.extractMessageId(aURI.spec);
    var mimeMessageId = EnigmailData.extractMimeMessageId(aURI.spec);
    var contentType, contentCharset, contentData;

    if (messageId) {
      // Handle enigmail:message/...

      if (!EC.getEnigmailService()) {
        throw Components.results.NS_ERROR_FAILURE;
      }

      if (EnigmailURIs.getMessageURI(messageId)) {
        var messageUriObj = EnigmailURIs.getMessageURI(messageId);

        contentType = messageUriObj.contentType;
        contentCharset = messageUriObj.contentCharset;
        contentData = messageUriObj.contentData;

        EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.newChannel: messageURL=" + messageUriObj.originalUrl + ", content length=" + contentData.length + ", " + contentType + ", " +
          contentCharset + "\n");

        // do NOT delete the messageUriObj now from the list, this will be done once the message is unloaded (fix for bug 9730).

      } else if (mimeMessageId) {
        this.handleMimeMessage(mimeMessageId);
      } else {

        contentType = "text/plain";
        contentCharset = "";
        contentData = "Enigmail error: invalid URI " + aURI.spec;
      }

      let channel = EnigmailStreams.newStringChannel(aURI, contentType, "UTF-8", contentData, loadInfo);


      return channel;
    }

    if (aURI.spec == aURI.scheme + ":dummy") {
      // Dummy PKCS7 content (to access mimeEncryptedClass)
      return EnigmailStreams.newStringChannel(aURI, "message/rfc822", "", gDummyPKCS7, loadInfo);
    }

    var winName, spec;
    if (aURI.spec == "about:" + aURI.scheme) {
      // About Enigmail
      //            winName = "about:"+enigmail;
      winName = "about:enigmail";
      spec = "chrome://enigmail/content/ui/enigmailAbout.xul";

    } else if (aURI.spec == aURI.scheme + ":console") {
      // Display enigmail console messages
      winName = "enigmail:console";
      spec = "chrome://enigmail/content/ui/enigmailConsole.xul";

    } else if (aURI.spec == aURI.scheme + ":keygen") {
      // Display enigmail key generation console
      winName = "enigmail:keygen";
      spec = "chrome://enigmail/content/ui/enigmailKeygen.xul";

    } else {
      // Display Enigmail about page
      winName = "about:enigmail";
      spec = "chrome://enigmail/content/ui/enigmailAbout.xul";
    }

    var windowManager = Cc[WMEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);

    var winEnum = windowManager.getEnumerator(null);
    var recentWin = null;
    while (winEnum.hasMoreElements() && !recentWin) {
      var thisWin = winEnum.getNext();
      if (thisWin.location.href == spec) {
        recentWin = thisWin;
      }
    }

    if (recentWin) {
      recentWin.focus();
    } else {
      var appShellSvc = Cc[ASS_CONTRACTID].getService(Ci.nsIAppShellService);
      var domWin = appShellSvc.hiddenDOMWindow;

      domWin.open(spec, "_blank", "chrome,menubar,toolbar,resizable");
    }

    throw Components.results.NS_ERROR_FAILURE;
  },

  handleMimeMessage: function(messageId) {
    //        EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.handleMimeMessage: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");
    EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.handleMimeMessage: messageURL=, content length=, , \n");
  },

  allowPort: function(port, scheme) {
    // non-standard ports are not allowed
    return false;
  }
};
