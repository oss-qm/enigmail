/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "MPL"); you may not use this file except in
 * compliance with the MPL. You may obtain a copy of the MPL at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the MPL
 * for the specific language governing rights and limitations under the
 * MPL.
 *
 * The Original Code is Enigmail.
 *
 * The Initial Developer of the Original Code is
 * Ramalingam Saravanan <sarava@sarava.net>
 * Portions created by the Initial Developer are Copyright (C) 2002
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Patrick Brunschwig <patrick.brunschwig@gmx.net>
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
 *
 * ***** END LICENSE BLOCK ***** */

// Logging of debug output
// The following define statement should occur before any include statements
#define FORCE_PR_LOG       /* Allow logging even in release build */

#include "enigmail.h"
#include "nspr.h"
#include "nsCOMPtr.h"
#include "nsStringAPI.h"
#include "nsNetUtil.h"
#include "nsNetCID.h"
#include "nsIPrompt.h"
#include "nsIMsgWindow.h"
#include "nsIDOMWindow.h"
#include "nsIMimeMiscStatus.h"
#include "nsIEnigMimeHeaderSink.h"
#include "nsIThread.h"
#include "nsEnigMimeVerify.h"
#include "nsIPipeTransport.h"
#include "nsIIPCBuffer.h"
#include "nsIEnigmail.h"
#include "nsIUnicharOutputStream.h"

#undef MOZILLA_INTERNAL_API
#ifdef PR_LOGGING
PRLogModuleInfo* gEnigMimeVerifyLog = NULL;
#endif

#define ERROR_LOG(args)    PR_LOG(gEnigMimeVerifyLog,PR_LOG_ERROR,args)
#define WARNING_LOG(args)  PR_LOG(gEnigMimeVerifyLog,PR_LOG_WARNING,args)
#define DEBUG_LOG(args)    PR_LOG(gEnigMimeVerifyLog,PR_LOG_DEBUG,args)

#define MAX_BUFFER_BYTES 32000
#define MAX_HEADER_BYTES 16000

static const PRUint32 kCharMax = 1024;

// nsEnigMimeVerify implementation

// nsISupports implementation
NS_IMPL_THREADSAFE_ISUPPORTS3(nsEnigMimeVerify,
                              nsIEnigMimeVerify,
                              nsIRequestObserver,
                              nsIStreamListener)

// nsEnigMimeVerify implementation
nsEnigMimeVerify::nsEnigMimeVerify()
  : mInitialized(PR_FALSE),
    mPgpMime(PR_FALSE),
    mRequestStopped(PR_FALSE),
    mLastLinebreak(PR_TRUE),

    mStartCount(0),

    mContentBoundary(""),
    mLinebreak(""),

    mURISpec(""),
    mMsgWindow(nsnull),

    mOutBuffer(nsnull),
    mPipeTrans(nsnull),

    mArmorListener(nsnull),
    mSecondPartListener(nsnull),
    mFirstPartListener(nsnull),
    mOuterMimeListener(nsnull),
    mInnerMimeListener(nsnull)
{
  nsresult rv;

  NS_INIT_ISUPPORTS();

#ifdef PR_LOGGING
  if (gEnigMimeVerifyLog == nsnull) {
    gEnigMimeVerifyLog = PR_NewLogModule("nsEnigMimeVerify");
  }
#endif

#ifdef FORCE_PR_LOG
  nsCOMPtr<nsIThread> myThread;
  rv = ENIG_GET_THREAD(myThread);
  DEBUG_LOG(("nsEnigMimeVerify:: <<<<<<<<< CTOR(%p): myThread=%p\n",
         this, myThread.get()));
#endif
}


nsEnigMimeVerify::~nsEnigMimeVerify()
{
  nsresult rv;
#ifdef FORCE_PR_LOG
  nsCOMPtr<nsIThread> myThread;
  rv = ENIG_GET_THREAD(myThread);
  DEBUG_LOG(("nsEnigMimeVerify:: >>>>>>>>> DTOR(%p): myThread=%p\n",
         this, myThread.get()));
#endif

  Finalize();
}


