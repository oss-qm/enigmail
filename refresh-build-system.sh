#!/bin/sh
set -e

DIRS="browser/config config build other-licenses/ply toolkit/mozapps/installer xpcom/idl-parser xpcom/typelib/xpt/tools"
FILES="Makefile.in configure.in aclocal.m4 allmakefiles.sh toolkit/xre/make-platformini.py nsprpub/config/make-system-wrappers.pl extensions/Makefile.in extensions/build.mk ipc/app/defs.mk netwerk/necko-config.h.in probes/Makefile.in probes/mozilla-trace.d xpcom/xpcom-config.h.in xpcom/xpcom-private.h.in services/makefiles.sh services/Makefile.in services/crypto/Makefile.in services/sync/Makefile.in services/sync/locales/Makefile.in services/sync/tests/Makefile.in testing/testsuite-targets.mk toolkit/locales/l10n.mk"
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

(cd tmp && tar -cvhf - $DIRS $FILES) | (tar -xf -)
rm -rf tmp

bzr add *

if [ ! -z $REPO_TAG ] ; then
    COMMIT=$REPO_TAG
else
    COMMIT="${REV}:${CHANGESET} (${BRANCH})"
fi

bzr commit -m "Import from upstream - ${COMMIT}"
