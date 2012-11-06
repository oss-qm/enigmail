#!/bin/bash

set -e

BUILD_DIR="$1"
TARBALL="$2"
VERSION="$3"

ORIGDIR=$(pwd)

TMPDIR=$(mktemp -d)

TARBALL_ABSPATH=$(readlink -f "$TARBALL")
BUILDBASENAME=$(basename "$BUILD_DIR")

echo "Copy build env to $TMPDIR..."
cp -a "$BUILD_DIR" "$TMPDIR"
cd "$TMPDIR/$BUILDBASENAME"/extensions

echo "Unpack upstream..."
tar xzf "$TARBALL_ABSPATH"

cd ..
echo "Remove .bzr directory"
rm -fr .bzr

cd ..
NEWNAME="enigmail-$VERSION"
echo "renaming $BUILDBASENAME to $NEWNAME"
mv "$BUILDBASENAME" "$NEWNAME"

TARBALLPATH="$ORIGDIR/$NEWNAME.tar.gz"
echo "Creating $TARBALLPATH"
tar czf "$TARBALLPATH" "$NEWNAME"
