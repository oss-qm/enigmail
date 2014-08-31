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
 * The Original Code is Enigmail.
 *
 * The Initial Developer of the Original Code is Ramalingam Saravanan.
 * Portions created by Ramalingam Saravanan <svn@xmlterm.org> are
 * Copyright (C) 2001 Ramalingam Saravanan. All Rights Reserved.
 *
 * Contributor(s):
 *   Patrick Brunschwig <patrick@enigmail.net>
 *   Ludwig Hügelschäfer <ludwig@hammernoch.net>
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


try {
  // TB with omnijar
  Components.utils.import("resource:///modules/gloda/mimemsg.js");
}
catch (ex) {
  // TB without omnijar
  Components.utils.import("resource://app/modules/gloda/mimemsg.js");
}

Components.utils.import("resource://enigmail/enigmailCommon.jsm");
Components.utils.import("resource://enigmail/commonFuncs.jsm");

try {
  Components.utils.import("resource:///modules/MailUtils.js");
}
catch(ex) {}


if (! Enigmail) var Enigmail = {};

Enigmail.msg = {
  editor: null,
  dirty: null,
  processed: null,
  timeoutId: null,
  sendPgpMime: false,
  sendMode: null,    // the current default for sending a message (0, SIGN, ENCRYPT, or SIGN|ENCRYPT)
  sendModeDirty: false,  // send mode or final send options changed?

  // encrypt/sign/pgpmime according to rules?
  // (1:ENIG_UNDEF(undef/maybe), 0:ENIG_NEVER(never/forceNo), 1:ENIG_ALWAYS(always/forceYes), 99:ENIG_CONFLICT(conflict))
  encryptByRules: EnigmailCommon.ENIG_UNDEF,
  signByRules:    EnigmailCommon.ENIG_UNDEF,
  pgpmimeByRules: EnigmailCommon.ENIG_UNDEF,

  // forced to encrypt/sign/pgpmime?
  // (1:ENIG_UNDEF(undef/maybe), 0:ENIG_NEVER(never/forceNo), 1:ENIG_ALWAYS(always/forceYes))
  encryptForced: EnigmailCommon.ENIG_UNDEF,
  signForced:    EnigmailCommon.ENIG_UNDEF,
  pgpmimeForced: EnigmailCommon.ENIG_UNDEF,

  finalSignDependsOnEncrypt: false,  // does signing finally depends on encryption mode?

  // resulting final encrypt/sign/pgpmime mode:
  //  (-1:ENIG_FINAL_UNDEF, 0:ENIG_FINAL_NO, 1:ENIG_FINAL_YES, 10:ENIG_FINAL_FORCENO, 11:ENIG_FINAL_FORCEYES, 99:ENIG_FINAL_CONFLICT)
  statusEncrypted: EnigmailCommon.ENIG_FINAL_UNDEF,
  statusSigned:    EnigmailCommon.ENIG_FINAL_UNDEF,
  statusPGPMime:   EnigmailCommon.ENIG_FINAL_UNDEF,

  // processed strings to signal final encrypt/sign/pgpmime state:
  statusSignedStr:    '???',
  statusEncryptedStr: '???',
  statusPGPMimeStr:   '???',

  sendProcess: false,
  nextCommandId: null,
  docaStateListener: null,
  identity: null,
  enableRules: null,
  modifiedAttach: null,
  lastFocusedWindow: null,
  determineSendFlagId: null,
  trustAllKeys: false,
  attachOwnKeyObj: {
      appendAttachment: false,
      attachedObj: null,
      attachedKey: null
  },

  compFieldsEnig_CID: "@mozdev.org/enigmail/composefields;1",


  composeStartup: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeStartup\n");

    // Relabel/hide SMIME button and menu item
    var smimeButton = document.getElementById("button-security");

    if (smimeButton) {
      smimeButton.setAttribute("label", "S/MIME");
    }

    var enigButton = document.getElementById("button-enigmail-send");

    var msgId = document.getElementById("msgIdentityPopup");
    if (msgId) {
      msgId.setAttribute("oncommand", "Enigmail.msg.setIdentityCallback();");
    }

    var subj = document.getElementById("msgSubject");
    subj.setAttribute('onfocus', "Enigmail.msg.fireSendFlags()");

    this.msgComposeReset(false);   // false => not closing => call setIdentityDefaults()
    this.composeOpen();
    this.processFinalState();
    this.updateStatusBar();
  },


  composeUnload: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeUnload\n");
    //if (gMsgCompose)
    //  gMsgCompose.UnregisterStateListener(Enigmail.composeStateListener);
  },


  handleClick: function (event, modifyType)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.handleClick\n");
    switch (event.button) {
    case 2:
      // do not process the event any futher
      // needed on Windows to prevent displaying the context menu
      event.preventDefault();
      this.doPgpButton();
      break;
    case 0:
      this.doPgpButton(modifyType);
      break;
    }
  },


  setIdentityCallback: function (elementId)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setIdentityCallback: elementId="+elementId+"\n");
    this.setIdentityDefaults();
  },


  /* return whether the account specific setting key is enabled or disabled
   */
  getAccDefault: function (key)
  {
    //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault: identity="+this.identity.key+"("+this.identity.email+") key="+key+"\n");

    var enabled = this.identity.getBoolAttribute("enablePgp");
    if (key == "enabled") {
      return enabled;
    }

    if (enabled) {
      var res=null;
      switch (key) {
       case 'sign':
        res=(this.identity.getIntAttribute("defaultSigningPolicy") > 0); // converts int property to bool property
        break;
       case 'encrypt':
        res=(this.identity.getIntAttribute("defaultEncryptionPolicy") > 0); // converts int property to bool property
        break;
       case 'pgpMimeMode':
        res=this.identity.getBoolAttribute(key);
        break;
       case 'signIfNotEnc':
        res=this.identity.getBoolAttribute("pgpSignPlain");
        break;
       case 'signIfEnc':
        res=this.identity.getBoolAttribute("pgpSignEncrypted");
        break;
       case 'attachPgpKey':
        res=this.identity.getBoolAttribute(key);
        break;
      }
      //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   "+key+"="+res+"\n");
      return res;
    }
    else {
      // every detail is disabled if OpenPGP in general is disabled:
      switch (key) {
       case 'sign':
       case 'encrypt':
       case 'signIfNotEnc':
       case 'signIfEnc':
       case 'pgpMimeMode':
       case 'attachPgpKey':
        return false;
      }
    }

    // should not be reached
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getAccDefault:   internal error: invalid key '"+key+"'\n");
    return null;
  },


  setIdentityDefaults: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setIdentityDefaults\n");

    this.identity = getCurrentIdentity();
    if (this.getAccDefault("enabled")) {
      EnigmailFuncs.getSignMsg(this.identity); // convert old acc specific to new acc specific options
    }
    else {
      // reset status strings in menu to useful defaults
      this.statusSignedStr = EnigmailCommon.getString("signNo", [""]);
      this.statusEncryptedStr = EnigmailCommon.getString("encryptNo");
      this.statusPGPMimeStr = EnigmailCommon.getString("pgpmimeNo");
    }

    // reset default send settings, unless we have changed them already
    if (!this.sendModeDirty) {
      this.processAccountSpecificDefaultOptions();
      this.processFinalState();
      this.updateStatusBar();
    }
  },


  // set the current default for sending a message
  // depending on the identity
  processAccountSpecificDefaultOptions: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.processAccountSpecificDefaultOptions\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    this.sendMode = 0;
    if (! this.getAccDefault("enabled")) {
      return;
    }

    if (this.getAccDefault("sign")) {
      this.sendMode |= SIGN;
    }
    if (this.getAccDefault("encrypt")) {
      this.sendMode |= ENCRYPT;
    }

    this.sendPgpMime = this.getAccDefault("pgpMimeMode");
    this.attachOwnKeyObj.appendAttachment = this.getAccDefault("attachPgpKey");
    this.attachOwnKeyObj.attachedObj = null;
    this.attachOwnKeyObj.attachedKey = null;

    this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
  },


  getMsgProperties: function (msgUri, draft)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties:\n");
    const nsIEnigmail = Components.interfaces.nsIEnigmail;

    var properties = 0;
    try {
      var messenger = Components.classes["@mozilla.org/messenger;1"].getService(Components.interfaces.nsIMessenger);
      var msgHdr = messenger.messageServiceFromURI(msgUri).messageURIToMsgHdr(msgUri);
      if (msgHdr) {
        properties = msgHdr.getUint32Property("enigmail");
        if (draft) {
          try {
            MsgHdrToMimeMessage(msgHdr , null, this.getMsgPropertiesCb, true,
            { examineEncryptedParts: true });
          }
          catch (ex) {
            EnigmailCommon.DEBUG_LOG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: cannot use MsgHdrToMimeMessage\n");
          }
        }
      }
    }
    catch (ex) {
      EnigmailCommon.DEBUG_LOG("enigmailMessengerOverlay.js: Enigmail.msg.getMsgProperties: got exception '"+ex.toString() +"'\n");
    }

    if (EnigmailCommon.isEncryptedUri(msgUri)) {
      properties |= nsIEnigmail.DECRYPTION_OKAY;
    }

    return properties;
  },

  getMsgPropertiesCb: function  (msg, mimeMsg)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getMsgPropertiesCb\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;

    var stat = "";
    if (mimeMsg && mimeMsg.headers["x-enigmail-draft-status"]) {
      stat = String(mimeMsg.headers["x-enigmail-draft-status"]);
    }
    else {
      return;
    }

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getMsgPropertiesCb: draftStatus: "+stat+"\n");

    if (stat.substr(0,1) == "N") {
      // new style drafts (Enigmail 1.7)

      var enc = "final-encryptDefault";
      switch (Number(stat.substr(1,1))) {
      case EnigmailCommon.ENIG_NEVER:
          enc = "final-encryptNo";
          break;
      case EnigmailCommon.ENIG_ALWAYS:
          enc = "final-encryptYes";
      }

      var sig = "final-signDefault";
      switch (Number(stat.substr(2,1))) {
      case EnigmailCommon.ENIG_NEVER:
          sig = "final-signNo";
          break;
      case EnigmailCommon.ENIG_ALWAYS:
          sig = "final-signYes";
      }

      var pgpMime = "final-pgpmimeDefault";
      switch (Number(stat.substr(3,1))) {
      case EnigmailCommon.ENIG_NEVER:
          pgpMime = "final-pgpmimeNo";
          break;
      case EnigmailCommon.ENIG_ALWAYS:
          pgpMime = "final-pgpmimeYes";
      }


      Enigmail.msg.setFinalSendMode(enc);
      Enigmail.msg.setFinalSendMode(sig);
      Enigmail.msg.setFinalSendMode(pgpMime);

      if (stat.substr(4,1) == "1") Enigmail.msg.attachOwnKeyObj.appendAttachment = true;
    }
    else {
      // drafts from older versions of Enigmail
      var flags = Number(stat);
      if (flags & nsIEnigmail.SEND_SIGNED) Enigmail.msg.setFinalSendMode('final-signYes');
      if (flags & nsIEnigmail.SEND_ENCRYPTED) Enigmail.msg.setFinalSendMode('final-encryptYes');
      if (flags & nsIEnigmail.SEND_ATTACHMENT) Enigmail.msg.attachOwnKeyObj.appendAttachment = true;
    }

  },


  composeOpen: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var msgFlags;
    var msgUri = null;
    var msgIsDraft = false;
    this.determineSendFlagId = null;

    var toobarElem = document.getElementById("composeToolbar2");
    if (toobarElem && (EnigmailCommon.getOS() == "Darwin")) {
      toobarElem.setAttribute("platform", "macos");
    }

    // check rules for status bar icons on each change of the recipients
    var adrCol = document.getElementById("addressCol2#1");  // recipients field
    if (adrCol) {
      var attr = adrCol.getAttribute("oninput");
      adrCol.setAttribute("oninput", attr+"; Enigmail.msg.addressOnChange().bind(Enigmail.msg);");
      attr = adrCol.getAttribute("onchange");
      adrCol.setAttribute("onchange", attr+"; Enigmail.msg.addressOnChange().bind(Enigmail.msg);");
    }
    adrCol = document.getElementById("addressCol1#1");      // to/cc/bcc/... field
    if (adrCol) {
      var attr = adrCol.getAttribute("oncommand");
      adrCol.setAttribute("oncommand", attr+"; Enigmail.msg.addressOnChange().bind(Enigmail.msg);");
    }

    var draftId = gMsgCompose.compFields.draftId;

    if (EnigmailCommon.getPref("keepSettingsForReply") && (!(this.sendMode & ENCRYPT)) || (typeof(draftId)=="string" && draftId.length>0)) {
        if (typeof(draftId)=="string" && draftId.length>0) {
          msgUri = draftId.replace(/\?.*$/, "");
          msgIsDraft = true;
        }
        else if (typeof(gMsgCompose.originalMsgURI)=="string" && gMsgCompose.originalMsgURI.length>0) {
          msgUri = gMsgCompose.originalMsgURI;
        }

        if (msgUri != null) {
          msgFlags = this.getMsgProperties(msgUri, msgIsDraft);
          if (! msgIsDraft) {
            if (msgFlags & nsIEnigmail.DECRYPTION_OKAY) {
              EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.composeOpen: has encrypted originalMsgUri\n");
              EnigmailCommon.DEBUG_LOG("originalMsgURI="+gMsgCompose.originalMsgURI+"\n");
              this.setSendMode('encrypt');
            }
            else if (msgFlags & (nsIEnigmail.GOOD_SIGNATURE |
                nsIEnigmail.BAD_SIGNATURE |
                nsIEnigmail.UNVERIFIED_SIGNATURE)) {
              this.setSendMode('sign');
            }
          }
          this.removeAttachedKey();
        }
    }

    // check for attached signature files and remove them
    var bucketList = document.getElementById("attachmentBucket");
    if (bucketList.hasChildNodes()) {
      var node = bucketList.firstChild;
      nodeNumber=0;
      while (node) {
        if (node.attachment.contentType == "application/pgp-signature") {
          if (! this.findRelatedAttachment(bucketList, node)) {
            node = bucketList.removeItemAt(nodeNumber);
            // Let's release the attachment object held by the node else it won't go away until the window is destroyed
            node.attachment = null;
          }
        }
        else {
          ++nodeNumber;
        }
        node = node.nextSibling;
      }
      if (! bucketList.hasChildNodes()) {
        try {
          // TB only
          UpdateAttachmentBucket(false);
        }
        catch (ex) {}
      }
    }

    try {
      // TB only
      UpdateAttachmentBucket(bucketList.hasChildNodes());
    }
    catch (ex) {}

    this.processFinalState();
    this.updateStatusBar();
  },


  // check if an signature is related to another attachment
  findRelatedAttachment: function (bucketList, node)
  {

    // check if filename ends with .sig
    if (node.attachment.name.search(/\.sig$/i) < 0) return null;

    var relatedNode = bucketList.firstChild;
    var findFile = node.attachment.name.toLowerCase();
    var baseAttachment = null;
    while (relatedNode) {
      if (relatedNode.attachment.name.toLowerCase()+".sig" == findFile) baseAttachment = relatedNode.attachment;
      relatedNode = relatedNode.nextSibling;
    }
    return baseAttachment;
  },

  msgComposeReopen: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeReopen\n");
    this.msgComposeReset(false);   // false => not closing => call setIdentityDefaults()
    this.composeOpen();
    this.fireSendFlags();
    //this.determineSendFlags();
    //this.processFinalState();
    //this.updateStatusBar();
  },


  msgComposeClose: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeClose\n");

    var ioServ;
    try {
      // we should delete the original temporary files of the encrypted or signed
      // inline PGP attachments (the rest is done automatically)
      if (this.modifiedAttach) {
        ioServ = Components.classes[EnigmailCommon.IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
        if (!ioServ)
          return;

        for (var i in this.modifiedAttach) {
          if (this.modifiedAttach[i].origTemp) {
            EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeClose: deleting "+this.modifiedAttach[i].origUrl+"\n");
            var fileUri = ioServ.newURI(this.modifiedAttach[i].origUrl, null, null);
            var fileHandle = Components.classes[EnigmailCommon.LOCAL_FILE_CONTRACTID].createInstance(EnigmailCommon.getLocalFileApi());
            fileHandle.initWithPath(fileUri.path);
            if (fileHandle.exists()) fileHandle.remove(false);
          }
        }
        this.modifiedAttach = null;
      }

    } catch (ex) {
      EnigmailCommon.ERROR_LOG("enigmailMsgComposeOverlay.js: ECSL.ComposeProcessDone: could not delete all files:\n"+ex.toString()+"\n");
    }

    this.msgComposeReset(true);  // true => closing => don't call setIdentityDefaults()
  },


  msgComposeReset: function (closing)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.msgComposeReset\n");

    this.dirty = 0;
    this.processed = null;
    this.timeoutId = null;

    this.modifiedAttach=null;
    this.sendMode = 0;
    this.sendModeDirty = false;
    this.signByRules =    EnigmailCommon.ENIG_UNDEF;
    this.encryptByRules = EnigmailCommon.ENIG_UNDEF;
    this.pgpmimeByRules = EnigmailCommon.ENIG_UNDEF;
    this.signForced =    EnigmailCommon.ENIG_UNDEF;
    this.encryptForced = EnigmailCommon.ENIG_UNDEF;
    this.pgpmimeForced = EnigmailCommon.ENIG_UNDEF;
    this.finalSignDependsOnEncrypt = false;
    this.statusSigned =    EnigmailCommon.ENIG_FINAL_UNDEF;
    this.statusEncrypted = EnigmailCommon.ENIG_FINAL_UNDEF;
    this.statusPGPMime =   EnigmailCommon.ENIG_FINAL_UNDEF;
    this.statusSignedStr =    '???';
    this.statusEncryptedStr = '???';
    this.statusPGPMimeStr =   '???';
    this.enableRules = true;
    this.identity = null;
    this.sendProcess = false;
    this.trustAllKeys = false;

    if (! closing) {
      this.setIdentityDefaults();
    }
  },


  initRadioMenu: function (prefName, optionIds)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMessengerOverlay.js: Enigmail.msg.initRadioMenu: "+prefName+"\n");

    var encryptId;

    var prefValue = EnigmailCommon.getPref(prefName);

    if (prefValue >= optionIds.length)
      return;

    var menuItem = document.getElementById("enigmail_"+optionIds[prefValue]);
    if (menuItem)
      menuItem.setAttribute("checked", "true");
  },


  usePpgMimeOption: function (value)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMessengerOverlay.js: Enigmail.msg.usePpgMimeOption: "+value+"\n");

    EnigmailCommon.setPref("usePGPMimeOption", value);

    return true;
  },

  togglePgpMime: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.togglePgpMime\n");

    this.sendPgpMime = !this.sendPgpMime;
  },

  tempTrustAllKeys: function() {
    this.trustAllKeys = !this.trustAllKeys;
  },

  toggleAttachOwnKey: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttachOwnKey\n");
    EnigmailCommon.getService(window); // make sure Enigmail is loaded and working
    this.attachOwnKeyObj.appendAttachment = !this.attachOwnKeyObj.appendAttachment;
  },

  attachOwnKey: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachOwnKey:\n");

    var userIdValue;

    if (this.identity.getIntAttribute("pgpKeyMode")>0) {
      userIdValue = this.identity.getCharAttribute("pgpkeyId");

      if (this.attachOwnKeyObj.attachedKey && (this.attachOwnKeyObj.attachedKey != userIdValue)) {
        // remove attached key if user ID changed
        this.removeAttachedKey();
      }

      if (! this.attachOwnKeyObj.attachedKey) {
        var attachedObj = this.extractAndAttachKey( [userIdValue] );
        if (attachedObj) {
          this.attachOwnKeyObj.attachedObj = attachedObj;
          this.attachOwnKeyObj.attachedKey = userIdValue;
        }
      }
    }
    else {
       EnigmailCommon.ERROR_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachOwnKey: trying to attach unknown own key!\n");
    }
  },

  attachKey: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachKey: \n");

    var resultObj = new Object();
    var inputObj = new Object();
    inputObj.dialogHeader = EnigmailCommon.getString("keysToExport");
    inputObj.options = "multisel,allowexpired,nosending";
    if (this.trustAllKeys) {
      inputObj.options += ",trustallkeys"
    }
    var userIdValue="";

    window.openDialog("chrome://enigmail/content/enigmailUserSelection.xul","", "dialog,modal,centerscreen", inputObj, resultObj);
    try {
      if (resultObj.cancelled) return;
      this.extractAndAttachKey(resultObj.userList);
    } catch (ex) {
      // cancel pressed -> do nothing
      return;
    }
  },

  extractAndAttachKey: function (uid)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.attachKey: \n");
    var enigmailSvc = EnigmailCommon.getService(window);
    if (!enigmailSvc)
      return null;

    var tmpDir=EnigmailCommon.getTempDir();

    try {
      var tmpFile = Components.classes[EnigmailCommon.LOCAL_FILE_CONTRACTID].createInstance(EnigmailCommon.getLocalFileApi());
      tmpFile.initWithPath(tmpDir);
      if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
        EnigmailCommon.alert(window, EnigmailCommon.getString("noTempDir"));
        return null;
      }
    }
    catch (ex) {
      EnigmailCommon.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.extractAndAttachKey", ex);
    }
    tmpFile.append("key.asc");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);

    // save file
    var exitCodeObj= {};
    var errorMsgObj = {};

    enigmailSvc.extractKey(window, 0, uid.join(" "), tmpFile /*.path */, exitCodeObj, errorMsgObj);
    if (exitCodeObj.value != 0) {
      EnigmailCommon.alert(window, errorMsgObj.value);
      return  null;
    }

    // create attachment
    var ioServ = Components.classes[EnigmailCommon.IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
    var tmpFileURI = ioServ.newFileURI(tmpFile);
    var keyAttachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Components.interfaces.nsIMsgAttachment);
    keyAttachment.url = tmpFileURI.spec;
    if ((uid.length == 1) && (uid[0].search(/^(0x)?[a-fA-F0-9]+$/)==0)) {
      keyAttachment.name = "0x"+uid[0].substr(-8,8)+".asc";
    }
    else {
      keyAttachment.name = "pgpkeys.asc";
    }
    keyAttachment.temporary = true;
    keyAttachment.contentType = "application/pgp-keys";

    // add attachment to msg
    this.addAttachment(keyAttachment);

    try {
      // TB only
      ChangeAttachmentBucketVisibility(false);
    }
    catch (ex) {}
    gContentChanged = true;
    return keyAttachment;
  },

  addAttachment: function (attachment)
  {
    if (typeof(AddAttachment) == "undefined") {
      if (typeof(AddUrlAttachment) == "undefined") {
        // TB >= 24
        AddAttachments([attachment]);
      }
      else
        // TB 17
        AddUrlAttachment(attachment);
    }
    else {
      // SeaMonkey
      AddAttachment(attachment);
    }
  },

  /**
   *  undo the encryption or signing; get back the original (unsigned/unencrypted) text
   *
   * useEditorUndo |Number|:   > 0  use undo function of editor |n| times
   *                           0: replace text with original text
   */
  undoEncryption: function (useEditorUndo)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.undoEncryption:\n");
    if (this.processed) {
      if (useEditorUndo) {
        EnigmailCommon.setTimeout(function _f() {
            Enigmail.msg.editor.undo(useEditorUndo);
          }, 10);
      }
      else {
        this.replaceEditorText(this.processed.origText);
      }
      this.processed = null;

    } else {
      this.decryptQuote(true);
    }

    var node;
    var nodeNumber;
    var bucketList = document.getElementById("attachmentBucket");
    if ( this.modifiedAttach && bucketList && bucketList.hasChildNodes() ) {
      // undo inline encryption of attachments
      for (var i=0; i<this.modifiedAttach.length; i++) {
        node = bucketList.firstChild;
        nodeNumber=-1;
        while (node) {
          ++nodeNumber;
          if (node.attachment.url == this.modifiedAttach[i].newUrl) {
            if (this.modifiedAttach[i].encrypted) {
              node.attachment.url = this.modifiedAttach[i].origUrl;
              node.attachment.name = this.modifiedAttach[i].origName;
              node.attachment.temporary = this.modifiedAttach[i].origTemp;
              node.attachment.contentType = this.modifiedAttach[i].origCType;
            }
            else {
              node = bucketList.removeItemAt(nodeNumber);
              // Let's release the attachment object held by the node else it won't go away until the window is destroyed
              node.attachment = null;
            }
            // delete encrypted file
            try {
              this.modifiedAttach[i].newFile.remove(false);
            }
            catch (ex) {}

            node = null; // next attachment please
          }
          else {
            node=node.nextSibling;
          }
        }
      }
    }

    this.removeAttachedKey();
  },


  removeAttachedKey: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.removeAttachedKey: \n");

    var bucketList = document.getElementById("attachmentBucket");
    var node = bucketList.firstChild;

    if (bucketList && bucketList.hasChildNodes() && this.attachOwnKeyObj.attachedObj) {
      // undo attaching own key
      var nodeNumber=-1;
      while (node) {
        ++nodeNumber;
        if (node.attachment.url == this.attachOwnKeyObj.attachedObj.url) {
          node = bucketList.removeItemAt(nodeNumber);
          // Let's release the attachment object held by the node else it won't go away until the window is destroyed
          node.attachment = null;
          this.attachOwnKeyObj.attachedObj = null;
          this.attachOwnKeyObj.attachedKey = null;
          node = null; // exit loop
        }
        else {
          node=node.nextSibling;
        }
      }
      if (! bucketList.hasChildNodes()) {
        try {
          // TB only
          ChangeAttachmentBucketVisibility(true);
        }
        catch(ex) {}
      }
    }
  },


  replaceEditorText: function (text)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.replaceEditorText:\n");
    this.editorSelectAll();

    // Overwrite text in clipboard for security
    // (Otherwise plaintext will be available in the clipbaord)
    this.editorInsertText("Enigmail");
    this.editorSelectAll();

    this.editorInsertText(text);
  },


  getMsgFolderFromUri:  function(uri, checkFolderAttributes)
  {
    let msgfolder = null;
    if (typeof MailUtils != 'undefined') {
      return MailUtils.getFolderForURI(uri, checkFolderAttributes);
    }
    try {
      // Postbox, older versions of TB
      let resource = GetResourceFromUri(uri);
      msgfolder = resource.QueryInterface(Components.interfaces.nsIMsgFolder);
      if (checkFolderAttributes) {
        if (!(msgfolder && (msgfolder.parent || msgfolder.isServer))) {
          msgfolder = null;
        }
      }
    }
    catch (ex) {
       //dump("failed to get the folder resource\n");
    }
    return msgfolder;
  },


  goAccountManager: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.goAccountManager:\n");
    EnigmailCommon.getService(window);
    var currentId=null;
    var server=null;
    try {
        currentId=getCurrentIdentity();
        var amService=Components.classes["@mozilla.org/messenger/account-manager;1"].getService();
        var servers, folderURI;
        try {
          // Gecko >= 20
          servers=amService.getServersForIdentity(currentId);
          folderURI=servers.queryElementAt(0, Components.interfaces.nsIMsgIncomingServer).serverURI;
        }
        catch(ex) {
          servers=amService.GetServersForIdentity(currentId);
          folderURI=servers.GetElementAt(0).QueryInterface(Components.interfaces.nsIMsgIncomingServer).serverURI;
        }

        server=this.getMsgFolderFromUri(folderURI, true).server;
    } catch (ex) {}
    window.openDialog("chrome://enigmail/content/am-enigprefs-edit.xul", "", "dialog,modal,centerscreen", {identity: currentId, account: server});
    this.setIdentityDefaults();
  },


  doPgpButton: function (what)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.doPgpButton: what="+what+"\n");

    // Note: For the toolbar button this is indirectly triggered:
    //       - the menu items trigger nextCommand()
    //       - because afterwards doPgpButton('') is always called (for whatever reason)
    if (! what) {
      what = this.nextCommandId;
    }
    this.nextCommandId = "";
    EnigmailCommon.getService(window); // try to access Enigmail to launch the wizard if needed

    // ignore settings for this account?
    try {
      if (!this.getAccDefault("enabled")) {
        if (EnigmailCommon.confirmDlg(window, EnigmailCommon.getString("configureNow"),
              EnigmailCommon.getString("msgCompose.button.configure"))) {
          // configure account settings for the first time
          this.goAccountManager();
          if (! this.identity.getBoolAttribute("enablePgp")) {
            return;
          }
        }
        else {
          return;
        }
      }
    }
    catch (ex) {}

    switch (what) {
      case 'sign':
      case 'encrypt':
      case 'toggle-sign':
      case 'toggle-encrypt':
        this.setSendMode(what);
        break;

      // menu entries:
      case 'final-signDefault':
      case 'final-signYes':
      case 'final-signNo':
      case 'final-encryptDefault':
      case 'final-encryptYes':
      case 'final-encryptNo':
      case 'final-pgpmimeDefault':
      case 'final-pgpmimeYes':
      case 'final-pgpmimeNo':
      // status bar buttons:
      case 'toggle-final-sign':
      case 'toggle-final-encrypt':
        this.setFinalSendMode(what);
        break;

      case 'togglePGPMime':
        this.togglePgpMime();
        break;

      case 'toggleRules':
        this.toggleRules();
        break;

      case 'trustKeys':
        this.tempTrustAllKeys();
        break;

      case 'nothing':
        break;

      case 'displaySecuritySettings':
      default:
        this.displaySecuritySettings();
    }

  },


  nextCommand: function (what)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.nextCommand: what="+what+"\n");
    this.nextCommandId=what;
  },


  // changes the DEFAULT sendMode
  // - also called internally for saved emails
  setSendMode: function (sendMode)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setSendMode: sendMode="+sendMode+"\n");
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var origSendMode = this.sendMode;
    switch (sendMode) {
      case 'sign':
        this.sendMode |= SIGN;
        break;
      case 'encrypt':
        this.sendMode |= ENCRYPT;
        break;
      case 'toggle-sign':
        if (this.sendMode & SIGN) {
          this.sendMode &= ~SIGN;
        }
        else {
          this.sendMode |= SIGN;
        }
        break;
      case 'toggle-encrypt':
        if (this.sendMode & ENCRYPT) {
          this.sendMode &= ~ENCRYPT;
        }
        else {
          this.sendMode |= ENCRYPT;
        }
        break;
      default:
        EnigmailCommon.alert(window, "Enigmail.msg.setSendMode - unexpected value: "+sendMode);
        break;
    }
    // sendMode changed ?
    // - sign and send are internal initializations
    if (!this.sendModeDirty && (this.sendMode != origSendMode) && sendMode != 'sign' && sendMode != 'encrypt') {
      this.sendModeDirty = true;
    }
    this.processFinalState();
    this.updateStatusBar();
  },


  // changes the FINAL sendMode
  // - triggered by the user interface
  setFinalSendMode: function (sendMode)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setFinalSendMode: sendMode="+sendMode+"\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    switch (sendMode) {

      // menu entries for final settings:

      case 'final-encryptDefault':
        // switch encryption to "use defaults & rules"
        if (this.encryptForced != EnigmailCommon.ENIG_UNDEF) {  // if encrypt/noencrypt forced
          this.encryptForced = EnigmailCommon.ENIG_UNDEF;       // back to defaults/rules
        }
        break;
      case 'final-encryptYes':
        // switch encryption to "force encryption"
        if (this.encryptForced != EnigmailCommon.ENIG_ALWAYS) {  // if not forced to encrypt
          this.encryptForced = EnigmailCommon.ENIG_ALWAYS;       // force to encrypt
        }
        break;
      case 'final-encryptNo':
        // switch encryption to "force no to encrypt"
        if (this.encryptForced != EnigmailCommon.ENIG_NEVER) {  // if not forced not to encrypt
          this.encryptForced = EnigmailCommon.ENIG_NEVER;       // force not to encrypt
        }
        break;

      case 'final-signDefault':
        // switch signing to "use defaults & rules"
        if (this.signForced != EnigmailCommon.ENIG_UNDEF) {  // if sign/nosign forced
          // re-init if signing depends on encryption if this was broken before
          this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
          this.signForced = EnigmailCommon.ENIG_UNDEF;       // back to defaults/rules
        }
        break;
      case 'final-signYes':
        if (this.signForced != EnigmailCommon.ENIG_ALWAYS) {  // if not forced to sign
          this.signingNoLongerDependsOnEnc();
          this.signForced = EnigmailCommon.ENIG_ALWAYS;       // force to sign
        }
        break;
      case 'final-signNo':
        if (this.signForced != EnigmailCommon.ENIG_NEVER) {  // if not forced not to sign
          this.signingNoLongerDependsOnEnc();
          this.signForced = EnigmailCommon.ENIG_NEVER;       // force not to sign
        }
        break;

      case 'final-pgpmimeDefault':
        if (this.pgpmimeForced != EnigmailCommon.ENIG_UNDEF) {  // if any PGP mode forced
          this.pgpmimeForced = EnigmailCommon.ENIG_UNDEF;       // back to defaults/rules
        }
        break;
      case 'final-pgpmimeYes':
        if (this.pgpmimeForced != EnigmailCommon.ENIG_ALWAYS) {  // if not forced to PGP/Mime
          this.pgpmimeForced = EnigmailCommon.ENIG_ALWAYS;       // force to PGP/Mime
        }
        break;
      case 'final-pgpmimeNo':
        if (this.pgpmimeForced != EnigmailCommon.ENIG_NEVER) {  // if not forced not to PGP/Mime
          this.pgpmimeForced = EnigmailCommon.ENIG_NEVER;       // force not to PGP/Mime
        }
        break;

      // status bar buttons:
      // - can only switch to force or not to force sign/enc

      case 'toggle-final-sign':
        this.signingNoLongerDependsOnEnc();
        switch (this.statusSigned) {
          case EnigmailCommon.ENIG_FINAL_NO:
          case EnigmailCommon.ENIG_FINAL_FORCENO:
            this.signForced = EnigmailCommon.ENIG_ALWAYS;          // force to sign
            break;
          case EnigmailCommon.ENIG_FINAL_YES:
          case EnigmailCommon.ENIG_FINAL_FORCEYES:
            this.signForced = EnigmailCommon.ENIG_NEVER;          // force not to sign
            break;
          case EnigmailCommon.ENIG_FINAL_CONFLICT:
            this.signForced = EnigmailCommon.ENIG_ALWAYS;
            break;
        }
        break;
      case 'toggle-final-encrypt':
        switch (this.statusEncrypted) {
          case EnigmailCommon.ENIG_FINAL_NO:
          case EnigmailCommon.ENIG_FINAL_FORCENO:
            this.encryptForced = EnigmailCommon.ENIG_ALWAYS;          // force to encrypt
            break;
          case EnigmailCommon.ENIG_FINAL_YES:
          case EnigmailCommon.ENIG_FINAL_FORCEYES:
            this.encryptForced = EnigmailCommon.ENIG_NEVER;          // force not to encrypt
            break;
          case EnigmailCommon.ENIG_FINAL_CONFLICT:
            this.encryptForced = EnigmailCommon.ENIG_ALWAYS;
            break;
        }
        break;

      default:
        EnigmailCommon.alert(window, "Enigmail.msg.setFinalSendMode - unexpected value: "+sendMode);
        break;
    }

    // this is always a send mode change (only toggle effects)
    this.sendModeDirty = true;

    this.processFinalState();
    this.updateStatusBar();
  },


  // key function to process the final encrypt/sign/pgpmime state from all settings
  // sendFlags: contains the sendFlags if the message is really processed. Optional, can be null
  // - uses as INPUT:
  //   - this.sendMode
  //   - this.encryptByRules, this.signByRules, pgpmimeByRules
  //   - this.encryptForced, this.encryptSigned
  // - uses as OUTPUT:
  //   - this.statusEncrypt, this.statusSign, this.statusPGPMime
  processFinalState: function (sendFlags)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.processFinalState()\n");
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var encFinally = null;
    var signFinally = null;
    var pgpmimeFinally = null;

    if (sendFlags && sendFlags & nsIEnigmail.SAVE_MESSAGE) {
      // special handling for saving drafts

      // drafts are NEVER signed and always PGP/MIME
      signFinally = EnigmailCommon.ENIG_FINAL_FORCENO;
      pgpmimeFinally = EnigmailCommon.ENIG_FINAL_YES;

      if (this.identity.getBoolAttribute("autoEncryptDrafts")) {
        encFinally = EnigmailCommon.ENIG_FINAL_FORCEYES;
      }
      else {
        encFinally = EnigmailCommon.ENIG_FINAL_FORCENO;
      }

      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: special drafts handling\n");
    }
    else {
      // "normal" handling of messages

      // process resulting encrypt mode
      if (this.encryptForced == EnigmailCommon.ENIG_NEVER) {  // force not to encrypt?
        encFinally = EnigmailCommon.ENIG_FINAL_FORCENO;
      }
      else if (this.encryptForced == EnigmailCommon.ENIG_ALWAYS) {  // force to encrypt?
        encFinally = EnigmailCommon.ENIG_FINAL_FORCEYES;
      }
      else switch (this.encryptByRules) {
        case EnigmailCommon.ENIG_NEVER:
          encFinally = EnigmailCommon.ENIG_FINAL_NO;
          break;
        case EnigmailCommon.ENIG_UNDEF:
          encFinally = ((this.sendMode & ENCRYPT) ? EnigmailCommon.ENIG_FINAL_YES : EnigmailCommon.ENIG_FINAL_NO);
          break;
        case EnigmailCommon.ENIG_ALWAYS:
          encFinally = EnigmailCommon.ENIG_FINAL_YES;
          break;
        case EnigmailCommon.ENIG_CONFLICT:
          encFinally = EnigmailCommon.ENIG_FINAL_CONFLICT;
          break;
      }
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   encrypt="+((this.sendMode&ENCRYPT)!=0)+" encryptByRules="+this.encryptByRules+" encFinally="+encFinally+"\n");

      // process resulting sign mode
      if (this.signForced == EnigmailCommon.ENIG_NEVER) {  // force not to sign?
        signFinally = EnigmailCommon.ENIG_FINAL_FORCENO;
      }
      else if (this.signForced == EnigmailCommon.ENIG_ALWAYS) {  // force to sign?
        signFinally = EnigmailCommon.ENIG_FINAL_FORCEYES;
      }
      else switch (this.signByRules) {
        case EnigmailCommon.ENIG_NEVER:
          signFinally = EnigmailCommon.ENIG_FINAL_NO;
          break;
        case EnigmailCommon.ENIG_UNDEF:
          signFinally = ((this.sendMode & SIGN) ? EnigmailCommon.ENIG_FINAL_YES : EnigmailCommon.ENIG_FINAL_NO);
          break;
        case EnigmailCommon.ENIG_ALWAYS:
          signFinally = EnigmailCommon.ENIG_FINAL_YES;
          break;
        case EnigmailCommon.ENIG_CONFLICT:
          signFinally = EnigmailCommon.ENIG_FINAL_CONFLICT;
          break;
      }
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   signed="+((this.sendMode&SIGN)!=0)+" signByRules="+this.signByRules+" signFinally="+signFinally+"\n");

      // process option to finally sign if encrypted/unencrypted
      // (unless rules force not to sign)
      //var derivedFromEncMode = false;
      if (this.finalSignDependsOnEncrypt) {
        if (this.signByRules == EnigmailCommon.ENIG_UNDEF) {  // if final sign mode not clear yet
          //derivedFromEncMode = true;
          switch (encFinally) {
            case EnigmailCommon.ENIG_FINAL_YES:
            case EnigmailCommon.ENIG_FINAL_FORCEYES:
              if (this.getAccDefault("signIfEnc")) {
                signFinally = EnigmailCommon.ENIG_FINAL_YES;
              }
              break;
            case EnigmailCommon.ENIG_FINAL_NO:
            case EnigmailCommon.ENIG_FINAL_FORCENO:
              if (this.getAccDefault("signIfNotEnc")) {
                signFinally = EnigmailCommon.ENIG_FINAL_YES;
              }
              break;
            case EnigmailCommon.ENIG_FINAL_CONFLICT:
              if (this.getAccDefault("signIfEnc") && this.getAccDefault("signIfNotEnc")) {
                signFinally = EnigmailCommon.ENIG_FINAL_YES;
              }
              else {
                signFinally = EnigmailCommon.ENIG_FINAL_CONFLICT;
              }
              break;
          }
          EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   derived signFinally="+signFinally+"\n");
        }
      }

      // process resulting PGP/MIME mode
      if (this.pgpmimeForced == EnigmailCommon.ENIG_NEVER) {  // force not to PGP/Mime?
        pgpmimeFinally = EnigmailCommon.ENIG_FINAL_FORCENO;
      }
      else if (this.pgpmimeForced == EnigmailCommon.ENIG_ALWAYS) {  // force to PGP/Mime?
        pgpmimeFinally = EnigmailCommon.ENIG_FINAL_FORCEYES;
      }
      else switch (this.pgpmimeByRules) {
        case EnigmailCommon.ENIG_NEVER:
          pgpmimeFinally = EnigmailCommon.ENIG_FINAL_NO;
          break;
        case EnigmailCommon.ENIG_UNDEF:
          pgpmimeFinally = ((this.sendPgpMime || (this.sendMode & nsIEnigmail.SEND_PGP_MIME)) ? EnigmailCommon.ENIG_FINAL_YES : EnigmailCommon.ENIG_FINAL_NO);
          break;
        case EnigmailCommon.ENIG_ALWAYS:
          pgpmimeFinally = EnigmailCommon.ENIG_FINAL_YES;
          break;
        case EnigmailCommon.ENIG_CONFLICT:
          pgpmimeFinally = EnigmailCommon.ENIG_FINAL_CONFLICT;
          break;
      }
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   pgpmimeByRules="+this.pgpmimeByRules+" pgpmimeFinally="+pgpmimeFinally+"\n");
    }

    this.statusEncrypted = encFinally;
    this.statusSigned = signFinally;
    this.statusPGPMime = pgpmimeFinally;
  },


  // process icon/strings of status bar buttons and menu entries according to final encrypt/sign/pgpmime status
  // - uses as INPUT:
  //   - this.statusEncrypt, this.statusSign, this.statusPGPMime
  // - uses as OUTPUT:
  //   - resulting icon symbols
  //   - this.statusEncryptStr, this.statusSignStr, this.statusPGPMimeStr
  updateStatusBar: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.updateStatusBar()\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;
    const SIGN    = nsIEnigmail.SEND_SIGNED;

    var statusBar = document.getElementById("enigmail-status-bar");

    if (!this.getAccDefault("enabled")) {
      // hide icons if enigmail not enabled
      statusBar.removeAttribute("encrypted");
      statusBar.removeAttribute("signed");
      return;
    }

    // process resulting icon symbol for encrypt mode
    var encSymbol = null;
    var encStr = null;
    switch (this.statusEncrypted) {
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        encSymbol = "forceNo";
        encStr = EnigmailCommon.getString("encryptNo");
        break;
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        encSymbol = "forceYes";
        encStr = EnigmailCommon.getString("encryptYes");
        break;
      case EnigmailCommon.ENIG_FINAL_NO:
        encSymbol = "inactiveNone";
        encStr = EnigmailCommon.getString("encryptNo");
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
        encSymbol = "activeNone";
        encStr = EnigmailCommon.getString("encryptYes");
        break;
      case EnigmailCommon.ENIG_FINAL_CONFLICT:
        encSymbol = "inactiveConflict";
        encStr = EnigmailCommon.getString("encryptConflict");
        break;
    }
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   encSymbol="+encSymbol+"\n");

    // update encrypt icon and tooltip/menu-text
    statusBar.setAttribute("encrypted", encSymbol);
    var encIcon = document.getElementById("enigmail-encrypted-status");
    encIcon.setAttribute("tooltiptext", encStr);
    this.statusEncryptedStr = encStr;

    // process resulting icon symbol for sign mode
    var signSymbol = null;
    var signStr = null;
    var details = [""];
    //if (derivedFromEncMode) {
    //  details = EnigmailCommon.getString("signDueToEncryptionMode");
    //}
    switch (this.statusSigned) {
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        signSymbol = "forceNo";
        signStr = EnigmailCommon.getString("signNoWithOptionalDetails", details);
        break;
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        signSymbol = "forceYes";
        signStr = EnigmailCommon.getString("signYesWithOptionalDetails", details);
        break;
      case EnigmailCommon.ENIG_FINAL_NO:
        signSymbol = "inactiveNone";
        signStr = EnigmailCommon.getString("signNoWithOptionalDetails", details);
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
        signSymbol = "activeNone";
        signStr = EnigmailCommon.getString("signYesWithOptionalDetails", details);
        break;
      case EnigmailCommon.ENIG_FINAL_CONFLICT:
        signSymbol = "inactiveConflict";
        signStr = EnigmailCommon.getString("signConflict");
        break;
    }
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js:   signSymbol="+signSymbol+"\n");

    // update sign icon and tooltip/menu-text
    statusBar.setAttribute("signed", signSymbol);
    var signIcon = document.getElementById("enigmail-signed-status");
    signIcon.setAttribute("tooltiptext", signStr);
    this.statusSignedStr = signStr;

    // update pgpmime menu-text
    var pgpmimeStr = null;
    switch (this.statusPGPMime) {
      case EnigmailCommon.ENIG_FINAL_NO:
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        pgpmimeStr = EnigmailCommon.getString("pgpmimeNo");
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        pgpmimeStr = EnigmailCommon.getString("pgpmimeYes");
        break;
      case EnigmailCommon.ENIG_FINAL_CONFLICT:
        pgpmimeStr = EnigmailCommon.getString("pgpmimeConflict");
        break;
    }
    this.statusPGPMimeStr = pgpmimeStr;
  },


  /* compute whether to sign/encrypt according to current rules and sendMode
   * - without any interaction, just to process resulting status bar icons
   */
  determineSendFlags: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.focusChange: Enigmail.msg.determineSendFlags\n");
    if (this.getAccDefault("enabled")) {
      var compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
      Recipients2CompFields(compFields);

      // process list of to/cc email addresses
      // - bcc email addresses are ignored, when processing whether to sign/encrypt
      var toAddrList = new Array();
      var arrLen = new Object();
      var recList;
      if (compFields.to.length > 0) {
        recList = compFields.splitRecipients(compFields.to, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }
      if (compFields.cc.length > 0) {
        recList = compFields.splitRecipients(compFields.cc, true, arrLen);
        this.addRecipients(toAddrList, recList);
      }

      this.signByRules    = EnigmailCommon.ENIG_UNDEF;
      this.encryptByRules = EnigmailCommon.ENIG_UNDEF;
      this.pgpmimeByRules = EnigmailCommon.ENIG_UNDEF;

      // process rules
      if (toAddrList.length > 0 && EnigmailCommon.getPref("assignKeysByRules")) {
        var matchedKeysObj = new Object();
        var flagsObj = new Object();
        if (Enigmail.hlp.getRecipientsKeys(toAddrList.join(", "),
                                           false,    // not interactive
                                           false,    // forceRecipientSettings (ignored due to not interactive)
                                           matchedKeysObj, // resulting matching keys (ignored)
                                           flagsObj)) {    // resulting flags (0/1/2/3 for each type)
          this.signByRules    = flagsObj.sign;
          this.encryptByRules = flagsObj.encrypt;
          this.pgpmimeByRules = flagsObj.pgpMime;
        }
      }

      // if not clear whether to encrypt yet, check whether automatically-send-encrypted applies
      if (toAddrList.length > 0 && this.encryptByRules == EnigmailCommon.ENIG_UNDEF && EnigmailCommon.getPref("autoSendEncrypted") == 1) {
        var validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrList.join(", "),
                                                                  false);  // don't refresh key list
        if (validKeyList != null) {
          this.encryptByRules = EnigmailCommon.ENIG_ALWAYS;
        }
      }
    }

    // process and signal new resulting state
    this.processFinalState();
    this.updateStatusBar();
    this.determineSendFlagId = null;
  },

  setChecked: function(elementId, checked) {
    let elem = document.getElementById(elementId);
    if (elem) {
      if (checked) {
        elem.setAttribute("checked", "true");
      }
      else
        elem.removeAttribute("checked");
    }
  },

  setMenuSettings: function (postfix)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setMenuSettings: postfix="+postfix+"\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var elem = document.getElementById("enigmail_compose_sign_menu"+postfix);
    if (elem) {
      elem.setAttribute("label",this.statusSignedStr);
    }
    elem = document.getElementById("enigmail_compose_encrypt_menu"+postfix);
    if (elem) {
      elem.setAttribute("label",this.statusEncryptedStr);
    }
    elem = document.getElementById("enigmail_compose_pgpmime_menu"+postfix);
    if (elem) {
      elem.setAttribute("label",this.statusPGPMimeStr);
    }

    this.setChecked("enigmail_final_encryptDefault"+postfix, this.encryptForced == EnigmailCommon.ENIG_UNDEF);
    this.setChecked("enigmail_final_encryptYes"+postfix, this.encryptForced == EnigmailCommon.ENIG_ALWAYS);
    this.setChecked("enigmail_final_encryptNo"+postfix, this.encryptForced == EnigmailCommon.ENIG_NEVER);
    this.setChecked("enigmail_final_signDefault"+postfix, this.signForced == EnigmailCommon.ENIG_UNDEF);
    this.setChecked("enigmail_final_signYes"+postfix, this.signForced == EnigmailCommon.ENIG_ALWAYS);
    this.setChecked("enigmail_final_signNo"+postfix, this.signForced == EnigmailCommon.ENIG_NEVER);
    this.setChecked("enigmail_final_pgpmimeDefault"+postfix, this.pgpmimeForced == EnigmailCommon.ENIG_UNDEF);
    this.setChecked("enigmail_final_pgpmimeYes"+postfix, this.pgpmimeForced == EnigmailCommon.ENIG_ALWAYS);
    this.setChecked("enigmail_final_pgpmimeNo"+postfix, this.pgpmimeForced == EnigmailCommon.ENIG_NEVER);

    let menuElement = document.getElementById("enigmail_insert_own_key");
    if (menuElement) {
      if (this.identity.getIntAttribute("pgpKeyMode")>0) {
        menuElement.setAttribute("checked", this.attachOwnKeyObj.appendAttachment.toString());
        menuElement.removeAttribute("disabled");
      }
      else {
        menuElement.setAttribute("disabled", "true");
      }
    }
  },

  displaySecuritySettings: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.displaySecuritySettings\n");
    var inputObj = {
                     encryptForced: this.encryptForced,
                     signForced: this.signForced,
                     pgpmimeForced: this.pgpmimeForced,
                     statusSignedStr: this.statusSignedStr,
                     statusEncryptedStr: this.statusEncryptedStr,
                     statusPGPMimeStr: this.statusPGPMimeStr,
                   };
    window.openDialog("chrome://enigmail/content/enigmailEncryptionDlg.xul","", "dialog,modal,centerscreen", inputObj);

    if (this.signForced != inputObj.signForced) {
      this.dirty = 2;
      this.signForced = inputObj.signForced;
      if (this.signForced == EnigmailCommon.ENIG_UNDEF) {       // back to defaults/rules
        // re-init if signing depends on encryption if this was broken before
        this.finalSignDependsOnEncrypt = (this.getAccDefault("signIfEnc") || this.getAccDefault("signIfNotEnc"));
      }
      else {
        this.signingNoLongerDependsOnEnc();
      }
    }
    if (this.encryptForced != inputObj.encryptForced) {
      this.dirty = 2;
      this.encryptForced = inputObj.encryptForced;
    }
    if (this.pgpmimeForced != inputObj.pgpmimeForced) {
      this.pgpmimeForced = inputObj.pgpmimeForced;
    }
    this.processFinalState();
    this.updateStatusBar();
  },


  signingNoLongerDependsOnEnc: function ()
  {
    if (this.finalSignDependsOnEncrypt) {
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.signingNoLongerDependsOnEnc(): unbundle final signing\n");
      this.finalSignDependsOnEncrypt = false;

      EnigmailCommon.alertPref(window, EnigmailCommon.getString("signIconClicked"), "displaySignWarn");
    }
  },


  confirmBeforeSend: function (toAddrStr, gpgKeys, sendFlags, isOffline)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.confirmBeforeSend: sendFlags="+sendFlags+"\n");
    // get confirmation before sending message

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    // get wording for message status (e.g. " SIGNED ENCRYPTED")
    var msgStatus = "";
    if (sendFlags & (ENCRYPT | SIGN)) {
      if (sendFlags & nsIEnigmail.SEND_PGP_MIME) {
        msgStatus += " " + EnigmailCommon.getString("statPGPMIME");
      }
      if (sendFlags & SIGN) {
        msgStatus += " " + EnigmailCommon.getString("statSigned");
      }
      if (sendFlags & ENCRYPT) {
        msgStatus += " " + EnigmailCommon.getString("statEncrypted");
      }
    }
    else {
      msgStatus += " " + EnigmailCommon.getString("statPlain");
    }

    // create message
    var msgConfirm = ""
    if (isOffline || sendFlags & nsIEnigmail.SEND_LATER) {
      msgConfirm = EnigmailCommon.getString("offlineSave", [ msgStatus, EnigmailFuncs.stripEmail(toAddrStr).replace(/,/g, ", ") ])
    }
    else {
      msgConfirm = EnigmailCommon.getString("onlineSend", [ msgStatus, EnigmailFuncs.stripEmail(toAddrStr).replace(/,/g, ", ") ]);
    }

    // add list of keys
    if (sendFlags & ENCRYPT) {
      gpgKeys=gpgKeys.replace(/^, /, "").replace(/, $/,"");
      msgConfirm += "\n\n"+EnigmailCommon.getString("encryptKeysNote", [ gpgKeys ]);
    }

    return EnigmailCommon.confirmDlg(window, msgConfirm,
                                     EnigmailCommon.getString((isOffline || sendFlags & nsIEnigmail.SEND_LATER)
                                      ? "msgCompose.button.save" : "msgCompose.button.send"));
  },


  addRecipients: function (toAddrList, recList)
  {
    for (var i=0; i<recList.length; i++) {
      toAddrList.push(EnigmailFuncs.stripEmail(recList[i].replace(/[\",]/g, "")));
    }
  },

  setDraftStatus: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.setDraftStatus - enabling draft mode\n");

    // Draft Status:
    // N (for new style) plus String of 4 numbers:
    // 1: encryption
    // 2: signing
    // 3: PGP/MIME
    // 4: attach own key

    var draftStatus = "N" + this.encryptForced + this.signForced + this.pgpmimeForced +
      (this.attachOwnKeyObj.appendAttachment ? "1" : "0");

    gMsgCompose.compFields.otherRandomHeaders += "X-Enigmail-Draft-Status: "+draftStatus+"\r\n";
  },


  getSenderUserId: function ()
  {
    var userIdValue = null;

    if (this.identity.getIntAttribute("pgpKeyMode")>0) {
       userIdValue = this.identity.getCharAttribute("pgpkeyId");

      if (!userIdValue) {

        var mesg = EnigmailCommon.getString("composeSpecifyEmail");

        var valueObj = {
          value: userIdValue
        };

        if (EnigmailCommon.promptValue(window, mesg, valueObj)) {
          userIdValue = valueObj.value;
        }
      }

      if (userIdValue) {
        this.identity.setCharAttribute("pgpkeyId", userIdValue);

      }
      else {
        this.identity.setIntAttribute("pgpKeyMode", 0);
      }
    }

    if (typeof(userIdValue) != "string") {
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getSenderUserId: type of userIdValue="+typeof(userIdValue)+"\n");
      userIdValue = this.identity.email;
    }
    return userIdValue;
  },


  /* process rules and find keys for passed email addresses
   * This is THE core method to prepare sending encryptes emails.
   * - it processes the recipient rules (if not disabled)
   * - it
   *
   * @sendFlags:    all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags: may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @gotSendFlags: initial sendMode of encryptMsg() (0 or SIGN or ENCRYPT or SIGN|ENCRYPT)
   * @fromAddr:     from email
   * @toAddrList:   both to and cc receivers
   * @bccAddrList:  bcc receivers
   * @return:       sendFlags
   *                toAddrStr  comma separated string of unprocessed to/cc emails
   *                bccAddrStr comma separated string of unprocessed to/cc emails
   *                or null (cancel sending the email)
   */
  keySelection: function (enigmailSvc, sendFlags, optSendFlags, gotSendFlags, fromAddr, toAddrList, bccAddrList)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection()\n");
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var toAddrStr = toAddrList.join(", ");
    var bccAddrStr = bccAddrList.join(", ");

    // NOTE: If we only have bcc addresses, we currently do NOT process rules and select keys at all
    //       This is GOOD because sending keys for bcc addresses makes bcc addresses visible
    //       (thus compromising the concept of bcc)
    //       THUS, we disable encryption even though all bcc receivers might want to have it encrypted.
    if (toAddrStr.length == 0) {
       EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): skip key selection because we neither have \"to\" nor \"cc\" addresses\n");
       return {
         sendFlags: sendFlags,
         toAddrStr: toAddrStr,
         bccAddrStr: bccAddrStr,
       };
    }

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): toAddrStr=\""+toAddrStr+"\" bccAddrStr=\""+bccAddrStr+"\"\n");

    // force add-rule dialog for each missing key?:
    var forceRecipientSettings = false;
    // if keys are ONLY assigned by rules, force add-rule dialog for each missing key
    if (! (sendFlags & nsIEnigmail.SAVE_MESSAGE) &&
        EnigmailCommon.getPref("assignKeysByRules") &&
        ! EnigmailCommon.getPref("assignKeysByEmailAddr") &&
        ! EnigmailCommon.getPref("assignKeysManuallyIfMissing") &&
        ! EnigmailCommon.getPref("assignKeysManuallyAlways")) {
      forceRecipientSettings = true;
    }

    // REPEAT 1 or 2 times:
    // NOTE: The only way to call this loop twice is to come to the "continue;" statement below,
    //       which forces a second iteration (with forceRecipientSettings==true)
    var doRulesProcessingAgain;
    do {
      doRulesProcessingAgain=false;

      // process rules if not disabled
      // - enableRules: rules not temporarily disabled
      // REPLACES email addresses by keys in its result !!!
      if (EnigmailCommon.getPref("assignKeysByRules") && this.enableRules) {
        var result = this.processRules (forceRecipientSettings, sendFlags, optSendFlags, toAddrStr, bccAddrStr)
        if (!result) {
          return null;
        }
        sendFlags = result.sendFlags;
        optSendFlags = result.optSendFlags;
        toAddrStr = result.toAddr;    // replace email addresses with rules by the corresponding keys
        bccAddrStr = result.bccAddr;  // replace email addresses with rules by the corresponding keys
      }

      // if encryption is requested for the email:
      // - encrypt test message for default encryption
      // - might trigger a second iteration through this loop
      //   - if during its dialog for manual key selection "create per-recipient rules" is pressed
      //   to force manual settings for missing keys
      // LEAVES remaining email addresses not covered by rules as they are
      if (sendFlags & ENCRYPT) {
        var result = this.encryptTestMessage (enigmailSvc, sendFlags, optSendFlags, fromAddr, toAddrStr, bccAddrStr, bccAddrList)
        if (!result) {
          return null;
        }
        sendFlags = result.sendFlags;
        toAddrStr = result.toAddrStr;
        bccAddrStr = result.bccAddrStr;
        if (result.doRulesProcessingAgain) {  // start rule processing again ?
          doRulesProcessingAgain=true;
          forceRecipientSettings=true;
        }
      }
    } while (doRulesProcessingAgain);

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.keySelection(): return toAddrStr=\""+toAddrStr+"\" bccAddrStr=\""+bccAddrStr+"\"\n");
    return {
      sendFlags: sendFlags,
      toAddrStr: toAddrStr,
      bccAddrStr: bccAddrStr,
    };
  },

  /* Determine if S/MIME or OpenPGP should be used
   *
   * return: Boolean:
   *   - true:  use OpenPGP
   *   - false: use SMIME
   *   - null:  dialog aborted - cancel sending
   */

  preferPgpOverSmime: function(sendFlags) {

    const nsIEnigmail = Components.interfaces.nsIEnigmail;

    if (gMsgCompose.compFields.securityInfo instanceof Components.interfaces.nsIMsgSMIMECompFields &&
        (sendFlags & (nsIEnigmail.SEND_SIGNED | nsIEnigmail.SEND_ENCRYPTED))) {

      if (gMsgCompose.compFields.securityInfo.requireEncryptMessage ||
         gMsgCompose.compFields.securityInfo.signMessage) {

         var promptSvc = EnigmailCommon.getPromptSvc();
         var prefAlgo = EnigmailCommon.getPref("mimePreferPgp");
         if (prefAlgo == 1) {
           var checkedObj={ value: null};
           prefAlgo = promptSvc.confirmEx(window,
                      EnigmailCommon.getString("enigConfirm"),
                      EnigmailCommon.getString("pgpMime_sMime.dlg.text"),
                      (promptSvc. BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_0) +
                      (promptSvc. BUTTON_TITLE_CANCEL * promptSvc.BUTTON_POS_1) +
                      (promptSvc. BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_2),
                      EnigmailCommon.getString("pgpMime_sMime.dlg.pgpMime.button"),
                      null,
                      EnigmailCommon.getString("pgpMime_sMime.dlg.sMime.button"),
                      EnigmailCommon.getString("dlgKeepSetting"),
                      checkedObj);
           if (checkedObj.value && (prefAlgo==0 || prefAlgo==2)) EnigmailCommon.setPref("mimePreferPgp", prefAlgo);
         }
         switch (prefAlgo) {
         case 0:
            // use OpenPGP and not S/MIME
            gMsgCompose.compFields.securityInfo.requireEncryptMessage = false;
            gMsgCompose.compFields.securityInfo.signMessage = false;
            return true;
         case 2:
            // use S/MIME and not OpenPGP
            return false;
         case 1:
         default:
            // cancel or ESC pressed
            return null;
         }
      }
    }

    return true;
  },


  /* process rules
   *
   * @forceRecipientSetting: force manual selection for each missing key?
   * @sendFlags:    INPUT/OUTPUT all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags: INPUT/OUTPUT may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @toAddrStr:    INPUT/OUTPUT comma separated string of keys and unprocessed to/cc emails
   * @bccAddrStr:   INPUT/OUTPUT comma separated string of keys and unprocessed bcc emails
   * @return:       { sendFlags, toAddr, bccAddr }
   *                or null (cancel sending the email)
   */
  processRules: function (forceRecipientSettings, sendFlags, optSendFlags, toAddrStr, bccAddrStr)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): toAddrStr=\""+toAddrStr+"\" bccAddrStr=\""+bccAddrStr+"\" forceRecipientSettings="+forceRecipientSettings+"\n");

    // process defaults
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    // get keys for to and cc addresses:
    // - matchedKeysObj will contain the keys and the remaining toAddrStr elements
    var matchedKeysObj = new Object;  // returned value for matched keys
    var flagsObj = new Object;        // returned value for flags
    if (!Enigmail.hlp.getRecipientsKeys(toAddrStr,
                                        true,           // interactive
                                        forceRecipientSettings,
                                        matchedKeysObj,
                                        flagsObj)) {
      return null;
    }
    if (matchedKeysObj.value) {
      toAddrStr = matchedKeysObj.value;
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): after getRecipientsKeys() toAddrStr=\""+toAddrStr+"\"\n");
    }
    this.signByRules    = flagsObj.sign;
    this.encryptByRules = flagsObj.encrypt;
    this.pgpmimeByRules = flagsObj.pgpMime;

    // if not clear whether to encrypt yet, check whether automatically-send-encrypted applies
    // - check whether bcc is empty here? if (bccAddrStr.length == 0)
    if (toAddrStr.length > 0 && this.encryptByRules == EnigmailCommon.ENIG_UNDEF && EnigmailCommon.getPref("autoSendEncrypted") == 1) {
      var validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrStr,
                                                                true);  // refresh key list
      if (validKeyList != null) {
        this.encryptByRules = EnigmailCommon.ENIG_ALWAYS;
        toAddrStr = validKeyList.join(", ");
      }
    }

    // process final state
    this.processFinalState(sendFlags);

    // final handling of conflicts:
    // - pgpMime conflicts always result into pgpMime = 0/'never'
    if (this.statusPGPMime == EnigmailCommon.ENIG_FINAL_CONFLICT) {
      this.statusPGPMime = EnigmailCommon.ENIG_FINAL_NO;
    }
    // - encrypt/sign conflicts result into result 0/'never'
    //   with possible dialog to give a corresponding feedback
    var conflictFound = false;
    if (this.statusEncrypted == EnigmailCommon.ENIG_FINAL_CONFLICT) {
      this.statusEncrypted = EnigmailCommon.ENIG_FINAL_NO;
      conflictFound = true;
    }
    if (this.statusSigned == EnigmailCommon.ENIG_FINAL_CONFLICT) {
      this.statusSigned = EnigmailCommon.ENIG_FINAL_NO;
      conflictFound = true;
    }
    if (conflictFound) {
      if (!Enigmail.hlp.processConflicts(this.statusEncrypted==EnigmailCommon.ENIG_FINAL_YES || this.statusEncrypted==EnigmailCommon.ENIG_FINAL_FORCEYES,
                                         this.statusSigned==EnigmailCommon.ENIG_FINAL_YES || this.statusSigned==EnigmailCommon.ENIG_FINAL_FORCEYES)) {
        return null;
      }
    }

    // process final sendMode
    //  ENIG_FINAL_CONFLICT no longer possible
    switch (this.statusEncrypted) {
      case EnigmailCommon.ENIG_FINAL_NO:
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        sendFlags &= ~ENCRYPT;
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        sendFlags |= ENCRYPT;
        break;
    }
    switch (this.statusSigned) {
      case EnigmailCommon.ENIG_FINAL_NO:
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        sendFlags &= ~SIGN;
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        sendFlags |= SIGN;
        break;
    }
    switch (this.statusPGPMime) {
      case EnigmailCommon.ENIG_FINAL_NO:
      case EnigmailCommon.ENIG_FINAL_FORCENO:
        sendFlags &= ~nsIEnigmail.SEND_PGP_MIME;
        break;
      case EnigmailCommon.ENIG_FINAL_YES:
      case EnigmailCommon.ENIG_FINAL_FORCEYES:
        sendFlags |= nsIEnigmail.SEND_PGP_MIME;
        break;
    }

    // get keys according to rules for bcc addresses:
    // - matchedKeysObj will contain the keys and the remaining bccAddrStr elements
    // - NOTE: bcc recipients are ignored when in general computing whether to sign or encrypt or pgpMime
    if (!Enigmail.hlp.getRecipientsKeys(bccAddrStr,
                                        true,           // interactive
                                        forceRecipientSettings,
                                        matchedKeysObj,
                                        flagsObj)) {
      return null;
    }
    if (matchedKeysObj.value) {
      bccAddrStr = matchedKeysObj.value;
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.processRules(): after getRecipientsKeys() bccAddrStr=\""+bccAddrStr+"\"\n");
    }

    return {
      sendFlags: sendFlags,
      optSendFlags: optSendFlags,
      toAddr: toAddrStr,
      bccAddr: bccAddrStr,
    };
  },


  /* encrypt a test message to see whether we have all necessary keys
   *
   * @sendFlags:    all current combined/processed send flags (incl. optSendFlags)
   * @optSendFlags: may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
   * @fromAddr:     from email
   * @toAddrStr:    comma separated string of keys and unprocessed to/cc emails
   * @bccAddrStr:   comma separated string of keys and unprocessed bcc emails
   * @bccAddrList:  bcc receivers
   * @return:       doRulesProcessingAgain: start with rule processing once more
   *                or null (cancel sending the email)
   */
  encryptTestMessage: function (enigmailSvc, sendFlags, optSendFlags, fromAddr, toAddrStr, bccAddrStr, bccAddrList)
  {
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var testCipher = null;
    var testExitCodeObj    = new Object();
    var testStatusFlagsObj = new Object();
    var testErrorMsgObj    = new Object();

    // get keys for remaining email addresses
    // - NOTE: This should not be necessary; however, in GPG there is a problem:
    //         Only the first key found for an email is used.
    //         If this is invalid, no other keys are tested.
    //         Thus, WE make it better here in enigmail until the bug is fixed.
    if (EnigmailCommon.getPref("assignKeysByEmailAddr")) {
      var validKeyList = Enigmail.hlp.validKeysForAllRecipients(toAddrStr,
                                                                true);  // refresh key list
      if (validKeyList != null) {
        toAddrStr = validKeyList.join(", ");
      }
    }

    // encrypt test message for test recipients
    var testPlain = "Test Message";
    var testUiFlags   = nsIEnigmail.UI_TEST;
    var testSendFlags = nsIEnigmail.SEND_TEST | ENCRYPT | optSendFlags ;
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptTestMessage(): call encryptMessage() for fromAddr=\""+fromAddr+"\" toAddrStr=\""+toAddrStr+"\" bccAddrStr=\""+bccAddrStr+"\"\n");
    testCipher = enigmailSvc.encryptMessage(window, testUiFlags, testPlain,
                                            fromAddr, toAddrStr, bccAddrStr,
                                            testSendFlags,
                                            testExitCodeObj,
                                            testStatusFlagsObj,
                                            testErrorMsgObj);

    if (testStatusFlagsObj.value) {
      // check if own key is invalid
      let s = new RegExp("^INV_(RECP|SGNR) [0-9]+ \\<?" + fromAddr + "\\>?", "m");
      if (testErrorMsgObj.value.search(s) >= 0)  {
        EnigmailCommon.alert(window, EnigmailCommon.getString("errorKeyUnusable", [ fromAddr ]));
        return null;
      }
    }

    // if
    // - "always ask/manually" (even if all keys were found) or
    // - we have an invalid recipient or
    // - we could not resolve any/all keys
    //   (due to disabled "assignKeysByEmailAddr"" or multiple keys with same trust for a recipient)
    // start the dialog for user selected keys
    if (EnigmailCommon.getPref("assignKeysManuallyAlways")
        || ((testStatusFlagsObj.value & nsIEnigmail.INVALID_RECIPIENT)
            && EnigmailCommon.getPref("assignKeysManuallyIfMissing"))
        || toAddrStr.indexOf('@') >= 0) {

      // check for invalid recipient keys
      var resultObj = new Object();
      var inputObj = new Object();
      inputObj.toAddr = toAddrStr;
      inputObj.invalidAddr = Enigmail.hlp.getInvalidAddress(testErrorMsgObj.value);

      // prepare dialog options:
      inputObj.options = "multisel";
      if (EnigmailCommon.getPref("assignKeysByRules")) {
        inputObj.options += ",rulesOption"; // enable button to create per-recipient rule
      }
      if (EnigmailCommon.getPref("assignKeysManuallyAlways")) {
        inputObj.options += ",noforcedisp";
      }
      if (!(sendFlags&SIGN)) {
        inputObj.options += ",unsigned";
      }
      if (this.trustAllKeys) {
        inputObj.options += ",trustallkeys";
      }
      if (sendFlags&nsIEnigmail.SEND_LATER) {
        sendLaterLabel = EnigmailCommon.getString("sendLaterCmd.label");
        inputObj.options += ",sendlabel=" + sendLaterLabel;
      }
      inputObj.options += ",";
      inputObj.dialogHeader = EnigmailCommon.getString("recipientsSelectionHdr");

      // perform key selection dialog:
      window.openDialog("chrome://enigmail/content/enigmailUserSelection.xul","", "dialog,modal,centerscreen", inputObj, resultObj);

      // process result from key selection dialog:
      try {
        // CANCEL:
        if (resultObj.cancelled) {
          return null;
        }

        // "Create per recipient rule(s)":
        if (resultObj.perRecipientRules && this.enableRules) {
          // do an extra round because the user wants to set a PGP rule
          // THIS is the place that triggers a second iteration
          return {
            doRulesProcessingAgain : true,
            sendFlags : sendFlags,
            toAddrStr : toAddrStr,
            bccAddrStr : bccAddrStr,
          }
        }

        // process OK button:
        if (resultObj.sign) {
          sendFlags |= SIGN;
        }
        else {
          sendFlags &= ~SIGN;
        }
        if (! resultObj.encrypt) {
          // encryption explicitely turned off
          sendFlags &= ~ENCRYPT;
        }
        else {
          if (bccAddrList.length > 0) {
            toAddrStr = "";
            bccAddrStr = resultObj.userList.join(", ");
          }
          else {
            toAddrStr = resultObj.userList.join(", ");
            bccAddrStr = "";
          }
        }
        testCipher="ok";
        testExitCodeObj.value = 0;
      } catch (ex) {
        // cancel pressed -> don't send mail
        return null;
      }
    }
    // If test encryption failed and never ask manually, turn off default encryption
    if ((!testCipher || (testExitCodeObj.value != 0)) &&
        !EnigmailCommon.getPref("assignKeysManuallyIfMissing") &&
        !EnigmailCommon.getPref("assignKeysManuallyAlways")) {
      sendFlags &= ~ENCRYPT;
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptTestMessage: No default encryption because test failed\n");
    }
    return {
      doRulesProcessingAgain : false,
      sendFlags : sendFlags,
      toAddrStr : toAddrStr,
      bccAddrStr : bccAddrStr,
    };
  },


  encryptMsg: function (msgSendType)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: msgSendType="+msgSendType+", Enigmail.msg.sendMode="+this.sendMode+", Enigmail.msg.statusEncrypted="+this.statusEncrypted+"\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;
    const CiMsgCompDeliverMode = Components.interfaces.nsIMsgCompDeliverMode;
    var promptSvc = EnigmailCommon.getPromptSvc();

    var gotSendFlags = this.sendMode;
    // here we process the final state:
    if (this.statusEncrypted == EnigmailCommon.ENIG_FINAL_YES ||
        this.statusEncrypted == EnigmailCommon.ENIG_FINAL_FORCEYES) {
      gotSendFlags |= ENCRYPT;
    }
    if (this.statusSigned == EnigmailCommon.ENIG_FINAL_YES ||
        this.statusSigned == EnigmailCommon.ENIG_FINAL_FORCEYES) {
      gotSendFlags |= SIGN;
    }

    var sendFlags=0;
    window.enigmailSendFlags=0;

    switch (msgSendType) {
    case CiMsgCompDeliverMode.Later:
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: adding SEND_LATER\n")
      sendFlags |= nsIEnigmail.SEND_LATER;
      break;
    case CiMsgCompDeliverMode.SaveAsDraft:
    case CiMsgCompDeliverMode.SaveAsTemplate:
    case CiMsgCompDeliverMode.AutoSaveAsDraft:
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: adding SAVE_MESSAGE\n")
      sendFlags |= nsIEnigmail.SAVE_MESSAGE;
      break;
    }

    var msgCompFields = gMsgCompose.compFields;
    var newsgroups = msgCompFields.newsgroups;  // Check if sending to any newsgroups

    if ((! (sendFlags & nsIEnigmail.SAVE_MESSAGE)) &&
        msgCompFields.to == "" &&
        msgCompFields.cc == "" &&
        msgCompFields.bcc == "" &&
        newsgroups == "") {
      // don't attempt to send message if no recipient specified
      var bundle = document.getElementById("bundle_composeMsgs");
      EnigmailCommon.alert(window, bundle.getString("12511"));
      return false;
    }

    if (gotSendFlags & SIGN) sendFlags |= SIGN;
    if (gotSendFlags & ENCRYPT) sendFlags |= ENCRYPT;

    this.identity = getCurrentIdentity();
    var encryptIfPossible = false;
    if (sendFlags & nsIEnigmail.SAVE_MESSAGE) {
      this.setDraftStatus();

      if (! this.identity.getBoolAttribute("autoEncryptDrafts")) {
        EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: drafts disabled\n");
        sendFlags &= ~ENCRYPT;

        try {
          if (gMsgCompose.compFields.securityInfo instanceof Components.interfaces.nsIEnigMsgCompFields) {
            gMsgCompose.compFields.securityInfo.sendFlags &= ~ENCRYPT;

          }
        }
        catch(ex) {}

        return true;
      }
    }

    if (gWindowLocked) {
      EnigmailCommon.alert(window, EnigmailCommon.getString("windowLocked"));
      return false;
    }

    if (this.dirty) {
      // make sure the sendFlags are reset before the message is processed
      // (it may have been set by a previously cancelled send operation!)
      try {
        if (gMsgCompose.compFields.securityInfo instanceof Components.interfaces.nsIEnigMsgCompFields) {
          gMsgCompose.compFields.securityInfo.sendFlags=0;
        }
        else if (gMsgCompose.compFields.securityInfo == null) {
          throw "dummy";
        }
      }
      catch (ex){
        try {
          var newSecurityInfo = Components.classes[this.compFieldsEnig_CID].createInstance(Components.interfaces.nsIEnigMsgCompFields);
          if (newSecurityInfo) {
            newSecurityInfo.sendFlags=0;
            gMsgCompose.compFields.securityInfo = newSecurityInfo;
          }
        }
        catch (ex) {
          EnigmailCommon.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.attachKey", ex);
        }
      }
    }
    this.dirty = 1;

    var enigmailSvc = EnigmailCommon.getService(window);
    if (!enigmailSvc) {
       var msg=EnigmailCommon.getString("sendUnencrypted");
       if (EnigmailCommon.enigmailSvc && EnigmailCommon.enigmailSvc.initializationError) {
          msg = EnigmailCommon.enigmailSvc.initializationError +"\n\n"+msg;
       }

       return EnigmailCommon.confirmDlg(window, msg, EnigmailCommon.getString("msgCompose.button.send"));
    }


    try {

       this.modifiedAttach = null;

       EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: currentId="+this.identity+
                ", "+this.identity.email+"\n");
       var fromAddr = this.identity.email;

       var pgpEnabled = this.getAccDefault("enabled");

       if (! pgpEnabled) {
          if ((sendFlags & (ENCRYPT | SIGN)) || this.attachOwnKeyObj.appendAttachment) {
            if (!EnigmailCommon.confirmDlg(window, EnigmailCommon.getString("acctNotConfigured"),
                  EnigmailCommon.getString("msgCompose.button.send")))
                return false;
          }
          return true;
       }

       var optSendFlags = 0;
       var inlineEncAttach=false;

       // request or preference to always accept (even non-authenticated) keys?
       if (this.trustAllKeys) {
         optSendFlags |= nsIEnigmail.SEND_ALWAYS_TRUST;
       }
       else {
         var acceptedKeys = EnigmailCommon.getPref("acceptedKeys");
         switch (acceptedKeys) {
           case 0: // accept valid/authenticated keys only
             break;
           case 1: // accept all but revoked/disabled/expired keys
             optSendFlags |= nsIEnigmail.SEND_ALWAYS_TRUST;
             break;
           default:
             EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: INVALID VALUE for acceptedKeys: \""+acceptedKeys+"\"\n");
             break;
         }
       }

       if (EnigmailCommon.getPref("encryptToSelf") || (sendFlags & nsIEnigmail.SAVE_MESSAGE)) {
         optSendFlags |= nsIEnigmail.SEND_ENCRYPT_TO_SELF;
       }

       sendFlags |= optSendFlags;

       var userIdValue = this.getSenderUserId();
       if (userIdValue) {
         fromAddr = userIdValue;
       }

       EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg:gMsgCompose="+gMsgCompose+"\n");

       var toAddrList = [];
       var bccAddrList = [];
       if (sendFlags & nsIEnigmail.SAVE_MESSAGE) {
          if (userIdValue.search(/@/) == -1 ) {
            toAddrList.push(userIdValue);
          }
          else {
            toAddrList.push(EnigmailFuncs.stripEmail(userIdValue.replace(/[\",]/g, "")));
          }
       }
       else {
         var splitRecipients;
         var arrLen =  new Object();
         var recList;
         splitRecipients = msgCompFields.splitRecipients;

         //EnigmailCommon.alert(window, typeof(msgCompFields.cc));
         if (msgCompFields.to.length > 0) {
           recList = splitRecipients(msgCompFields.to, true, arrLen);
           this.addRecipients(toAddrList, recList);
         }

         if (msgCompFields.cc.length > 0) {
           recList = splitRecipients(msgCompFields.cc, true, arrLen);
           this.addRecipients(toAddrList, recList);
         }

         // special handling of bcc:
         // - note: bcc and encryption is a problem
         // - but bcc to the sender is fine
         if (msgCompFields.bcc.length > 0) {
           recList = splitRecipients(msgCompFields.bcc, true, arrLen);

           var bccLC = EnigmailFuncs.stripEmail(msgCompFields.bcc).toLowerCase();
           EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: BCC: "+bccLC+"\n");

           var selfBCC = this.identity.email && (this.identity.email.toLowerCase() == bccLC);

           if (selfBCC) {
             EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: Self BCC\n");
             this.addRecipients(toAddrList, recList);

           }
           else if (sendFlags & ENCRYPT) {
             // BCC and encryption

             if (encryptIfPossible) {
               sendFlags &= ~ENCRYPT;
               EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: No default encryption because of BCC\n");
             }
             else {
               var dummy={value: null};

               var hideBccUsers = promptSvc.confirmEx(window,
                          EnigmailCommon.getString("enigConfirm"),
                          EnigmailCommon.getString("sendingHiddenRcpt"),
                          (promptSvc.BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_0) +
                          (promptSvc. BUTTON_TITLE_CANCEL * promptSvc.BUTTON_POS_1) +
                          (promptSvc. BUTTON_TITLE_IS_STRING * promptSvc.BUTTON_POS_2),
                          EnigmailCommon.getString("sendWithShownBcc"),
                          null,
                          EnigmailCommon.getString("sendWithHiddenBcc"),
                          null,
                          dummy);
                switch (hideBccUsers) {
                case 2:
                  this.addRecipients(bccAddrList, recList);
                  // no break here on purpose!
                case 0:
                  this.addRecipients(toAddrList, recList);
                  break;
                case 1:
                 return false;
                }
             }
           }
         }

         if (newsgroups) {
           toAddrList.push(newsgroups);

           if (sendFlags & ENCRYPT) {

             if (!encryptIfPossible) {
               if (!EnigmailCommon.getPref("encryptToNews")) {
                 EnigmailCommon.alert(window, EnigmailCommon.getString("sendingNews"));
                 return false;
               }
               else if (!EnigmailCommon.confirmPref(window,
                            EnigmailCommon.getString("sendToNewsWarning"),
                            "warnOnSendingNewsgroups",
                            EnigmailCommon.getString("msgCompose.button.send"))) {
                 return false;
               }
             }
             else {
               sendFlags &= ~ENCRYPT;
               EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: No default encryption because of newsgroups\n");
             }
           }
         }
       }

       var usePGPMimeOption = EnigmailCommon.getPref("usePGPMimeOption");

       if (this.sendPgpMime) {
         // Use PGP/MIME
         sendFlags |= nsIEnigmail.SEND_PGP_MIME;
       }

       var result = this.keySelection(enigmailSvc,
                                      sendFlags,    // all current combined/processed send flags (incl. optSendFlags)
                                      optSendFlags, // may only be SEND_ALWAYS_TRUST or SEND_ENCRYPT_TO_SELF
                                      gotSendFlags, // initial sendMode (0 or SIGN or ENCRYPT or SIGN|ENCRYPT)
                                      fromAddr, toAddrList, bccAddrList);
       if (!result) {
         return false;
       }

       var toAddrStr;
       var bccAddrStr;
       sendFlags = result.sendFlags;
       toAddrStr = result.toAddrStr;
       bccAddrStr = result.bccAddrStr;

       var useEnigmail = this.preferPgpOverSmime(sendFlags);

       if (useEnigmail == null) return false; // dialog aborted
       if (useEnigmail == false) {
          // use S/MIME
          sendFlags = 0;
          return true;
        }

       if (sendFlags & nsIEnigmail.SAVE_MESSAGE) {
         // always enable PGP/MIME if message is saved
         sendFlags |= nsIEnigmail.SEND_PGP_MIME;
       }
       else {
         if (this.attachOwnKeyObj.appendAttachment) this.attachOwnKey();
       }

       var bucketList = document.getElementById("attachmentBucket");
       var hasAttachments = ((bucketList && bucketList.hasChildNodes()) || gMsgCompose.compFields.attachVCard);

       EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: hasAttachments = "+hasAttachments+"\n");

       if ( hasAttachments &&
          (sendFlags & (ENCRYPT | SIGN)) &&
          !(sendFlags & nsIEnigmail.SEND_PGP_MIME)) {

          inputObj = {
            pgpMimePossible: true,
            inlinePossible: true,
            restrictedScenario: false,
            reasonForCheck: ""
          };
          // init reason for dialog to be able to use the right labels
          if (sendFlags & ENCRYPT) {
            if (sendFlags & SIGN) {
              inputObj.reasonForCheck = "encryptAndSign";
            }
            else {
              inputObj.reasonForCheck = "encrypt";
            }
          }
          else {
            if (sendFlags & SIGN) {
              inputObj.reasonForCheck = "sign";
            }
          }

          // determine if attachments are all local files (currently the only
          // supported kind of attachments)
          var node = bucketList.firstChild;
          while (node) {
            if (node.attachment.url.substring(0,7) != "file://") {
               inputObj.inlinePossible = false;
            }
            node = node.nextSibling;
          }

          if (inputObj.pgpMimePossible || inputObj.inlinePossible) {
            resultObj = {
              selected: EnigmailCommon.getPref("encryptAttachments")
            };

            //skip or not
            var skipCheck=EnigmailCommon.getPref("encryptAttachmentsSkipDlg");
            if (skipCheck == 1) {
              if ((resultObj.selected == 2 && inputObj.pgpMimePossible == false) || (resultObj.selected == 1 && inputObj.inlinePossible == false)) {
                //add var to disable remember box since we're dealing with restricted scenarios...
                inputObj.restrictedScenario = true;
                resultObj.selected = -1;
                window.openDialog("chrome://enigmail/content/enigmailAttachmentsDialog.xul","", "dialog,modal,centerscreen", inputObj, resultObj);
              }
            } else {
              resultObj.selected = -1;
              window.openDialog("chrome://enigmail/content/enigmailAttachmentsDialog.xul","", "dialog,modal,centerscreen", inputObj, resultObj);
            }
            if (resultObj.selected < 0) {
              // dialog cancelled
              return false;
            }
            else if (resultObj.selected == 1) {
              // encrypt attachments
              inlineEncAttach=true;
            }
            else if (resultObj.selected == 2) {
              // send as PGP/MIME
              sendFlags |= nsIEnigmail.SEND_PGP_MIME;
            }
            else if (resultObj.selected == 3) {
              // cancel the encryption/signing for the whole message
              sendFlags &= ~ENCRYPT;
              sendFlags &= ~SIGN;
            }
          }
          else {
            if (sendFlags & ENCRYPT) {
              if (!EnigmailCommon.confirmDlg(window,
                    EnigmailCommon.getString("attachWarning"),
                    EnigmailCommon.getString("msgCompose.button.send")))
                return false;
            }
          }
       }

       var usingPGPMime = (sendFlags & nsIEnigmail.SEND_PGP_MIME) &&
                          (sendFlags & (ENCRYPT | SIGN));

       var uiFlags = nsIEnigmail.UI_INTERACTIVE;

       if (usingPGPMime)
         uiFlags |= nsIEnigmail.UI_PGP_MIME;

       if ((sendFlags & (ENCRYPT | SIGN)) && usingPGPMime) {
         // Use EnigMime
         EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: Using EnigMime, flags="+sendFlags+"\n");

         var oldSecurityInfo = gMsgCompose.compFields.securityInfo;

         EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: oldSecurityInfo = "+oldSecurityInfo+"\n");

         if (!oldSecurityInfo) {
           try {
             newSecurityInfo = oldSecurityInfo.QueryInterface(Components.interfaces.nsIEnigMsgCompFields);
           } catch (ex) {}
         }

         if (!newSecurityInfo) {
           newSecurityInfo = Components.classes[this.compFieldsEnig_CID].createInstance(Components.interfaces.nsIEnigMsgCompFields);

           if (!newSecurityInfo)
             throw Components.results.NS_ERROR_FAILURE;

           newSecurityInfo.init(oldSecurityInfo);
           gMsgCompose.compFields.securityInfo = newSecurityInfo;
         }

         if ((sendFlags & nsIEnigmail.SAVE_MESSAGE) && (sendFlags & SIGN)) {
            this.setDraftStatus();
            sendFlags &= ~SIGN;
         }

         newSecurityInfo.sendFlags = sendFlags;
         newSecurityInfo.UIFlags = uiFlags;
         newSecurityInfo.senderEmailAddr = fromAddr;
         newSecurityInfo.recipients = toAddrStr;
         newSecurityInfo.bccRecipients = bccAddrStr;

         EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: securityInfo = "+newSecurityInfo+"\n");

       }
       else if (!this.processed && (sendFlags & (ENCRYPT | SIGN))) {
         // use inline PGP

         var sendInfo = {
           sendFlags: sendFlags,
           inlineEncAttach: inlineEncAttach,
           fromAddr: fromAddr,
           toAddr: toAddrStr,
           bccAddr: bccAddrStr,
           uiFlags: uiFlags,
           bucketList: bucketList
         };

         if (! this.encryptInline(sendInfo)) {
           return false;
         }
       }

       var ioService = EnigmailCommon.getIoService();
       // EnigSend: Handle both plain and encrypted messages below
       var isOffline = (ioService && ioService.offline);
       window.enigmailSendFlags=sendFlags;

       // update the list of attachments
       Attachments2CompFields(msgCompFields);

       var confirm = false;
       var conf = EnigmailCommon.getPref("confirmBeforeSending");
       switch (conf) {
         case 0:  // never
           confirm = false;
           break;
         case 1:  // always
           confirm = true;
           break;
         case 2:  // if send encrypted
           confirm = ((sendFlags&ENCRYPT) == ENCRYPT);
           break;
         case 3:  // if send unencrypted
           confirm = ((sendFlags&ENCRYPT) == 0);
           break;
         case 4:  // if encryption changed due to rules
           confirm = ((sendFlags&ENCRYPT) != (this.sendMode&ENCRYPT));
           break;
       }
       if ((!(sendFlags & nsIEnigmail.SAVE_MESSAGE)) && confirm) {
         if (!this.confirmBeforeSend(toAddrList.join(", "), toAddrStr+", "+bccAddrStr, sendFlags, isOffline)) {
           if (this.processed) {
             this.undoEncryption(0);
           }
           else {
             this.removeAttachedKey();
           }
           return false;
         }
       }
       else if ( (sendFlags & nsIEnigmail.SEND_WITH_CHECK) &&
                   !this.messageSendCheck() ) {
         // Abort send
         if (this.processed) {
            this.undoEncryption(0);
         }
         else {
            this.removeAttachedKey();
         }

         return false;
       }

       if (msgCompFields.characterSet != "ISO-2022-JP") {
         if ((usingPGPMime &&
             ((sendFlags & (ENCRYPT | SIGN)))) || ((! usingPGPMime) && (sendFlags & ENCRYPT))) {
           try {
              // make sure plaintext is not changed to 7bit
              if (typeof(msgCompFields.forceMsgEncoding) == "boolean") {
                msgCompFields.forceMsgEncoding = true;
                EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: enabled forceMsgEncoding\n");
              }
           }
           catch (ex) {}
        }
      }
    } catch (ex) {
       EnigmailCommon.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg", ex);
       msg=EnigmailCommon.getString("signFailed");
       if (EnigmailCommon.enigmailSvc && EnigmailCommon.enigmailSvc.initializationError) {
          msg += "\n"+EnigmailCommon.enigmailSvc.initializationError;
       }
       return EnigmailCommon.confirmDlg(window, msg, EnigmailCommon.getString("msgCompose.button.sendUnencrypted"));
    }

    return true;
  },

  encryptInline: function (sendInfo)
  {
    // sign/encrpyt message using inline-PGP

    const dce = Components.interfaces.nsIDocumentEncoder;
    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var enigmailSvc = EnigmailCommon.getService(window);
    if (! enigmailSvc) return false;

    if (gMsgCompose.composeHTML) {
      var errMsg = EnigmailCommon.getString("hasHTML");
      EnigmailCommon.alertCount(window, "composeHtmlAlertCount", errMsg);
    }

    try {
      var convert = DetermineConvertibility();
      if (convert == nsIMsgCompConvertible.No) {
        if (!EnigmailCommon.confirmDlg(window, EnigmailCommon.getString("strippingHTML"),
              EnigmailCommon.getString("msgCompose.button.sendAnyway"))) {
          return false;
        }
      }
    } catch (ex) {
       EnigmailCommon.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptInline", ex);
    }

    try {
      if (this.getMailPref("mail.strictly_mime")) {
        if (EnigmailCommon.confirmPref(window,
              EnigmailCommon.getString("quotedPrintableWarn"), "quotedPrintableWarn")) {
          EnigmailCommon.prefRoot.setBoolPref("mail.strictly_mime", false);
        }
      }
    } catch (ex) {}


    var sendFlowed;
    try {
      sendFlowed = this.getMailPref("mailnews.send_plaintext_flowed");
    } catch (ex) {
      sendFlowed = true;
    }
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    var wrapper = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
    var editor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIPlaintextEditor);
    var wrapWidth=72;

    if (! (sendInfo.sendFlags & ENCRYPT)) {
      // signed messages only
      if (gMsgCompose.composeHTML) {
        // enforce line wrapping here
        // otherwise the message isn't signed correctly
        try {
          wrapWidth = this.getMailPref("editor.htmlWrapColumn");

          if (wrapWidth > 0 && wrapWidth < 68 && gMsgCompose.wrapLength > 0) {
            if (EnigmailCommon.confirmDlg(window, EnigmailCommon.getString("minimalLineWrapping", [ wrapWidth ] ))) {
              EnigmailCommon.prefRoot.setIntPref("editor.htmlWrapColumn", 68);
            }
          }
          if (EnigmailCommon.getPref("wrapHtmlBeforeSend")) {
            if (wrapWidth) {
              editor.wrapWidth = wrapWidth-2; // prepare for the worst case: a 72 char's long line starting with '-'
              wrapper.rewrap(false);
            }
          }
        }
        catch (ex) {}
      }
      else {
        try {
          wrapWidth = this.getMailPref("mailnews.wraplength");
          if (wrapWidth > 0 && wrapWidth < 68 && editor.wrapWidth > 0) {
            if (EnigmailCommon.confirmDlg(window, EnigmailCommon.getString("minimalLineWrapping", [ wrapWidth ] ))) {
              wrapWidth = 68;
              EnigmailCommon.prefRoot.setIntPref("mailnews.wraplength", wrapWidth);
            }
          }

          if (wrapWidth && editor.wrapWidth > 0) {
            editor.wrapWidth = wrapWidth - 2;
            wrapper.rewrap(true);
            editor.wrapWidth = wrapWidth;
          }
        }
        catch (ex) {}
      }
    }

    var exitCodeObj    = new Object();
    var statusFlagsObj = new Object();
    var errorMsgObj    = new Object();

    // Get plain text
    // (Do we need to set the nsIDocumentEncoder.* flags?)
    var origText = this.editorGetContentAs("text/plain",
                                           encoderFlags);
    if (! origText) origText = "";

    if (origText.length > 0) {
      // Sign/encrypt body text

      var escText = origText; // Copy plain text for possible escaping

      if (sendFlowed && !(sendInfo.sendFlags & ENCRYPT)) {
        // Prevent space stuffing a la RFC 2646 (format=flowed).

        //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: escText["+encoderFlags+"] = '"+escText+"'\n");

        // MULTILINE MATCHING ON
        RegExp.multiline = true;

        escText = escText.replace(/^From /g, "~From ");
        escText = escText.replace(/^>/g, "|");
        escText = escText.replace(/^[ \t]+$/g, "");
        escText = escText.replace(/^ /g, "~ ");

        // MULTILINE MATCHING OFF
        RegExp.multiline = false;

        //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: escText = '"+escText+"'\n");
        // Replace plain text and get it again
        this.replaceEditorText(escText);

        escText = this.editorGetContentAs("text/plain", encoderFlags);
      }

      // Replace plain text and get it again (to avoid linewrapping problems)
      this.replaceEditorText(escText);

      escText = this.editorGetContentAs("text/plain", encoderFlags);

      //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: escText["+encoderFlags+"] = '"+escText+"'\n");

      // Encrypt plaintext
      var charset = this.editorGetCharset();
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptMsg: charset="+charset+"\n");

      // Encode plaintext to charset from unicode
      var plainText = (sendInfo.sendFlags & ENCRYPT)
                     ? EnigmailCommon.convertFromUnicode(origText, charset)
                     : EnigmailCommon.convertFromUnicode(escText, charset);

      var cipherText = enigmailSvc.encryptMessage(window, sendInfo.uiFlags, plainText,
                                                  sendInfo.fromAddr, sendInfo.toAddr, sendInfo.bccAddr,
                                                  sendInfo.sendFlags,
                                                  exitCodeObj, statusFlagsObj,
                                                  errorMsgObj);

      var exitCode = exitCodeObj.value;

      //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: cipherText = '"+cipherText+"'\n");
      if (cipherText && (exitCode == 0)) {
        // Encryption/signing succeeded; overwrite plaintext

        if (gMsgCompose.composeHTML) {
          // workaround for Thunderbird bug (TB adds an extra space in front of the text)
          cipherText = "\n"+cipherText;
        }
        else
          cipherText = cipherText.replace(/\r\n/g, "\n");

        if ( (sendInfo.sendFlags & ENCRYPT) && charset &&
          (charset.search(/^us-ascii$/i) != 0) ) {
          // Add Charset armor header for encrypted blocks
          cipherText = cipherText.replace(/(-----BEGIN PGP MESSAGE----- *)(\r?\n)/, "$1$2Charset: "+charset+"$2");
        }

        // Decode ciphertext from charset to unicode and overwrite
        this.replaceEditorText( EnigmailCommon.convertToUnicode(cipherText, charset) );

        // Save original text (for undo)
        this.processed = {"origText":origText, "charset":charset};

      }
      else {
        // Restore original text
        this.replaceEditorText(origText);

        if (sendInfo.sendFlags & (ENCRYPT | SIGN)) {
          // Encryption/signing failed

           if (errorMsgObj.value) {
             // check if own key is invalid
             let s = new RegExp("^\\[GNUPG:\\] INV_(RECP|SGNR) [0-9]+ \\<?" + sendInfo.fromAddr + "\\>?", "m");
             if (errorMsgObj.value.search(s) >= 0)  {
               EnigmailCommon.alert(window, EnigmailCommon.getString("errorKeyUnusable", [ sendInfo.fromAddr ]));
               return false;
             }
           }

          EnigmailCommon.alert(window, EnigmailCommon.getString("sendAborted")+errorMsgObj.value);
          return false;
        }
      }
    }

    if (sendInfo.inlineEncAttach) {
      // encrypt attachments
      this.modifiedAttach = new Array();
      exitCode = this.encryptAttachments(sendInfo.bucketList, this.modifiedAttach,
                              window, sendInfo.uiFlags, sendInfo.fromAddr, sendInfo.toAddr, sendInfo.bccAddr,
                              sendInfo.sendFlags, errorMsgObj);
      if (exitCode != 0) {
        this.modifiedAttach = null;
        if (errorMsgObj.value) {
          EnigmailCommon.alert(window, EnigmailCommon.getString("sendAborted")+errorMsgObj.value);
        }
        else {
          EnigmailCommon.alert(window, EnigmailCommon.getString("sendAborted")+"an internal error has occurred");
        }
        if (this.processed) {
          this.undoEncryption(0);
        }
        else {
          this.removeAttachedKey();
        }
        return false;
      }
    }
    return true;
  },

  getMailPref: function (prefName)
  {

     var prefValue = null;
     try {
        var prefType = EnigmailCommon.prefRoot.getPrefType(prefName);
        // Get pref value
        switch (prefType) {
        case EnigmailCommon.prefBranch.PREF_BOOL:
           prefValue = EnigmailCommon.prefRoot.getBoolPref(prefName);
           break;

        case EnigmailCommon.prefBranch.PREF_INT:
           prefValue = EnigmailCommon.prefRoot.getIntPref(prefName);
           break;

        case EnigmailCommon.prefBranch.PREF_STRING:
           prefValue = EnigmailCommon.prefRoot.getCharPref(prefName);
           break;

        default:
           prefValue = undefined;
           break;
       }

     } catch (ex) {
        // Failed to get pref value
        EnigmailCommon.ERROR_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.getMailPref: unknown prefName:"+prefName+" \n");
     }

     return prefValue;
  },

  messageSendCheck: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.messageSendCheck\n");

    try {
      var warn = this.getMailPref("mail.warn_on_send_accel_key");

      if (warn) {
          var checkValue = {value:false};
          var bundle = document.getElementById("bundle_composeMsgs");
          var buttonPressed = EnigmailCommon.getPromptSvc().confirmEx(window,
                bundle.getString('sendMessageCheckWindowTitle'),
                bundle.getString('sendMessageCheckLabel'),
                (EnigmailCommon.getPromptSvc().BUTTON_TITLE_IS_STRING * EnigmailCommon.getPromptSvc().BUTTON_POS_0) +
                (EnigmailCommon.getPromptSvc().BUTTON_TITLE_CANCEL * EnigmailCommon.getPromptSvc().BUTTON_POS_1),
                bundle.getString('sendMessageCheckSendButtonLabel'),
                null, null,
                bundle.getString('CheckMsg'),
                checkValue);
          if (buttonPressed != 0) {
              return false;
          }
          if (checkValue.value) {
            EnigmailCommon.prefRoot.setBoolPref("mail.warn_on_send_accel_key", false);
          }
      }
    } catch (ex) {}

    return true;
  },

  modifyCompFields: function (msgCompFields)
  {

    const HEADERMODE_KEYID = 0x01;
    const HEADERMODE_URL   = 0x10;

    try {
      if (this.identity.getBoolAttribute("enablePgp")) {
        var enigmailHeaders = "";
        if (EnigmailCommon.getPref("addHeaders")) {
          enigmailHeaders += "X-Enigmail-Version: "+EnigmailCommon.getVersion()+"\r\n";
        }
        var pgpHeader="";
        var openPgpHeaderMode = this.identity.getIntAttribute("openPgpHeaderMode");

        if (openPgpHeaderMode > 0) pgpHeader = "OpenPGP: ";

        if (openPgpHeaderMode & HEADERMODE_KEYID) {
            var keyId = this.identity.getCharAttribute("pgpkeyId");
            if (keyId.substr(0,2).toLowerCase() == "0x") {
              pgpHeader += "id="+keyId.substr(2);
            }
        }
        if (openPgpHeaderMode & HEADERMODE_URL) {
          if (pgpHeader.indexOf("=") > 0) pgpHeader += ";\r\n\t";
          pgpHeader += "url="+this.identity.getCharAttribute("openPgpUrlName");
        }
        if (pgpHeader.length > 0) {
          enigmailHeaders += pgpHeader + "\r\n";
        }
        msgCompFields.otherRandomHeaders += enigmailHeaders;
      }
    }
    catch (ex) {
      EnigmailCommon.writeException("enigmailMsgComposeOverlay.js: Enigmail.msg.modifyCompFields", ex);
    }

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.modifyCompFields: otherRandomHeaders = "+
             msgCompFields.otherRandomHeaders+"\n");
  },

  sendMessageListener: function (event)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener\n");
    let msgcomposeWindow = document.getElementById("msgcomposeWindow");
    let sendMsgType = Number(msgcomposeWindow.getAttribute("msgtype"));

    if (! (this.sendProcess && sendMsgType == Components.interfaces.nsIMsgCompDeliverMode.AutoSaveAsDraft)) {
      this.sendProcess = true;

      try {
        this.modifyCompFields(gMsgCompose.compFields);
        if (! this.encryptMsg(sendMsgType)) {
          this.removeAttachedKey();
          event.preventDefault();
          event.stopPropagation();
        }
      }
      catch (ex) {}
    }
    else {
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.sendMessageListener: sending in progress - autosave aborted\n");
      event.preventDefault();
      event.stopPropagation();
    }
    this.sendProcess = false;
  },

  // Replacement for wrong charset conversion detection of Thunderbird

  checkCharsetConversion: function (msgCompFields)
  {

    const dce = Components.interfaces.nsIDocumentEncoder;
    try {
      var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;
      var docText = this.editorGetContentAs("text/plain", encoderFlags);

      if (docText.length > 0) {
        var converter = Components.classes["@mozilla.org/intl/saveascharset;1"].
          createInstance(Components.interfaces.nsISaveAsCharset);

        converter.Init(msgCompFields.characterSet, 0, 1);

        return (converter.Convert(docText).length >= docText.length);
      }
    }
    catch (ex) {}

    return true;
  },



  // encrypt attachments when sending inline PGP mails
  // It's quite a hack: the attachments are stored locally
  // and the attachments list is modified to pick up the
  // encrypted file(s) instead of the original ones.
  encryptAttachments: function (bucketList, newAttachments, window, uiFlags,
                                  fromAddr, toAddr, bccAddr, sendFlags,
                                  errorMsgObj)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptAttachments\n");

    const nsIEnigmail = Components.interfaces.nsIEnigmail;
    const SIGN    = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    var ioServ;
    var fileTemplate;
    errorMsgObj.value="";

    try {
      ioServ = Components.classes[EnigmailCommon.IOSERVICE_CONTRACTID].getService(Components.interfaces.nsIIOService);
      if (!ioServ)
          return -1;

    } catch (ex) {
      return -1;
    }

    var tmpDir=EnigmailCommon.getTempDir();
    var extAppLauncher = Components.classes["@mozilla.org/mime;1"].
      getService(Components.interfaces.nsPIExternalAppLauncher);

    try {
      fileTemplate = Components.classes[EnigmailCommon.LOCAL_FILE_CONTRACTID].createInstance(EnigmailCommon.getLocalFileApi());
      fileTemplate.initWithPath(tmpDir);
      if (!(fileTemplate.isDirectory() && fileTemplate.isWritable())) {
        errorMsgObj.value=EnigmailCommon.getString("noTempDir");
        return -1;
      }
      fileTemplate.append("encfile");
    }
    catch (ex) {
      errorMsgObj.value=EnigmailCommon.getString("noTempDir");
      return -1;
    }
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.encryptAttachments tmpDir=" + tmpDir+"\n");
    var enigmailSvc = EnigmailCommon.getService(window);
    if (!enigmailSvc)
      return null;

    var exitCodeObj = new Object();
    var statusFlagsObj = new Object();

    var node = bucketList.firstChild;
    while (node) {
      var origUrl = node.attachment.url;
      if (origUrl.substring(0,7) != "file://") {
        // this should actually never happen since it is pre-checked!
        errorMsgObj.value="The attachment '"+node.attachment.name+"' is not a local file";
        return -1;
      }

      // transform attachment URL to platform-specific file name
      var origUri = ioServ.newURI(origUrl, null, null);
      var origFile=origUri.QueryInterface(Components.interfaces.nsIFileURL);
      if (node.attachment.temporary) {
        try {
          var origLocalFile=Components.classes[EnigmailCommon.LOCAL_FILE_CONTRACTID].createInstance(EnigmailCommon.getLocalFileApi());
          origLocalFile.initWithPath(origFile.file.path);
          extAppLauncher.deleteTemporaryFileOnExit(origLocalFile);
        }
        catch (ex) {}
      }

      var newFile = fileTemplate.clone();
      var txtMessage;
      try {
        newFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);
        txtMessage = enigmailSvc.encryptAttachment(window, fromAddr, toAddr, bccAddr, sendFlags,
                                  origFile.file, newFile,
                                  exitCodeObj, statusFlagsObj,
                                  errorMsgObj);
      } catch (ex) {}

      if (exitCodeObj.value != 0) {
        return exitCodeObj.value;
      }

      var fileInfo = {
        origFile  : origFile,
        origUrl   : node.attachment.url,
        origName  : node.attachment.name,
        origTemp  : node.attachment.temporary,
        origCType : node.attachment.contentType
      };

      // transform platform specific new file name to file:// URL
      var newUri = ioServ.newFileURI(newFile);
      fileInfo.newUrl  = newUri.asciiSpec;
      fileInfo.newFile = newFile;
      fileInfo.encrypted = (sendFlags & ENCRYPT);

      newAttachments.push(fileInfo);
      node = node.nextSibling;
    }

    var i=0;
    if (sendFlags & ENCRYPT) {
      // if we got here, all attachments were encrpted successfully,
      // so we replace their names & urls
      node = bucketList.firstChild;

      while (node) {
        node.attachment.url = newAttachments[i].newUrl;
        node.attachment.name += EnigmailCommon.getPref("inlineAttachExt");
        node.attachment.contentType="application/octet-stream";
        node.attachment.temporary=true;

        ++i; node = node.nextSibling;
      }
    }
    else {
      // for inline signing we need to add new attachments for every
      // signed file
      for (i=0; i<newAttachments.length; i++) {
        // create new attachment
        var fileAttachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Components.interfaces.nsIMsgAttachment);
        fileAttachment.temporary = true;
        fileAttachment.url = newAttachments[i].newUrl;
        fileAttachment.name = newAttachments[i].origName + EnigmailCommon.getPref("inlineSigAttachExt");

        // add attachment to msg
        this.addAttachment(fileAttachment);
      }

    }
    return 0;
  },

  toggleAttribute: function (attrName)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAttribute('"+attrName+"')\n");

    var menuElement = document.getElementById("enigmail_"+attrName);

    var oldValue = EnigmailCommon.getPref(attrName);
    EnigmailCommon.setPref(attrName, !oldValue);
  },

  toggleAccountAttr: function (attrName)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleAccountAttr('"+attrName+"')\n");

    var oldValue = this.identity.getBoolAttribute(attrName);
    this.identity.setBoolAttribute(attrName, !oldValue);

  },

  toggleRules: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.toggleRules: Enigmail.msg.enableRules="+Enigmail.msg.enableRules+"\n");
    this.enableRules = !this.enableRules;
  },

  decryptQuote: function (interactive)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: "+interactive+"\n");
    const nsIEnigmail = Components.interfaces.nsIEnigmail;

    if (gWindowLocked || this.processed)
      return;

    var enigmailSvc = EnigmailCommon.getService(window);
    if (!enigmailSvc)
      return;

    const dce = Components.interfaces.nsIDocumentEncoder;
    var encoderFlags = dce.OutputFormatted | dce.OutputLFLineBreak;

    var docText = this.editorGetContentAs("text/plain", encoderFlags);

    var blockBegin = docText.indexOf("-----BEGIN PGP ");
    if (blockBegin < 0)
      return;

    // Determine indentation string
    var indentBegin = docText.substr(0, blockBegin).lastIndexOf("\n");
    var indentStr = docText.substring(indentBegin+1, blockBegin);

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: indentStr='"+indentStr+"'\n");

    var beginIndexObj = new Object();
    var endIndexObj = new Object();
    var indentStrObj = new Object();
    var blockType = enigmailSvc.locateArmoredBlock(docText, 0, indentStr,
                                            beginIndexObj, endIndexObj,
                                            indentStrObj);

    if ((blockType != "MESSAGE") && (blockType != "SIGNED MESSAGE"))
      return;

    var beginIndex = beginIndexObj.value;
    var endIndex   = endIndexObj.value;

    var head = docText.substr(0, beginIndex);
    var tail = docText.substr(endIndex+1);

    var pgpBlock = docText.substr(beginIndex, endIndex-beginIndex+1);
    var indentRegexp;

    if (indentStr) {
      // MULTILINE MATCHING ON
      RegExp.multiline = true;

      if (indentStr == "> ") {
        // replace ">> " with "> > " to allow correct quoting
        pgpBlock = pgpBlock.replace(/^>>/g, "> >");
      }

      // Delete indentation
      indentRegexp = new RegExp("^"+indentStr, "g");

      pgpBlock = pgpBlock.replace(indentRegexp, "");
      //tail     =     tail.replace(indentRegexp, "");

      if (indentStr.match(/[ \t]*$/)) {
        indentStr = indentStr.replace(/[ \t]*$/g, "");
        indentRegexp = new RegExp("^"+indentStr+"$", "g");

        pgpBlock = pgpBlock.replace(indentRegexp, "");
      }


      // Handle blank indented lines
      pgpBlock = pgpBlock.replace(/^[ \t]*>[ \t]*$/g, "");
      //tail     =     tail.replace(/^[ \t]*>[ \t]*$/g, "");

      // Trim leading space in tail
      tail = tail.replace(/^\s*\n/, "\n");

      // MULTILINE MATCHING OFF
      RegExp.multiline = false;
    }

    if (tail.search(/\S/) < 0) {
      // No non-space characters in tail; delete it
      tail = "";
    }

    //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: pgpBlock='"+pgpBlock+"'\n");

    var charset = this.editorGetCharset();
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: charset="+charset+"\n");

    // Encode ciphertext from unicode to charset
    var cipherText = EnigmailCommon.convertFromUnicode(pgpBlock, charset);

    if ((! this.getMailPref("mailnews.reply_in_default_charset")) && (blockType == "MESSAGE")) {
      // set charset according to PGP block, if available (encrypted messages only)
      cipherText = cipherText.replace(/\r\n/g, "\n");
      cipherText = cipherText.replace(/\r/g,   "\n");
      var cPos = cipherText.search(/\nCharset: .+\n/i);
      if (cPos < cipherText.search(/\n\n/)) {
        var charMatch = cipherText.match(/\n(Charset: )(.+)\n/i);
        if (charMatch && charMatch.length > 2) {
          charset = charMatch[2];
          gMsgCompose.SetDocumentCharset(charset);
        }
      }
    }

    // Decrypt message
    var signatureObj   = new Object();
    signatureObj.value = "";
    var exitCodeObj    = new Object();
    var statusFlagsObj = new Object();
    var userIdObj      = new Object();
    var keyIdObj       = new Object();
    var sigDateObj     = new Object();
    var errorMsgObj    = new Object();
    var blockSeparationObj  = new Object();

    var uiFlags = nsIEnigmail.UI_UNVERIFIED_ENC_OK;

    var plainText = enigmailSvc.decryptMessage(window, uiFlags, cipherText,
                                   signatureObj, exitCodeObj, statusFlagsObj,
                                   keyIdObj, userIdObj, sigDateObj,
                                   errorMsgObj, blockSeparationObj);

    // Decode plaintext from charset to unicode
    plainText = EnigmailCommon.convertToUnicode(plainText, charset);
    if (EnigmailCommon.getPref("keepSettingsForReply")) {
      if (statusFlagsObj.value & nsIEnigmail.DECRYPTION_OKAY)
        this.setSendMode('encrypt');
    }

    var exitCode = exitCodeObj.value;

    if (exitCode != 0) {
      // Error processing
      var errorMsg = errorMsgObj.value;

      var statusLines = errorMsg.split(/\r?\n/);

      var displayMsg;
      if (statusLines && statusLines.length) {
        // Display only first ten lines of error message
        while (statusLines.length > 10)
          statusLines.pop();

        displayMsg = statusLines.join("\n");

        if (interactive)
          EnigmailCommon.alert(window, displayMsg);
      }
    }

    if (blockType == "MESSAGE" && exitCode == 0 && plainText.length==0) {
      plainText = " ";
    }

    if (!plainText) {
      if (blockType != "SIGNED MESSAGE")
        return;

      // Extract text portion of clearsign block
      plainText = enigmailSvc.extractSignaturePart(pgpBlock,
                                                    nsIEnigmail.SIGNATURE_TEXT);
    }

    var doubleDashSeparator = EnigmailCommon.getPref("doubleDashSeparator");
    if (gMsgCompose.type != nsIMsgCompType.Template &&
        gMsgCompose.type != nsIMsgCompType.Draft &&
        doubleDashSeparator) {
      var signOffset = plainText.search(/[\r\n]-- +[\r\n]/);

      if (signOffset < 0 && blockType == "SIGNED MESSAGE") {
        signOffset = plainText.search(/[\r\n]--[\r\n]/);
      }

      if (signOffset > 0) {
        // Strip signature portion of quoted message
        plainText = plainText.substr(0, signOffset+1);
      }
    }

    var clipBoard = Components.classes["@mozilla.org/widget/clipboard;1"].
                      getService(Components.interfaces.nsIClipboard);
    if (clipBoard.supportsSelectionClipboard()) {
      // get the clipboard contents for selected text (X11)
      try {
        var transferable = Components.classes["@mozilla.org/widget/transferable;1"].
                  createInstance(Components.interfaces.nsITransferable);
        transferable.addDataFlavor("text/unicode");
        clipBoard.getData(transferable, clipBoard.kSelectionClipboard);
        var flavour = {};
        var data = {};
        var length = {};
        transferable.getAnyTransferData(flavour, data, length);
      }
      catch(ex) {}
    }

    // Replace encrypted quote with decrypted quote (destroys selection clipboard on X11)
    this.editorSelectAll();

    //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: plainText='"+plainText+"'\n");

    if (head)
      this.editorInsertText(head);

    var quoteElement;

    if (indentStr) {
      quoteElement = this.editorInsertAsQuotation(plainText);

    } else {
      this.editorInsertText(plainText);
    }

    if (tail)
      this.editorInsertText(tail);

    if (clipBoard.supportsSelectionClipboard()) {
      try {
        // restore the clipboard contents for selected text (X11)
        var pasteClipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"].
                getService(Components.interfaces.nsIClipboardHelper);
        data = data.value.QueryInterface(Components.interfaces.nsISupportsString).data;
        pasteClipboard.copyStringToClipboard(data, clipBoard.kSelectionClipboard);
      }
      catch (ex) {}
    }

    if (interactive)
      return;

    // Position cursor
    var replyOnTop = 1;
    try {
      replyOnTop = this.identity.replyOnTop;
    } catch (ex) {}

    if (!indentStr || !quoteElement) replyOnTop = 1;

    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.decryptQuote: replyOnTop="+replyOnTop+", quoteElement="+quoteElement+"\n");

    var nsISelectionController = Components.interfaces.nsISelectionController;

    if (this.editor.selectionController) {
      var selection = this.editor.selectionController;
      selection.completeMove(false, false); // go to start;

      switch (replyOnTop) {
      case 0:
        // Position after quote
        this.editor.endOfDocument();
        if (tail) {
          for (cPos = 0; cPos < tail.length; cPos++) {
            selection.characterMove(false, false); // move backwards
          }
        }
        break;

      case 2:
        // Select quote

        if (head) {
          for (cPos = 0; cPos < head.length; cPos++) {
            selection.characterMove(true, false);
          }
        }
        selection.completeMove(true, true);
        if (tail) {
          for (cPos = 0; cPos < tail.length; cPos++) {
            selection.characterMove(false, true); // move backwards
          }
        }
        break;

      default:
        // Position at beginning of document

        if (this.editor) {
          this.editor.beginningOfDocument();
        }
      }

      this.editor.selectionController.scrollSelectionIntoView(nsISelectionController.SELECTION_NORMAL,
                                     nsISelectionController.SELECTION_ANCHOR_REGION,
                                     true);
    }

  },

  editorInsertText: function (plainText)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText\n");
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
        mailEditor.insertTextWithQuotations(plainText);
      } catch (ex) {
        EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertText: no mail editor\n");
        this.editor.insertText(plainText);
      }
    }
  },

  editorInsertAsQuotation: function (plainText)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation\n");
    if (this.editor) {
      var mailEditor;
      try {
        mailEditor = this.editor.QueryInterface(Components.interfaces.nsIEditorMailSupport);
      } catch (ex) {}

      if (!mailEditor)
        return 0;

      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorInsertAsQuotation: mailEditor="+mailEditor+"\n");

      mailEditor.insertAsQuotation(plainText);

      return 1;
    }
    return 0;
  },


  editorSelectAll: function ()
  {
    if (this.editor) {
      this.editor.selectAll();
    }
  },

  editorGetCharset: function ()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetCharset\n");
    return this.editor.documentCharacterSet;
  },

  editorGetContentAs: function (mimeType, flags) {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.editorGetContentAs\n");
    if (this.editor) {
      return this.editor.outputToString(mimeType, flags);
    }
  },

  addrOnChangeTimer: null,

  addressOnChange: function(element)
  {
     EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.addressOnChange\n");
     if (! this.addrOnChangeTimer) {
        var self = this;
        this.addrOnChangeTimer = EnigmailCommon.setTimeout(function _f() {
           self.fireSendFlags();
           self.addrOnChangeTimer = null;
        }, 200);
     }
  },

  focusChange: function ()
  {
    // call original TB function
    CommandUpdate_MsgCompose();

    var focusedWindow = top.document.commandDispatcher.focusedWindow;

    // we're just setting focus to where it was before
    if (focusedWindow == Enigmail.msg.lastFocusedWindow) {
      // skip
      return;
    }

    Enigmail.msg.lastFocusedWindow = focusedWindow;

    Enigmail.msg.fireSendFlags();
  },

  fireSendFlags: function ()
  {
    try {
      EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: Enigmail.msg.fireSendFlags\n");
      if (! this.determineSendFlagId) {
        this.determineSendFlagId = EnigmailCommon.dispatchEvent(
          function _sendFlagWrapper() {
            Enigmail.msg.determineSendFlags();
          },
          0);
      }
    }
    catch (ex) {}
  }
};


