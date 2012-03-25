#!/bin/sh
set -e

DIRS="build
      config
      other-licenses/ply
      toolkit/mozapps/installer
      xpcom/idl-parser
      xpcom/typelib/xpt/tools"
EXCLUDES="build/mobile"
FILES="aclocal.m4
       allmakefiles.sh
       browser/config/version.txt
       configure.in
       extensions/build.mk
       extensions/Makefile.in
       ipc/app/defs.mk
       Makefile.in
       mfbt/Makefile.in
       netwerk/necko-config.h.in
       nsprpub/config/make-system-wrappers.pl
       probes/Makefile.in
       probes/mozilla-trace.d
       services/crypto/Makefile.in
       services/makefiles.sh
       services/Makefile.in
       services/sync/locales/Makefile.in
       services/sync/Makefile.in
       services/sync/tests/Makefile.in
       testing/testsuite-targets.mk
       toolkit/locales/l10n.mk
       toolkit/xre/make-platformini.py
       xpcom/xpcom-config.h.in
       xpcom/xpcom-private.h.in"
REPO="http://hg.mozilla.org/releases/mozilla-beta"

while getopts ":l:t:" opt ; do
    case $opt in
        l)
            LOCAL_REPO=$OPTARG
            ;;
        t)
            REPO_TAG=$OPTARG
            ;;
        :)
            echo "Option $OPTARG needs an argument"
            exit 1
            ;;
        \?)
            echo "Unrecognized option -- $OPTARG"
            exit 1
            ;;
    esac
done

if [ ! -z $LOCAL_REPO ] ; then
    SOURCE_REPO=$LOCAL_REPO
else
    SOURCE_REPO=$REPO
fi

hg clone $SOURCE_REPO tmp && cd tmp
if [ ! -z $REPO_TAG ] ; then
    hg update -r $REPO_TAG
else
    hg update
    REV=`hg summary | grep parent | sed 's/\([^[:space:]]*\)[[:space:]]*\([^[:space:]]*\)[[:space:]]*\(.*\)/\2/' | sed 's/\([^:]*\):*\([^:]*\)/\1/'`
    CHANGESET=`hg summary | grep parent | sed 's/\([^[:space:]]*\)[[:space:]]*\([^[:space:]]*\)[[:space:]]*\(.*\)/\2/' | sed 's/\([^:]*\):*\([^:]*\)/\2/'`
    BRANCH=`hg summary | grep branch | cut -d ' ' -f 2`
fi
cd ..

EXCLUDE_OPTS=""
for exclude in $EXCLUDES ; do
    EXCLUDE_OPTS=" --exclude $exclude $EXCLUDE_OPTS"
done

find . -maxdepth 1 ! -name tmp ! -name .bzr ! -name refresh-build-system.sh ! -name . | xargs rm -rf
(cd tmp && tar -cvh $EXCLUDE_OPTS -f - $DIRS $FILES) | (tar -xf -)
rm -rf tmp

bzr add *

if [ ! -z $REPO_TAG ] ; then
    COMMIT=$REPO_TAG
else
    COMMIT="${REV}:${CHANGESET} (${BRANCH})"
fi

bzr commit -m "Import from upstream - ${COMMIT}"
