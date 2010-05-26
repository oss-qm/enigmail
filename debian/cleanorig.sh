#!/bin/bash
#Written by Willi Mann, 2010
#Trivial script released into Public Domain

set -e 


UPVERSION=$( dpkg-parsechangelog | grep ^Version | sed -e 's/Version: \([0-9]:\)\([^-]*\)-.*/\2/' )

ORIGTARBALL=../enigmail_$UPVERSION.orig.tar.gz
ORIGTARBALLBAK=$ORIGTARBALL.bak
CURDIR=$( pwd ) 
ORIGTARBALLFULL=$CURDIR/$ORIGTARBALLBAK
ORIGTARBALLNEW=$CURDIR/$ORIGTARBALL
FILESTODELETE=$CURDIR/debian/clean
TMPDIR=$(mktemp -d)

mv $ORIGTARBALL $ORIGTARBALLBAK

cd $TMPDIR
tar xzvf $ORIGTARBALLFULL

ORIGPKGDIR=mozilla
PKGDIR=enigmail-$UPVERSION
if [ -d $ORIGPKGDIR ]; then
	mv $ORIGPKGDIR $PKGDIR
fi
cd $PKGDIR

cat $FILESTODELETE | xargs rm -fv

cd ..

tar czvf $ORIGTARBALLNEW $PKGDIR

cd $CURDIR

rm -fr $TMPDIR



