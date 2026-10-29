# Bundled media tools: provenance and redistribution

The Windows installer must contain media tools built by `scripts/build-media-tools.sh`.
No end-user FFmpeg installation, PATH fallback, executable picker, or third-party binary download is used.

Pinned upstream source:

| Component | Revision | Source archive SHA-256 |
| --- | --- | --- |
| FFmpeg n7.1.5 | 3a0867c2bfda4a4d4309ca1a8cbdc6175e67f587 | 83220fe0807da10df19714176f02ec3d3812ef0e055f69e940d01b3ad1379cdb |
| x264 stable snapshot | 31e19f92f00c7003fa115047ce50978bc98c3a0d | d053c9d86988d6bc78237ca5205865c5ddf99c98ef4cd9927eec8f6d388f6dd9 |

Archives come from GitHub codeload for the official FFmpeg repository and the x264 mirror. The exact archive bytes were downloaded and hashed during implementation. Every Windows build checks those hashes before extraction. MSYS2 supplies the build toolchain; its signed package verification remains enabled. Build outputs have their own generated SHA-256 file; the output is not claimed bit-reproducible across toolchain versions. The CI log and `BUILD-CONFIGURATION.txt` record the toolchain/configuration.

FFmpeg itself is principally LGPL, but enabling the GPL x264 encoder makes these executable builds GPL. x264's included COPYING grants GPL version 2 or later; FFmpeg's GPL configuration and included license texts determine the actual terms. These are separate executable programs invoked through a constrained process boundary. Do not assume that all possible integrations or future libraries have identical licensing implications.

The installer includes **the exact corresponding source archives**, the complete configure/build script, upstream license files, FFmpeg's actual `-L` and `-version` output, and hashes in `media-tools/`. Retain these files when redistributing the installer or tools. Do not strip source/license resources to reduce installer size. Build scripts deliberately disable nonfree components, external network protocols, autodetected external libraries, and unnecessary codecs. Any change to enabled components requires a new review, source coverage, checksums and tests.

H.264/AAC use can be subject to patents or other jurisdiction/use-specific obligations independent of copyright licensing. This project does **not** claim universal patent clearance. No paid codec, signing service, or license subscription is purchased or enabled by the project.

The system FFmpeg used for Linux development tests is **not redistributed**. It is a distinct verification environment and does not establish that a Windows build or installer was produced. Distribution remains blocked until the source-built Windows tools, real conversion tests, notices/source packaging, and NSIS build have all succeeded for the tested commit.
