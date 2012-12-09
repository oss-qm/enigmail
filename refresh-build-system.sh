#!/bin/sh
set -e

DIRS="build
      config
      other-licenses/ply
      python/blessings
      python/mozbuild
      python/simplejson-2.1.1
      python/virtualenv
      testing/mozbase
      toolkit/mozapps/installer
      xpcom/idl-parser
      xpcom/typelib/xpt/tools"
EXCLUDES="build/mobile"
FILES="aclocal.m4
       allmakefiles.sh
       browser/config/version.txt
       configure.in
       extensions/build.mk
       ipc/app/defs.mk
       netwerk/necko-config.h.in
       nsprpub/config/make-system-wrappers.pl
       probes/mozilla-trace.d
       services/makefiles.sh
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

TMPDIR=`mktemp -d`
CWD=`pwd`

quilt pop -a

hg clone $SOURCE_REPO $TMPDIR && cd $TMPDIR
if [ ! -z $REPO_TAG ] ; then
    hg update -r $REPO_TAG
else
    hg update
    REV=`hg summary | grep parent | sed 's/\([^[:space:]]*\)[[:space:]]*\([^[:space:]]*\)[[:space:]]*\(.*\)/\2/' | sed 's/\([^:]*\):*\([^:]*\)/\1/'`
    CHANGESET=`hg summary | grep parent | sed 's/\([^[:space:]]*\)[[:space:]]*\([^[:space:]]*\)[[:space:]]*\(.*\)/\2/' | sed 's/\([^:]*\):*\([^:]*\)/\2/'`
    BRANCH=`hg summary | grep branch | cut -d ' ' -f 2`
fi
_MAKEFILES=`LIBXUL=1; . ./allmakefiles.sh; echo $MAKEFILES`
MAKEFILES=""
for file in $_MAKEFILES ; do
    MAKEFILES="$MAKEFILES $file.in"
done
cd $CWD

EXCLUDE_OPTS=""
for exclude in $EXCLUDES ; do
    EXCLUDE_OPTS=" --exclude $exclude $EXCLUDE_OPTS"
done

find . -maxdepth 1 ! -name .bzr ! -name refresh-build-system.sh ! -name patches ! -name configurehelper.sh ! -name . | xargs rm -rf
(cd $TMPDIR && tar -cvh $EXCLUDE_OPTS -f - $DIRS $FILES $MAKEFILES) | (tar -xf -)
rm -rf $TMPDIR

bzr add *

if [ -z $REPO_TAG ] ; then
    echo "Got ${REV}:${CHANGESET} (${BRANCH})"
fi

echo "Done! Please reapply patches and then bzr commit"