Enigmail.composeStateListener = {
  NotifyComposeFieldsReady: function() {
    // Note: NotifyComposeFieldsReady is only called when a new window is created (i.e. not in case a window object is reused).
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: ECSL.NotifyComposeFieldsReady\n");

    try {
      Enigmail.msg.editor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIEditor);
    } catch (ex) {}

    if (!Enigmail.msg.editor)
      return;

    function enigDocStateListener () {}

    enigDocStateListener.prototype = {
      QueryInterface: function (iid)
      {
        if (!iid.equals(Components.interfaces.nsIDocumentStateListener) &&
            !iid.equals(Components.interfaces.nsISupports))
           throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
      },

      NotifyDocumentCreated: function ()
      {
        // EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: EDSL.NotifyDocumentCreated\n");
      },

      NotifyDocumentWillBeDestroyed: function ()
      {
        // EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: EDSL.enigDocStateListener.NotifyDocumentWillBeDestroyed\n");
      },

      NotifyDocumentStateChanged: function (nowDirty)
      {
      }
    };

    var docStateListener = new enigDocStateListener();

    Enigmail.msg.editor.addDocumentStateListener(docStateListener);
  },

  ComposeProcessDone: function(aResult)
  {
    // Note: called after a mail was sent (or saved)
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: ECSL.ComposeProcessDone: "+aResult+"\n");

    if (aResult != Components.results.NS_OK) {
      if (Enigmail.msg.processed) {
        Enigmail.msg.undoEncryption(4);
      }
      Enigmail.msg.removeAttachedKey();
    }

  },

  NotifyComposeBodyReady: function()
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: ECSL.ComposeBodyReady\n");

    var isEmpty, isEditable;

    isEmpty    = Enigmail.msg.editor.documentIsEmpty;
    isEditable = Enigmail.msg.editor.isDocumentEditable;


    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: EDSL.NotifyDocumentStateChanged: isEmpty="+isEmpty+", isEditable="+isEditable+"\n");

    if (!isEditable || isEmpty)
      return;

    if (!Enigmail.msg.timeoutId && !Enigmail.msg.dirty) {
      Enigmail.msg.timeoutId = EnigmailCommon.setTimeout(function () {
          Enigmail.msg.decryptQuote(false);
        },
        0);
    }
  },

  SaveInFolderDone: function(folderURI)
  {
    //EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: ECSL.SaveInFolderDone\n");
  }
};


window.addEventListener("load",
  function _enigmail_composeStartup (event)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: got load event\n");

    Enigmail.msg.composeStartup(event);
  },
  false);

window.addEventListener("unload",
  function _enigmail_composeUnload (event)
  {
    Enigmail.msg.composeUnload(event);
  },
  false);

// Handle recycled windows
window.addEventListener('compose-window-close',
  function _enigmail_msgComposeClose (event)
  {
    Enigmail.msg.msgComposeClose(event);
  },
  true);

window.addEventListener('compose-window-reopen',
  function _enigmail_msgComposeReopen (event)
  {
    Enigmail.msg.msgComposeReopen(event);
  },
  true);

// Listen to message sending event
window.addEventListener('compose-send-message',
  function _enigmail_sendMessageListener (event)
  {
    Enigmail.msg.sendMessageListener(event);
  },
  true);

window.addEventListener('compose-window-init',
  function _enigmail_composeWindowInit (event)
  {
    EnigmailCommon.DEBUG_LOG("enigmailMsgComposeOverlay.js: _enigmail_composeWindowInit\n");
    gMsgCompose.RegisterStateListener(Enigmail.composeStateListener);
  },
  true);