///////////////////////////////////////////////////////////////////////////////
// nsIEnigMimeVerify methods:
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsEnigMimeVerify::Init(nsIDOMWindow* window,
                       nsIURI* aURI,
                       nsIMsgWindow* msgWindow,
                       const nsACString& msgUriSpec,
                       PRBool pgpMime,
                       PRBool isSubPart)
{
  nsresult rv;

  DEBUG_LOG(("nsEnigMimeVerify::Init: pgpMime=%d\n", (int) pgpMime));

  if (!aURI)
    return NS_ERROR_NULL_POINTER;

  mMsgWindow = msgWindow;
  mURISpec.Assign(msgUriSpec);
  mPgpMime = pgpMime;


  nsCOMPtr<nsIIOService> ioService(do_GetService(NS_IOSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIChannel> channel;
  rv = ioService->NewChannelFromURI(aURI, getter_AddRefs(channel));
  if (NS_FAILED(rv)) return rv;

  // Listener to parse PGP block armor
  mArmorListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  const char* pgpHeader = "-----BEGIN PGP ";
  const char* pgpFooter = "-----END PGP ";

  rv = mArmorListener->Init((nsIStreamListener*) this, nsnull,
                            pgpHeader, pgpFooter,
                            0, PR_TRUE, PR_FALSE, nsnull);
  if (NS_FAILED(rv)) return rv;

  // Inner mime listener to parse second part
  mInnerMimeListener = do_CreateInstance(NS_ENIGMIMELISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  rv = mInnerMimeListener->Init(mArmorListener, nsnull,
                                MAX_HEADER_BYTES, PR_TRUE, PR_FALSE, PR_FALSE);
  if (NS_FAILED(rv)) return rv;

  // Create PipeFilterListener to extract second MIME part
  mSecondPartListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  // Create PipeFilterListener to extract first MIME part
  mFirstPartListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  rv = mFirstPartListener->Init((nsIStreamListener*) this,
                               nsnull, "", "", 0, PR_FALSE, PR_TRUE,
                               mSecondPartListener);
  if (NS_FAILED(rv)) return rv;

  // Outer mime listener to capture URI content
  mOuterMimeListener = do_CreateInstance(NS_ENIGMIMELISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  if (isSubPart)
    mOuterMimeListener->SetSubPartTreatment(PR_TRUE);

  rv = mOuterMimeListener->Init(mFirstPartListener, nsnull,
                                MAX_HEADER_BYTES, PR_TRUE, PR_FALSE, PR_FALSE);

  if (NS_FAILED(rv)) return rv;

  // Initiate asynchronous loading of URI
  rv = channel->AsyncOpen( mOuterMimeListener, nsnull );
  if (NS_FAILED(rv))
    return rv;

  mInitialized = PR_TRUE;

  return NS_OK;
}

NS_IMETHODIMP
nsEnigMimeVerify::InitWithChannel(nsIDOMWindow* window,
                       nsIChannel* aChannel,
                       nsIMsgWindow* msgWindow,
                       const nsACString& msgUriSpec,
                       PRBool pgpMime,
                       PRBool isSubPart)
{
  nsresult rv;

  DEBUG_LOG(("nsEnigMimeVerify::Init: pgpMime=%d\n", (int) pgpMime));

  mMsgWindow = msgWindow;
  mURISpec = msgUriSpec;
  mPgpMime = pgpMime;

  nsCOMPtr<nsIIOService> ioService(do_GetService(NS_IOSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  // Listener to parse PGP block armor
  mArmorListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  const char* pgpHeader = "-----BEGIN PGP ";
  const char* pgpFooter = "-----END PGP ";

  rv = mArmorListener->Init((nsIStreamListener*) this, nsnull,
                            pgpHeader, pgpFooter,
                            0, PR_TRUE, PR_FALSE, nsnull);
  if (NS_FAILED(rv)) return rv;

  // Inner mime listener to parse second part
  mInnerMimeListener = do_CreateInstance(NS_ENIGMIMELISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  rv = mInnerMimeListener->Init(mArmorListener, nsnull,
                                MAX_HEADER_BYTES, PR_TRUE, PR_FALSE, PR_FALSE);
  if (NS_FAILED(rv)) return rv;

  // Create PipeFilterListener to extract second MIME part
  mSecondPartListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  // Create PipeFilterListener to extract first MIME part
  mFirstPartListener = do_CreateInstance(NS_PIPEFILTERLISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  rv = mFirstPartListener->Init((nsIStreamListener*) this,
                               nsnull, "", "", 0, PR_FALSE, PR_TRUE,
                               mSecondPartListener);
  if (NS_FAILED(rv)) return rv;

  // Outer mime listener to capture URI content
  mOuterMimeListener = do_CreateInstance(NS_ENIGMIMELISTENER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  if (isSubPart)
    mOuterMimeListener->SetSubPartTreatment(PR_TRUE);

  rv = mOuterMimeListener->Init(mFirstPartListener, nsnull,
                                MAX_HEADER_BYTES, PR_TRUE, PR_FALSE, PR_FALSE);

  if (NS_FAILED(rv)) return rv;

  // Initiate asynchronous loading of URI
  rv = aChannel->AsyncOpen( mOuterMimeListener, nsnull );
  if (NS_FAILED(rv))
    return rv;

  mInitialized = PR_TRUE;

  return NS_OK;
}

nsresult
nsEnigMimeVerify::Finalize()
{
  DEBUG_LOG(("nsEnigMimeVerify::Finalize:\n"));

  if (mPipeTrans) {
    mPipeTrans->Terminate();
    mPipeTrans = nsnull;
  }

  if (mOutBuffer) {
    mOutBuffer->Shutdown();
    mOutBuffer = nsnull;
  }

  mMsgWindow = nsnull;

  mArmorListener = nsnull;
  mFirstPartListener = nsnull;
  mSecondPartListener = nsnull;
  mOuterMimeListener = nsnull;
  mInnerMimeListener = nsnull;

  return NS_OK;
}

NS_IMETHODIMP
nsEnigMimeVerify::Finish()
{
  // Enigmail stuff
  nsresult rv;

  if (!mInitialized || !mPipeTrans)
    return NS_ERROR_NOT_INITIALIZED;

  if (!mRequestStopped)
    return NS_ERROR_FAILURE;

  // Wait for STDOUT to close
  rv = mPipeTrans->Join();
  if (NS_FAILED(rv)) return rv;

  // Count of STDOUT bytes
  PRUint32 outputLen;
  rv = mOutBuffer->GetTotalBytes(&outputLen);
  if (NS_FAILED(rv)) return rv;

  // Shutdown STDOUT console
  mOutBuffer->Shutdown();

  // Check input data consistency
  if (mStartCount < 2) {
    ERROR_LOG(("nsEnigMimeVerify::Finish: ERROR mStartCount=%d\n", mStartCount));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString armorTail;
  rv = mArmorListener->GetEndLine(armorTail);
  if (NS_FAILED(rv)) return rv;

  if (armorTail.IsEmpty()) {
    ERROR_LOG(("nsEnigMimeVerify::Finish: ERROR No armor tail found\n"));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString endBoundary;
  rv = mSecondPartListener->GetEndLine(endBoundary);
  if (NS_FAILED(rv)) return rv;

  // Trim leading/trailing whitespace
  endBoundary.Trim(" \t\r\n", PR_TRUE, PR_TRUE);

  nsCAutoString temBoundary("--");
  temBoundary += mContentBoundary;
temBoundary += "--";

  if (!endBoundary.Equals(temBoundary)) {
    ERROR_LOG(("nsEnigMimeVerify::Finish: ERROR endBoundary=%s\n", endBoundary.get()));
    return NS_ERROR_FAILURE;
  }

  PRInt32 exitCode;
  PRUint32 statusFlags;

  nsString keyId;
  nsString userId;
  nsString sigDate;
  nsString errorMsg;
  nsString blockSeparation;

  nsCOMPtr<nsIEnigmail> enigmailSvc = do_GetService(NS_ENIGMAIL_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  PRUint32 uiFlags = nsIEnigmail::UI_PGP_MIME;
  PRBool verifyOnly = PR_TRUE;
  PRBool noOutput = PR_TRUE;

  rv = enigmailSvc->DecryptMessageEnd(uiFlags,
                                      outputLen,
                                      mPipeTrans,
                                      verifyOnly,
                                      noOutput,
                                      &statusFlags,
                                      getter_Copies(keyId),
                                      getter_Copies(userId),
                                      getter_Copies(sigDate),
                                      getter_Copies(errorMsg),
                                      getter_Copies(blockSeparation),
                                      &exitCode);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsISupports> securityInfo;
  if (mMsgWindow) {
    nsCOMPtr<nsIMsgHeaderSink> headerSink;
    mMsgWindow->GetMsgHeaderSink(getter_AddRefs(headerSink));
    if (headerSink)
        headerSink->GetSecurityInfo(getter_AddRefs(securityInfo));
  }

  DEBUG_LOG(("nsEnigMimeVerify::Finish: securityInfo=%p\n", securityInfo.get()));

  if (securityInfo) {
    nsCOMPtr<nsIEnigMimeHeaderSink> enigHeaderSink = do_QueryInterface(securityInfo);
    if (enigHeaderSink) {
      rv = enigHeaderSink->UpdateSecurityStatus(mURISpec, exitCode, statusFlags, keyId.get(), userId.get(), sigDate.get(), errorMsg.get(), blockSeparation.get());
    }
  }

  if (exitCode != 0) {
    DEBUG_LOG(("nsEnigMimeVerify::Finish: ERROR EXIT %d\n", exitCode));
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}


///////////////////////////////////////////////////////////////////////////////
// nsIRequestObserver methods
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsEnigMimeVerify::OnStartRequest(nsIRequest *aRequest,
                                   nsISupports *aContext)
{
  nsresult rv;

  mStartCount++;

  DEBUG_LOG(("nsEnigMimeVerify::OnStartRequest: %d\n", mStartCount));

  if (!mInitialized)
    return NS_ERROR_NOT_INITIALIZED;

  if (mStartCount > 2)
    return NS_ERROR_FAILURE;

  if (mStartCount == 2) {
    // Second start request
    nsCAutoString innerContentType;
    rv = mInnerMimeListener->GetContentType(innerContentType);
    if (NS_FAILED(rv)) return rv;

    if (!innerContentType.Equals("application/pgp-signature", CaseInsensitiveCompare)) {
      DEBUG_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR innerContentType=%s\n", innerContentType.get()));
      return NS_ERROR_FAILURE;
    }

    // Output Linebreak after signed content (IMPORTANT)
    rv = mInnerMimeListener->GetLinebreak(mLinebreak);
    if (NS_FAILED(rv)) return rv;

    if (mLinebreak.IsEmpty())
      return NS_ERROR_FAILURE;

    mPipeTrans->WriteSync(mLinebreak.get(), mLinebreak.Length());

    return NS_OK;
  }

  // First start request
  nsCAutoString contentType;
  rv = mOuterMimeListener->GetContentType(contentType);
  if (NS_FAILED(rv)) return rv;

  if (!contentType.Equals("multipart/signed", CaseInsensitiveCompare)) {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR contentType=%s\n", contentType.get()));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString contentProtocol;
  rv = mOuterMimeListener->GetContentProtocol(contentProtocol);
  if (NS_FAILED(rv)) return rv;

  if (!contentProtocol.Equals("application/pgp-signature", CaseInsensitiveCompare)) {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR contentProtocol=%s\n", contentProtocol.get()));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString contentMicalg;
  rv = mOuterMimeListener->GetContentMicalg(contentMicalg);
  if (NS_FAILED(rv)) return rv;

  nsCAutoString hashSymbol;
  if (contentMicalg.Equals("pgp-md5", CaseInsensitiveCompare)) {
    hashSymbol = "MD5";

  } else if (contentMicalg.Equals("pgp-sha1", CaseInsensitiveCompare)) {
    hashSymbol = "SHA1";

  } else if (contentMicalg.Equals("pgp-ripemd160", CaseInsensitiveCompare)) {
    hashSymbol = "RIPEMD160";

  } else if (contentMicalg.Equals("pgp-sha224", CaseInsensitiveCompare)) {
    hashSymbol = "SHA224";

  } else if (contentMicalg.Equals("pgp-sha256", CaseInsensitiveCompare)) {
    hashSymbol = "SHA256";

  } else if (contentMicalg.Equals("pgp-sha384", CaseInsensitiveCompare)) {
    hashSymbol = "SHA384";

  } else if (contentMicalg.Equals("pgp-sha512", CaseInsensitiveCompare)) {
    hashSymbol = "SHA512";

  } else {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR contentMicalg='%s'\n", contentMicalg.get()));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString linebreak;
  rv = mOuterMimeListener->GetLinebreak(linebreak);
  if (NS_FAILED(rv)) return rv;

  rv = mOuterMimeListener->GetContentBoundary(mContentBoundary);
  if (NS_FAILED(rv)) return rv;

  if (mContentBoundary.IsEmpty()) {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR no content boundary\n"));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString mimeSeparator("--");
  mimeSeparator += mContentBoundary;

  nsCAutoString startDelimiter;
  rv = mFirstPartListener->GetStartDelimiter(startDelimiter);
  if (NS_FAILED(rv)) return rv;

  if (!startDelimiter.Equals(mimeSeparator)) {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR startDelimiter=%s\n", startDelimiter.get()));
    return NS_ERROR_FAILURE;
  }

  nsCAutoString endBoundary;
  rv = mFirstPartListener->GetEndDelimiter(endBoundary);
  if (NS_FAILED(rv)) return rv;

  endBoundary.Trim(" \t\r\n", PR_TRUE, PR_TRUE);

  if (!endBoundary.Equals(mimeSeparator)) {
    ERROR_LOG(("nsEnigMimeVerify::OnStartRequest: ERROR endBoundary=%s\n", endBoundary.get()));
    return NS_ERROR_FAILURE;
  }

  // Initialize second part listener with content boundary
  rv = mSecondPartListener->Init(mInnerMimeListener,
                                 nsnull, "", mimeSeparator.get(),
                                 0, PR_FALSE, PR_FALSE, nsnull);
  if (NS_FAILED(rv)) return rv;


  // Create null buffer to capture verification output
  mOutBuffer = do_CreateInstance(NS_IPCBUFFER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  rv = mOutBuffer->Open(0, PR_FALSE);
  if (NS_FAILED(rv)) return rv;

  nsCOMPtr<nsIPrompt> prompter;
  if (mMsgWindow) {
    mMsgWindow->GetPromptDialog(getter_AddRefs(prompter));
  }

  DEBUG_LOG(("nsEnigMimeVerify::OnStartRequest: prompter=%p\n", prompter.get()));

  nsCOMPtr<nsIEnigmail> enigmailSvc = do_GetService(NS_ENIGMAIL_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  nsString errorMsg;
  PRBool verifyOnly = PR_TRUE;
  PRBool noOutput = PR_TRUE;
  PRBool noProxy = PR_TRUE;
  PRUint32 statusFlags;
  rv = enigmailSvc->DecryptMessageStart(nsnull,
                                        prompter,
                                        verifyOnly,
                                        noOutput,
                                        mOutBuffer,
                                        noProxy,
                                        &statusFlags,
                                        getter_Copies(errorMsg),
                                        getter_AddRefs(mPipeTrans) );
  if (NS_FAILED(rv)) return rv;

  if (!mPipeTrans) {
    nsCOMPtr<nsISupports> securityInfo;
    if (mMsgWindow) {
      nsCOMPtr<nsIMsgHeaderSink> headerSink;
      mMsgWindow->GetMsgHeaderSink(getter_AddRefs(headerSink));
      if (headerSink)
          headerSink->GetSecurityInfo(getter_AddRefs(securityInfo));
    }

    if (securityInfo) {
      nsCOMPtr<nsIEnigMimeHeaderSink> enigHeaderSink = do_QueryInterface(securityInfo);
      if (enigHeaderSink) {
        NS_NAMED_LITERAL_STRING(nullString, "");
        rv = enigHeaderSink->UpdateSecurityStatus(mURISpec, -1, statusFlags, nullString.get(), nullString.get(), nullString.get(), errorMsg.get(), nullString.get());
      }
    }

    return NS_ERROR_FAILURE;
  }

  // Write clearsigned message header
  const char* clearsignHeader = "-----BEGIN PGP SIGNED MESSAGE-----";

  rv = mPipeTrans->WriteSync(clearsignHeader, strlen(clearsignHeader));
  if (NS_FAILED(rv)) return rv;

  rv = mPipeTrans->WriteSync(linebreak.get(), linebreak.Length());
  if (NS_FAILED(rv)) return rv;

  // Write out hash symbol
  const char* hashHeader = "Hash: ";

  rv = mPipeTrans->WriteSync(hashHeader, strlen(hashHeader));
  if (NS_FAILED(rv)) return rv;

  rv = mPipeTrans->WriteSync(hashSymbol.get(), hashSymbol.Length());
  if (NS_FAILED(rv)) return rv;

  rv = mPipeTrans->WriteSync(linebreak.get(), linebreak.Length());
  if (NS_FAILED(rv)) return rv;

  rv = mPipeTrans->WriteSync(linebreak.get(), linebreak.Length());
  if (NS_FAILED(rv)) return rv;

  // Initialize for dash-escaping
  mLastLinebreak = PR_TRUE;

  return NS_OK;
}

NS_IMETHODIMP
nsEnigMimeVerify::OnStopRequest(nsIRequest* aRequest,
                                nsISupports* aContext,
                                nsresult aStatus)
{
  nsresult rv;
  DEBUG_LOG(("nsEnigMimeVerify::OnStopRequest:\n"));

  if (mRequestStopped)
    return NS_OK;

  if (!mInitialized || !mPipeTrans)
    return NS_ERROR_NOT_INITIALIZED;

  mRequestStopped = PR_TRUE;

  rv = mPipeTrans->CloseStdin();
  if (NS_FAILED(rv)) {
    Finalize();
    return rv;
  }

  rv = Finish();
  if (NS_FAILED(rv)) {
    Finalize();
    return rv;
  }

  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsIStreamListener method
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsEnigMimeVerify::OnDataAvailable(nsIRequest* aRequest,
                                  nsISupports* aContext,
                                  nsIInputStream *aInputStream,
                                  PRUint32 aSourceOffset,
                                  PRUint32 aLength)
{
  nsresult rv = NS_OK;

  DEBUG_LOG(("nsEnigMimeVerify::OnDataAvailable: %d\n", aLength));

  if (!mInitialized || !mPipeTrans)
    return NS_ERROR_NOT_INITIALIZED;

  const char* dashEscape = " -";
  char buf[kCharMax];
  PRUint32 readCount, readMax;

  while (aLength > 0) {
    readMax = (aLength < kCharMax) ? aLength : kCharMax;
    rv = aInputStream->Read((char *) buf, readMax, &readCount);
    if (NS_FAILED(rv)){
      DEBUG_LOG(("nsEnigMimeVerify::OnDataAvailable: Error in reading from input stream, %p\n", rv));
      return rv;
    }

    if (readCount <= 0) return NS_OK;

    if (mStartCount == 1) {
      // Dash escaping for first part only (RFC 2440)

      PRUint32 offset = 0;
      for (PRUint32 j=0; j < readCount; j++) {
        char ch = buf[j];
        if ((ch == '-') && mLastLinebreak) {
          rv = mPipeTrans->WriteSync(buf+offset, j-offset+1);
          if (NS_FAILED(rv)) return rv;
          offset = j+1;

          rv = mPipeTrans->WriteSync(dashEscape, strlen(dashEscape));
          if (NS_FAILED(rv)) return rv;

          DEBUG_LOG(("nsEnigMimeVerify::OnDataAvailable: DASH ESCAPED\n"));
        }

        mLastLinebreak = (ch == '\r') || (ch == '\n');
      }

      if (offset < readCount) {
        rv = mPipeTrans->WriteSync(buf+offset, readCount-offset);
        if (NS_FAILED(rv)) return rv;
      }

    } else {
      // No dash escaping
      rv = mPipeTrans->WriteSync(buf, readCount);
      if (NS_FAILED(rv)) return rv;
    }

    aLength -= readCount;
  }

  return NS_OK;
}
