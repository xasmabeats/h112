# Synthetic fixture

`synthetic-tone.mp3` is a two-second, 220 Hz test tone generated for this project, not user audio.

Generation: `ffmpeg -f lavfi -i sine=frequency=220:duration=2 -c:a libmp3lame -b:a 64k synthetic-tone.mp3`.
Native integration tests render it with the application icon as artwork using the exact media-tool executables supplied by the test environment. Windows CI supplies the bundled build.
