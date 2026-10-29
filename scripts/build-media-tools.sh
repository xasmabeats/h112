#!/usr/bin/env bash
# Run in the MSYS2 MINGW64 shell on Windows x64. No prebuilt third-party binaries.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${XASMA_MEDIA_BUILD_ROOT:-$(cygpath -u "${RUNNER_TEMP:-C:/Temp}")/xasma-media-build}"
PREFIX="$BUILD_ROOT/prefix"
DEST="$TASK_ROOT/src-tauri/resources/media-tools"
mkdir -p "$BUILD_ROOT" "$PREFIX" "$DEST/source"
cd "$BUILD_ROOT"
curl --fail --location --proto '=https' --tlsv1.2 https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/3a0867c2bfda4a4d4309ca1a8cbdc6175e67f587 -o ffmpeg-source.tar.gz
curl --fail --location --proto '=https' --tlsv1.2 https://codeload.github.com/mirror/x264/tar.gz/31e19f92f00c7003fa115047ce50978bc98c3a0d -o x264-source.tar.gz
printf '%s\n' '83220fe0807da10df19714176f02ec3d3812ef0e055f69e940d01b3ad1379cdb  ffmpeg-source.tar.gz' 'd053c9d86988d6bc78237ca5205865c5ddf99c98ef4cd9927eec8f6d388f6dd9  x264-source.tar.gz' | sha256sum --check --strict
tar -xzf ffmpeg-source.tar.gz
tar -xzf x264-source.tar.gz
cd x264-31e19f92f00c7003fa115047ce50978bc98c3a0d
./configure --prefix="$PREFIX" --enable-static --disable-cli --disable-opencl --bit-depth=8 --chroma-format=420
make -j2
make install
cd ../FFmpeg-3a0867c2bfda4a4d4309ca1a8cbdc6175e67f587
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
./configure --prefix="$PREFIX" --target-os=mingw32 --arch=x86_64 --cc=gcc --cxx=g++ \
  --disable-autodetect --disable-everything --disable-network --disable-nonfree \
  --disable-doc --disable-debug --disable-shared --enable-static --enable-small \
  --enable-gpl --enable-libx264 --enable-zlib --enable-ffmpeg --enable-ffprobe \
  --enable-avcodec --enable-avformat --enable-avfilter --enable-swscale --enable-swresample \
  --enable-protocol=file,pipe --enable-demuxer=mp3,wav,image2,image_png_pipe,image_jpeg_pipe,mov \
  --enable-decoder=mp3,mp3float,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,png,mjpeg,h264,aac \
  --enable-encoder=libx264,aac,pcm_s16le,wrapped_avframe \
  --enable-parser=mpegaudio,h264,aac,png,mjpeg \
  --enable-muxer=mp4,mov,mp3,null --enable-filter=scale,pad,setsar,format,anull,aresample \
  --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib -static -static-libgcc"
make -j2
cp ffmpeg.exe ffprobe.exe "$DEST/"
./ffmpeg.exe -version > "$DEST/BUILD-CONFIGURATION.txt"
./ffmpeg.exe -L > "$DEST/FFMPEG-LICENSE-OUTPUT.txt"
cp COPYING.GPLv2 COPYING.GPLv3 COPYING.LGPLv2.1 COPYING.LGPLv3 LICENSE.md "$DEST/"
cp ../x264-31e19f92f00c7003fa115047ce50978bc98c3a0d/COPYING "$DEST/X264-COPYING"
cp ../ffmpeg-source.tar.gz ../x264-source.tar.gz "$DEST/source/"
cp "$TASK_ROOT/scripts/build-media-tools.sh" "$DEST/source/"
cp "$TASK_ROOT/docs/FFMPEG-LICENSING.md" "$DEST/NOTICE.md"
mkdir -p "$DEST/TOOLCHAIN-LICENSES"
for license_package in zlib mingw-w64-crt mingw-w64-headers gcc-libs gcc; do
  if [ -d "/mingw64/share/licenses/$license_package" ]; then
    cp -R "/mingw64/share/licenses/$license_package" "$DEST/TOOLCHAIN-LICENSES/"
  fi
done
test -d "$DEST/TOOLCHAIN-LICENSES/zlib"
objdump -p ffmpeg.exe > "$DEST/DEPENDENCIES.txt"

cd "$DEST"
sha256sum ffmpeg.exe ffprobe.exe source/*.tar.gz > SHA256SUMS
# Fail closed if nonfree/network protocols or an unexpected GPL configuration slip in.
grep -q -- '--enable-gpl' BUILD-CONFIGURATION.txt
grep -q -- '--disable-nonfree' BUILD-CONFIGURATION.txt
if ./ffmpeg.exe -hide_banner -protocols | grep -Eq '^  (http|https|tcp|udp|tls|ftp)$'; then exit 1; fi
